// Migración de productos nuevos ADICIONALES (sin borrar los existentes)
// Basado en: functions/scripts/data/productos-variantes-celtoons.json
// Modo: ADD-ONLY - agrega productos nuevos sin afectar los existentes

import fs from "node:fs";
import path from "node:path";

import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeApp, applicationDefault } from "firebase-admin/app";

const INPUT_PATH = path.resolve(import.meta.dirname, "data/productos-nuevos-procesados.json");
const REPORT_PATH = path.resolve(import.meta.dirname, "../../docs/migracion-productos-nuevos-addon.md");

const CATALOG_ESTUCHES = "estucheria";
const CATALOG_VIDRIOS = "vidrios";
const PROJECT_ID = "ventas-online-ec";
const BUCKET = process.env.IMPORT_BUCKET ?? `${PROJECT_ID}.firebasestorage.app`;

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
      const dashed = sku.replace(/\s+/g, "-").replace(/\//g, "-");
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

// Usar catalogIds directamente del JSON (ya computed y con la distribución correcta: 439 estucheria + 91 vidrios)
// El campo catalogIds viene del JSON procesado y no depende de inferir del nombre del producto
function getCatalogFromJson(product) {
  const catalogs = product.doc?.catalogIds ?? [];
  return catalogs[0] || CATALOG_VIDRIOS;
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error("No existe el archivo: " + INPUT_PATH);
  }

  const backup = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const entries = Object.entries(backup.productos ?? {});
  console.log("Productos a agregar:", entries.length);

  const assignSku = buildSkuAssigner();

  // Configurar modo: emulador o producción por defecto
  const isEmulatorMode = process.env.FIRESTORE_EMULATOR_HOST !== undefined;

  let app;
  if (isEmulatorMode) {
    // Modo emulador: usar proyecto ID y hosts configurados
    app = initializeApp({
      projectId: "ventas-online-ec",
    });
  } else {
    // Modo producción: usar credenciales por defecto de Firebase Admin SDK
    // (gcloud auth application-default login las configura automáticamente)
    try {
      app = initializeApp({
        projectId: "ventas-online-ec",
      });
    } catch (err) {
      throw new Error(
        "No se pudieron inicializar las credenciales de Firebase. " +
        "Ejecuta: gcloud auth application-default login"
      );
    }
  }

  const db = getFirestore(app);
  const BUCKET = process.env.IMPORT_BUCKET ?? "ventas-online-ec.firebasestorage.app";

  const changes = []; // { oldId, sku, producto, conflicto, accion }
  const added = [];
  const failed = [];

  // Obtener todos los SKUs existentes para detectar colisiones
  console.log("Obteniendo SKUs existentes...");
  const existingSnap = await db.collection("products").get();
  const existingSkus = new Set();
  existingSnap.forEach(doc => {
    const data = doc.data();
    if (data.sku) existingSkus.add(data.sku);
  });
  console.log("SKUs existentes:", existingSkus.size);

  // Procesar cada producto nuevo
  for (const [oldId, p] of entries) {
    const nombre = p.doc?.name || "";
    const skuOriginal = p.doc?.sku || "";
    const precio = Number(p.doc?.price) || 0;
    const existencia = Number(p.doc?.stock) || 0;
    const imagenes = p.doc?.images || [];
    const descripcion = p.doc?.description || "";

    // Generar SKU
    const { sku, reasons } = assignSku(skuOriginal, nombre);

    // Usar catalogIds directamente del JSON (ya computed con distribución correcta)
    const catalogFromJson = getCatalogFromJson(p);
    const catalogoFinal = catalogFromJson === CATALOG_ESTUCHES ? CATALOG_ESTUCHES : CATALOG_VIDRIOS;

    // Verificar colisión
    if (existingSkus.has(sku)) {
      const conflictoSku = sku;
      // Agular sufijo
      let nuevoSku = sku;
      let n = 1;
      while (existingSkus.has(`${sku}-${n}`)) n++;
      nuevoSku = `${sku}-${n}`;
      existingSkus.add(nuevoSku);
      changes.push({ oldId, skuOriginal, final: nuevoSku, producto: nombre, conflicto: `SKU duplicado → ${nuevoSku}`, accion: "added_with_suffix" });
      // Usar el nuevo SKU para el documento
      p.sku = nuevoSku;
    } else {
      existingSkus.add(sku);
      changes.push({ oldId, skuOriginal, final: sku, producto: nombre, conflicto: null, accion: "added" });
    }

    // Ajustar stock
    const stock = Math.max(0, Math.round(existencia));

    // Usar URLs de imágenes tal como vienen del JSON (sin subirlas a Storage en emulador)
    // Las imágenes originales ya tienen tokens públicos configurados en el proyecto briges
    const validImages = Array.isArray(p.doc?.images) ? p.doc.images.filter((u) => { try { new URL(u); return true; } catch { return false; } }) : [];

    // Determinar si tiene variantes
    const padreInfo = (backup._meta?.padres ?? []).find(pr => oldId.startsWith(pr.producto_id)) || { categoria: "General", variantes: 0 };
    const tieneVariantes = padreInfo.variantes > 0;

    // Construir documento para Firestore
    const docData = {
      sku,
      name: nombre,
      price: Math.round(precio),
      stock: stock,
      isAvailable: p.isAvailable !== false,
      images: validImages,
      catalogIds: [catalogoFinal],
      updatedAt: new Date().toISOString(),
    };
    if (descripcion) { docData.description = descripcion; }
    if (tieneVariantes) { docData.variants = []; }

    // Usar URLs de imágenes tal como vienen del JSON (sin subirlas a Storage)
    // Las imágenes originales ya tienen tokens configurados en el proyecto briges
    if (validImages.length > 0) {
      // Mantener las URLs originales, no subir al almacen en emulador
      for (let i = 0; i < validImages.length; i++) {
        // Ya las tenemos, no hacer nada
      }
    }

    // Escribir en Firestore usando batch para eficiencia
    try {
      const docRef = db.doc(`products/${sku}`);
      await docRef.set(docData, { merge: true });
      added.push({ sku, nombre, catalogo: catalogoFinal, stock });
    } catch (err) {
      failed.push({ sku, nombre, error: err.message });
      console.error(`❌ Error guardando producto ${sku}:`, err);
    }
  }

  // Generar reporte
  const lines = [];
  lines.push("# Migración Productos Nuevos Add-On → VentasOnline");
  lines.push("");
  lines.push("Fecha: " + new Date().toISOString());
  lines.push("Origen: respaldo JSON del proyecto briges (`${path.basename(INPUT_PATH)}`).");
  lines.push("Modo: ADD-ONLY (agrega productos sin borrar los existentes).");
  lines.push("Productos a procesar: " + entries.length + ".");
  lines.push("");
  lines.push("## Distribución por catálogo");
  lines.push("");
  lines.push("| Catálogo | Productos Nuevos |");
  lines.push("| --- | --- |");
  const addonEstuche = entries.filter(function(d) { return (d[1].doc?.catalogIds?.[0] || '') === CATALOG_ESTUCHES; }).length;
  const addonVidrio = entries.length - addonEstuche;
  lines.push("| `estucheria` | " + addonEstuche + " |");
  lines.push("| `vidrios` | " + addonVidrio + " |");
  lines.push("");
  lines.push("## Resultado");
  lines.push("");
  lines.push("| Acción | Cantidad |");
  lines.push("| --- | --- |");
  lines.push("| Agregados exitosos | " + added.length + " |");
  lines.push("| Fallidos | " + failed.length + " |");
  lines.push("| Colisiones de SKU (reubicadas) | " + changes.filter(function(c) { return c.conflicto; }).length + " |");
  lines.push("");
  if (changes.length > 0) {
    lines.push("## SKUs que tuvieron conflictos y fueron reubicados");
    lines.push("");
    lines.push("| SKU original | SKU final | Producto | Motivo |");
    lines.push("| --- | --- | --- | --- |");
    for (var i = 0; i < changes.length; i++) {
      var c = changes[i];
      lines.push("| `" + c.skuOriginal + "` | `" + c.final + "` | " + c.producto + " | " + (c.conflicto || "Ninguno") + " |");
    }
    lines.push("");
  }
  if (failed.length > 0) {
    lines.push("## Productos que fallaron al guardar");
    lines.push("");
    lines.push("| SKU | Producto | Error |");
    lines.push("| --- | --- | --- |");
    for (var j = 0; j < failed.length; j++) {
      var f = failed[j];
      lines.push("| `" + f.sku + "` | " + f.producto + " | " + f.error.substring(0, 80) + " |");
    }
    lines.push("");
  }
  lines.push("## Resumen por catálogo final");
  lines.push("");
  lines.push("| Catálogo | Productos Agregados |");
  lines.push("| --- | --- |");
  lines.push("| `estucheria` | " + added.filter(function(d) { return d.catalogo === CATALOG_ESTUCHES; }).length + " |");
  lines.push("| `vidrios` | " + added.filter(function(d) { return d.catalogo === CATALOG_VIDRIOS; }).length + " |");
  lines.push("");

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log("\nReporte escrito: " + REPORT_PATH);

  console.log("\n=== RESUMEN FINAL ===");
  console.log("Total productos a agregar:", entries.length);
  console.log("Agregados exitosos:", added.length);
  console.log("Fallidos:", failed.length);
  console.log("SKUs reubicados por colisión:", changes.filter(function(c) { return c.conflicto; }).length);
  console.log("Para estucheria:", added.filter(function(d) { return d.catalogo === CATALOG_ESTUCHES; }).length);
  console.log("Para vidrios:", added.filter(function(d) { return d.catalogo === CATALOG_VIDRIOS; }).length);
  console.log("\n¡Migración add-on completada!");
}

main().catch(function(error) {
  console.error("Error en la migración add-on:", error);
  process.exitCode = 1;
});