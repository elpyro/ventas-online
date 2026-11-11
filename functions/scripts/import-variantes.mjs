// Importa productos que en CELTOONS eran VARIANTES como productos simples.
//
// Diferencias con import-celtoons.mjs (el de ayer):
//   - NO borra nada: hace upsert por SKU (merge) sobre el catálogo existente.
//   - Solo toca los productos del archivo (una variante = un producto).
//   - No copia imágenes: reutiliza las URLs del producto padre.
//   - Precio: usa `precio_venta` del archivo (que ya viene con `precio_descuento`).
//
// Uso:
//   node scripts/import-variantes.mjs --dry            # revisar sin escribir
//   node scripts/import-variantes.mjs --yes            # escribir en producción
//   node scripts/import-variantes.mjs --yes --no-report
//
// Emulador:
//   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
//   node scripts/import-variantes.mjs --yes
//
// Producción: requiere ADC (`gcloud auth application-default login`) y `--yes`.

import fs from "node:fs";
import path from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const DRY = process.argv.includes("--dry");
const CONFIRMED = process.argv.includes("--yes");
const NO_REPORT = process.argv.includes("--no-report");

const inputPath =
  getArg("--file") ??
  path.resolve(import.meta.dirname, "data/productos-variantes-celtoons.json");
const projectId = getArg("--project") ?? process.env.SEED_PROJECT ?? "ventas-online-ec";
const CATALOG_ID = getArg("--catalog") ?? "tecnologiaymas";
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const REPORT_PATH = path.resolve(import.meta.dirname, "../../docs/migracion-variantes.md");

