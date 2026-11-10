// Migración del catálogo CELTOONS (respaldo JSON del proyecto briges) a VentasOnline.
//
// Qué hace:
//   1. Borra TODOS los documentos de `products` del destino (emulador o producción).
//   2. Crea/actualiza el catálogo `tecnologiaymas`; todos los productos van ahí.
//   3. Importa los productos:
//      - precio: SOLO `precio_venta` del respaldo.
//      - stock: `existencia`; los negativos se ajustan a 0 (igual que las variantes).
//      - SKU: los espacios se vuelven guiones; los vacíos se generan del nombre;
//        los duplicados reciben sufijo -2, -3… Cada cambio queda en el reporte.
//      - imágenes: se copian a nuestro Storage (products/{sku}/images/…) con token
//        de descarga. Si una descarga falla, se conserva la URL vieja.
//      - variantes: la talla lleva el nombre del modelo (ej. "SAMSUNG A57") porque
//        la ficha muestra chips por talla/color; el precio de variante solo se
//        guarda si difiere del precio del producto.
//      - catálogo: si `tecnologiaymas` ya existe en el destino (creado desde el
//        APK), se conserva sin tocar; solo se crea si falta.
//
// Uso:
//   node scripts/import-celtoons.mjs --dry     # resumen sin escribir nada
//   node scripts/import-celtoons.mjs           # ejecuta
//   node scripts/import-celtoons.mjs --skip-images   # sin copiar fotos
//
// Contra los emuladores (deben estar corriendo):
//   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
//   $env:FIREBASE_STORAGE_EMULATOR_HOST="127.0.0.1:9199"
//   node scripts/import-celtoons.mjs
//
// Contra producción: requiere ADC (`gcloud auth application-default login`)
// y confirmación explícita del usuario (borra todos los productos actuales).

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const DRY = process.argv.includes("--dry");
const SKIP_IMAGES = process.argv.includes("--skip-images");
const inputPath = getArg("--file") ?? "C:\\Users\\eloy_\\respado firebase briges\\Tiendas_CELTOONS_Productos.json";
const projectId = getArg("--project") ?? process.env.SEED_PROJECT ?? "ventas-online-ec";
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

const CATALOG_ID = "tecnologiaymas";
const CATALOG_TITLE = "Tecnología";
const BUCKET = process.env.IMPORT_BUCKET ?? `${projectId}.firebasestorage.app`;
const REPORT_PATH = path.resolve(import.meta.dirname, "../../docs/migracion-celtoons.md");

// Colores conocidos → hex para el círculo de color de la ficha web.
// Mismos valores que usa `functions/scripts/seed-data.mjs`.
const COLOR_HEX = {
  negro: "#111111",
  blanco: "#f8fafc",
  azul: "#2563eb",
  rojo: "#dc2626",
  verde: "#16a34a",
  amarillo: "#eab308",
  morado: "#7c3aed",
  mora: "#7c3aed",
  rosado: "#f472b6",
  gris: "#6b7280",
  cafe: "#92400e",
};

function stripDiacritics(text) {
  return String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "");
}