/** Igual que import-celtoons.mjs: MAYÚSCULAS sin tildes. */
function stripDiacritics(text) {
  return String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "");
}
function slugify(text) {
  return stripDiacritics(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Mismo criterio que la migración y el webhook: espacios y «/» → guiones. */
function normalizeSku(rawSku, productName) {
  const original = String(rawSku ?? "").trim();
  const reasons = [];
  let sku = original;

  if (!sku) {
    sku = slugify(productName) || "PRODUCTO";
    reasons.push("sin SKU → generado del nombre");
  } else {
    const dashed = sku.replace(/\s+/g, "-").replace(/\/+/g, "-");
    if (dashed !== sku) {
      reasons.push("espacios o «/» → guiones");
      sku = dashed;
    }
  }
  return { sku, reasons };
}

function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el archivo: ${inputPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const entries = Object.entries(payload.productos ?? {});
  if (entries.length === 0) throw new Error("El archivo no tiene productos.");

  const used = new Set();
  const changes = [];
  const stockFixes = [];
  const omitted = [];
  const docs = [];
  const porPadre = new Map();

  for (const [oldId, p] of entries) {
    const price = Number(p.precio_venta);
    if (!Number.isFinite(price) || price < 0) {
      omitted.push({ oldId, nombre: p.nombre, motivo: "precio inválido" });
      continue;
    }

    const name = String(p.nombre ?? "").trim();
    const { sku: baseSku, reasons } = normalizeSku(p.SKU, name);
    let sku = baseSku;
    let n = 2;
    while (used.has(sku)) sku = `${baseSku}-${n++}`;
    if (sku !== baseSku) reasons.push(`duplicado → sufijo "-${n - 1}"`);
    used.add(sku);
    if (reasons.length) {
      changes.push({ original: String(p.SKU ?? "").trim() || "(vacío)", final: sku, producto: name, motivo: reasons.join("; ") });
    }

    const stockRaw = Number(p.existencia) || 0;
    const stock = Math.max(0, Math.round(stockRaw));
    if (stockRaw < 0) stockFixes.push({ sku, producto: name, stock: stockRaw });

    const images = (Array.isArray(p.Imagenes) ? p.Imagenes : [])
      .map((u) => String(u ?? "").trim())
      .filter((u) => {
        try {
          new URL(u);
          return true;
        } catch {
          return false;
        }
      });

    const activo = p.visibilidad !== false;
    const doc = {
      sku,
      name,
      price: Math.round(price),
      stock,
      isAvailable: activo && stock > 0,
      images,
      ...(String(p.descripcion ?? "").trim() ? { description: String(p.descripcion).trim() } : {}),
    };

    docs.push({ doc, oldId, padre: p._origen?.producto ?? "(desconocido)", categoria: p.categoria ?? "" });

    const key = p._origen?.producto ?? "(desconocido)";
    const acc = porPadre.get(key) ?? { total: 0, stock: 0, sinStock: 0 };
    acc.total++;
    acc.stock += stock;
    if (stock === 0) acc.sinStock++;
    porPadre.set(key, acc);
  }

  console.log(`Archivo: ${inputPath}`);
  console.log(`Productos en el archivo: ${entries.length}`);
  console.log(`Listos para importar: ${docs.length} · omitidos: ${omitted.length}`);
  console.log(`SKUs generados/ajustados: ${changes.length} · stocks negativos → 0: ${stockFixes.length}`);
  console.log("");
  console.log("Por producto padre:");
  [...porPadre.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([nombre, acc]) =>
      console.log(
        `  ${String(acc.total).padStart(3)} productos · stock ${String(acc.stock).padStart(5)} · sin stock ${String(acc.sinStock).padStart(3)} · ${nombre}`
      )
    );
  console.log("");

  if (DRY) {
    for (const c of changes.slice(0, 40)) console.log(`  SKU ${c.original} → ${c.final} · ${c.producto} · ${c.motivo}`);
    if (changes.length > 40) console.log(`  … y ${changes.length - 40} más`);
    for (const s of stockFixes) console.log(`  stock ${s.stock} → 0 · ${s.sku} · ${s.producto}`);
    console.log("\nModo DRY: no se escribió nada.");
    return;
  }

  if (!firestoreEmulator && !CONFIRMED) {
    throw new Error("Escritura en PRODUCCIÓN bloqueada: agrega --yes para confirmar.");
  }

  return { docs, changes, stockFixes, omitted, porPadre };
}

/** Prefijo de reporte reutilizable: se escribe también en modo escritura. */
function buildReportHeader() {
  return [
    "# Migración de variantes CELTOONS → VentasOnline",
    "",
    `Fecha: ${new Date().toISOString()}`,
    `Origen: \`${path.basename(inputPath)}\``,
    `Destino: \`${projectId}\` · catálogo \`${CATALOG_ID}\``,
    "Regla: una variante = un producto simple. Los 8 productos padre se mantienen.",
    "Precio: `precio_descuento` del producto padre. Imágenes: reutilizadas.",
    "",
  ];
}

async function run() {
  const result = main();
  if (!result) return;

  const { docs, changes, stockFixes, omitted, porPadre } = result;

  const adcPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    path.join(process.env.APPDATA ?? process.env.USERPROFILE ?? "", "gcloud", "application_default_credentials.json");
  const hasAdc = fs.existsSync(adcPath);
  if (!firestoreEmulator && !hasAdc) {
    throw new Error("Falta ADC: corre `gcloud auth application-default login`.");
  }

  const app = initializeApp(hasAdc ? { credential: applicationDefault(), projectId } : { projectId });
  const db = getFirestore(app);

  const catalogRef = db.doc(`catalogs/${CATALOG_ID}`);
  const catalogSnap = await catalogRef.get();
  if (!catalogSnap.exists) {
    console.warn(`⚠ El catálogo ${CATALOG_ID} no existe en el destino. Los productos se escriben igual.`);
  }

  // ¿Nuevos o actualizados? Se consulta por lotes de 300 referencias.
  let existing = 0;
  for (let i = 0; i < docs.length; i += 300) {
    const refs = docs.slice(i, i + 300).map((d) => db.doc(`products/${d.doc.sku}`));
    const snaps = await db.getAll(...refs);
    existing += snaps.filter((s) => s.exists).length;
  }

  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const { doc } of docs.slice(i, i + 400)) {
      batch.set(
        db.doc(`products/${doc.sku}`),
        {
          ...doc,
          catalogIds: FieldValue.arrayUnion(CATALOG_ID),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  const totalEnCatalogo = await db
    .collection("products")
    .where("catalogIds", "array-contains", CATALOG_ID)
    .count()
    .get();

  console.log(`\nEscritos: ${docs.length} productos (${existing} actualizados · ${docs.length - existing} nuevos).`);
  console.log(`Productos en el catálogo ${CATALOG_ID}: ${totalEnCatalogo.data().count}`);

  if (!NO_REPORT) {
    const lines = [
      ...buildReportHeader(),
      "## Totales",
      "",
      `| Concepto | Valor |`,
      `| --- | --- |`,
      `| Productos escritos | ${docs.length} |`,
      `| Nuevos | ${docs.length - existing} |`,
      `| Actualizados | ${existing} |`,
      `| SKUs ajustados | ${changes.length} |`,
      `| Stocks negativos → 0 | ${stockFixes.length} |`,
      `| Omitidos | ${omitted.length} |`,
      `| Productos en el catálogo al terminar | ${totalEnCatalogo.data().count} |`,
      "",
      "## Por producto padre",
      "",
      "| Producto padre | Productos | Stock total | Sin stock |",
      "| --- | --- | --- | --- |",
      ...[...porPadre.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([nombre, acc]) => `| ${nombre} | ${acc.total} | ${acc.stock} | ${acc.sinStock} |`),
      "",
    ];
    if (changes.length) {
      lines.push(
        "## SKUs ajustados",
        "",
        "| SKU original | SKU final | Producto | Motivo |",
        "| --- | --- | --- | --- |",
        ...changes.map((c) => `| \`${c.original}\` | \`${c.final}\` | ${c.producto} | ${c.motivo} |`),
        ""
      );
    }
    if (stockFixes.length) {
      lines.push(
        "## Stocks negativos ajustados a 0",
        "",
        "| SKU | Producto | Stock original |",
        "| --- | --- | --- |",
        ...stockFixes.map((s) => `| \`${s.sku}\` | ${s.producto} | ${s.stock} |`),
        ""
      );
    }
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
    console.log(`Reporte: ${REPORT_PATH}`);
  }
}

run().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