/** Slug en MAYÚSCULAS sin tildes: "LICUADORA PORTÁTIL" → "LICUADORA-PORTATIL". */
function slugify(text) {
  return stripDiacritics(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** SKU definitivo + motivos del cambio (para el reporte que pide el dueño). */
function buildSkuAssigner() {
  const used = new Set();
  return function assign(rawSku, productName) {
    const original = String(rawSku ?? "").trim();
    const reasons = [];
    let sku = original;

    if (!sku) {
      sku = slugify(productName) || "PRODUCTO";
      reasons.push("SKU vacío → generado del nombre");
    } else {
      const dashed = sku.replace(/\s+/g, "-").replace(/\/+/g, "-");
      if (dashed !== sku) {
        reasons.push("espacios o «/» reemplazados por guiones");
        sku = dashed;
      }
    }

    let unique = sku;
    let n = 2;
    while (used.has(unique)) unique = `${sku}-${n++}`;
    if (unique !== sku) reasons.push(`duplicado → sufijo "-${n - 1}"`);
    used.add(unique);
    return { sku: unique, reasons };
  };
}

function mapVariantes(rawList, productPrice) {
  const variants = [];
  const list = Array.isArray(rawList) ? rawList : [];
  for (const v of list) {
    if (!v || v.activo === false) continue;
    const stock = Math.max(0, Math.round(Number(v.cantidad) || 0));
    const color = String(v.color ?? "").trim();
    const talla = String(v.talla ?? "").trim();
    // El respaldo guarda el modelo del celular en `nombre`; la ficha de la web
    // muestra chips de talla/color, así que el modelo va como talla.
    const size = talla || String(v.nombre ?? "").trim() || undefined;

    const variant = {
      id: String(v.variante_id ?? "").trim() || slugify(v.nombre) || `v-${variants.length + 1}`,
      stock,
    };
    if (color) {
      variant.color = color;
      const hex = COLOR_HEX[color.toLowerCase()];
      if (hex) variant.colorHex = hex;
    }
    if (size) variant.size = size;

    // El precio de la variante solo si difiere del producto (createOrder usa
    // el del producto como respaldo cuando la variante no trae precio).
    const price = Number(v.precio);
    if (Number.isFinite(price) && price > 0 && price !== productPrice) {
      variant.price = Math.round(price);
    }
    variants.push(variant);
  }
  return variants;
}

function extFromUrl(url) {
  try {
    const last = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
    return /^[a-z0-9]{2,5}$/.test(last) ? last : "jpg";
  } catch {
    return "jpg";
  }
}

function contentTypeFor(ext, header) {
  if (header && header.startsWith("image/")) return header.split(";")[0];
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] ?? "image/jpeg";
}

/** URL de descarga con token: el mismo formato que genera el APK al subir fotos. */
function storageUrl(destPath, token) {
  const host = storageEmulator
    ? `http://${storageEmulator}`
    : "https://firebasestorage.googleapis.com";
  return `${host}/v0/b/${BUCKET}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
}

async function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el archivo de respaldo: ${inputPath}`);
  }
  const backup = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const entries = Object.entries(backup.productos ?? {});
  if (entries.length === 0) throw new Error("El respaldo no tiene productos.");

  const target = firestoreEmulator ? `emulador (${firestoreEmulator})` : "PRODUCCIÓN";
  console.log(`Origen: ${inputPath}`);
  console.log(`Destino: ${projectId} (${target}) — catálogo "${CATALOG_TITLE}" (${CATALOG_ID})`);
  console.log(`Productos en el respaldo: ${entries.length}`);
  console.log(DRY ? "Modo DRY: solo análisis, no se escribe nada.\n" : "\n");

  const assignSku = buildSkuAssigner();
  const changes = []; // { original, final, producto, motivo }
  const stockFixes = []; // { sku, producto, stock }
  const failedImages = []; // { sku, url, error }
  const docs = [];

  for (const [oldId, p] of entries) {
    const price = Number(p.precio_venta);
    if (!Number.isFinite(price) || price < 0) {
      console.warn(`  ⚠ "${p.nombre}" (${oldId}) sin precio_venta válido: OMITIDO`);
      continue;
    }
    const { sku, reasons } = assignSku(p.SKU, p.nombre);
    if (reasons.length) changes.push({ original: String(p.SKU ?? "").trim() || "(vacío)", final: sku, producto: p.nombre, motivo: reasons.join("; ") });

    const stockRaw = Number(p.existencia) || 0;
    const stock = Math.max(0, Math.round(stockRaw));
    if (stockRaw < 0) stockFixes.push({ sku, producto: p.nombre, stock: stockRaw });

    const variants = mapVariantes(p.variantes, price);
    // Producto con variantes: el stock total es la suma (createOrder lo recalcula así).
    const totalStock = variants.length ? variants.reduce((s, v) => s + v.stock, 0) : stock;

    const validImages = (Array.isArray(p.Imagenes) ? p.Imagenes : [])
      .map((u) => String(u ?? "").trim())
      .filter((u) => { try { new URL(u); return true; } catch { return false; } });

    const doc = {
      sku,
      name: String(p.nombre ?? "").trim(),
      price: Math.round(price),
      stock: totalStock,
      isAvailable: p.visibilidad !== false,
      images: validImages,
      catalogIds: [CATALOG_ID],
      ...(String(p.descripcion ?? "").trim() ? { description: String(p.descripcion).trim() } : {}),
      ...(variants.length ? { variants } : {}),
    };
    docs.push({ doc, oldId });
  }

  const withVariants = docs.filter((d) => d.doc.variants).length;
  const withoutImages = docs.filter((d) => d.doc.images.length === 0).length;
  console.log(`Transformados: ${docs.length} productos (${withVariants} con variantes, ${withoutImages} sin imagen).`);
  console.log(`SKUs modificados: ${changes.length} · stocks negativos ajustados: ${stockFixes.length}\n`);

  if (DRY) {
    for (const c of changes) console.log(`  ${c.original || "(vacío)"} → ${c.final} · ${c.producto} · ${c.motivo}`);
    for (const s of stockFixes) console.log(`  stock ${s.stock} → 0 · ${s.sku} · ${s.producto}`);
    return;
  }

  // --- Conexión (ADC solo si existe: en emulador no hace falta) ---
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    path.join(process.env.APPDATA ?? process.env.USERPROFILE ?? "", "gcloud", "application_default_credentials.json");
  const hasAdc = fs.existsSync(adcPath);
  if (!firestoreEmulator && !hasAdc) {
    throw new Error(
      "Se intentó escribir en PRODUCCIÓN sin credenciales ADC. " +
        "Corre primero: gcloud auth application-default login"
    );
  }
  const app = initializeApp(
    hasAdc ? { credential: applicationDefault(), projectId } : { projectId },
  );
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);

  // 1) Borrar TODOS los productos actuales del destino.
  const existing = await db.collection("products").get();
  const deletedIds = existing.docs.map((d) => d.id);
  for (let i = 0; i < deletedIds.length; i += 400) {
    const batch = db.batch();
    for (const id of deletedIds.slice(i, i + 400)) batch.delete(db.doc(`products/${id}`));
    await batch.commit();
  }
  console.log(`Productos borrados antes de importar: ${deletedIds.length}${deletedIds.length ? ` (${deletedIds.join(", ")})` : ""}`);

  // 2) Copiar imágenes a nuestro Storage (con reintentos suaves por imagen).
  let copied = 0;
  let kept = 0;
  if (!SKIP_IMAGES) {
    console.log("Copiando imágenes…");
    const queue = [];
    for (const { doc } of docs) {
      doc.images.forEach((url, index) => queue.push({ sku: doc.sku, url, index }));
    }
    const pool = 6;
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const job = queue[cursor++];
        try {
          const res = await fetch(job.url, { signal: AbortSignal.timeout(45000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());
          const ext = extFromUrl(job.url);
          const dest = `products/${job.sku}/images/import-${job.index + 1}.${ext}`;
          const token = randomUUID();
          await bucket.file(dest).save(buffer, {
            resumable: false,
            metadata: {
              contentType: contentTypeFor(ext, res.headers.get("content-type")),
              metadata: { firebaseStorageDownloadTokens: token },
            },
          });
          job.newUrl = storageUrl(dest, token);
          copied++;
        } catch (error) {
          // Se conserva la URL del proyecto viejo para no perder la foto.
          failedImages.push({ sku: job.sku, url: job.url, error: String(error.message ?? error) });
          kept++;
        }
      }
    }
    await Promise.all(Array.from({ length: pool }, worker));
    // Reemplazar cada URL copiada manteniendo el orden original del producto.
    const copiedBySkuIndex = new Map();
    for (const q of queue) {
      if (q.newUrl) copiedBySkuIndex.set(`${q.sku}#${q.index}`, q.newUrl);
    }
    for (const { doc } of docs) {
      doc.images = doc.images.map((oldUrl, i) => copiedBySkuIndex.get(`${doc.sku}#${i}`) ?? oldUrl);
    }
    console.log(`Imágenes copiadas: ${copied} · fallidas (quedaron con URL vieja): ${kept}`);
  }

  // 3) Catálogo: si ya existe en el destino (p. ej. creado desde el APK con su
  // propia portada), no se toca. Solo se crea si falta.
  const catalogRef = db.doc(`catalogs/${CATALOG_ID}`);
  const existingCatalog = await catalogRef.get();
  if (existingCatalog.exists) {
    console.log(`Catálogo ${CATALOG_ID}: ya existe, se conserva tal cual (edítalo desde el APK).`);
  } else {
    await catalogRef.set(
      {
        title: CATALOG_TITLE,
        coverImage: "",
        isActive: true,
        isVisible: true,
        minOrderSubtotal: 0,
        priority: 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`Catálogo ${CATALOG_ID} creado.`);
  }
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const { doc } of docs.slice(i, i + 400)) {
      batch.set(db.doc(`products/${doc.sku}`), { ...doc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
  console.log(`Escritos: 1 catálogo (${CATALOG_ID}) y ${docs.length} productos.`);

  // 5) Reporte de cambios (SKUs modificados, stocks y fotos con respaldo).
  const lines = [
    "# Migración CELTOONS → VentasOnline",
    "",
    `Fecha: ${new Date().toISOString()}`,
    `Origen: respaldo JSON del proyecto briges (\`${path.basename(inputPath)}\`).`,
    `Destino: \`${projectId}\` · catálogo **${CATALOG_TITLE}** (\`${CATALOG_ID}\`).`,
    `Productos importados: ${docs.length}. Precios: \`precio_venta\` del respaldo.`,
    "",
    "## SKUs modificados",
    "",
    `${changes.length} de ${docs.length} productos cambiaron de SKU:`,
    "",
    "| SKU original | SKU final | Producto | Motivo |",
    "| --- | --- | --- | --- |",
    ...changes.map((c) => `| \`${c.original}\` | \`${c.final}\` | ${c.producto} | ${c.motivo} |`),
    "",
  ];
  if (stockFixes.length) {
    lines.push(
      "## Stocks negativos ajustados a 0",
      "",
      "| SKU | Producto | Stock original |",
      "| --- | --- | --- |",
      ...stockFixes.map((s) => `| \`${s.sku}\` | ${s.producto} | ${s.stock} |`),
      "",
    );
  }
  if (failedImages.length) {
    lines.push(
      "## Imágenes que quedaron con la URL del proyecto viejo",
      "",
      "La descarga falló y se conservó la URL original de briges:",
      "",
      "| SKU | Error |",
      "| --- | --- |",
      ...failedImages.map((f) => `| \`${f.sku}\` | ${f.error} |`),
      "",
    );
  }
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`Reporte escrito: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error("Error en la migración:", error);
  process.exitCode = 1;
});
