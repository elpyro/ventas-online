// Migración de productos simples nuevos (estucheria y vidrios)
// Basado en: functions/scripts/data/productos-variantes-celtoons.json

import fs from "node:fs";
import path from "node:path";

const INPUT_PATH = path.resolve(import.meta.dirname, "data/productos-variantes-celtoons.json");
const REPORT_PATH = path.resolve(import.meta.dirname, "../../docs/migracion-productos-nuevos.md");
const PROCESSED_PATH = path.resolve(import.meta.dirname, "../data/productos-nuevos-procesados.json");

const CATALOG_ESTUCHES = "estucheria";
const CATALOG_VIDRIOS = "vidrios";

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

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error("No existe el archivo: " + INPUT_PATH);
  }

  const backup = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const entries = Object.entries(backup.productos ?? {});
  console.log("Productos en el archivo:", entries.length);

  const assignSku = buildSkuAssigner();
  const changes = [];
  const stockFixes = [];
  const docs = [];

  const padresMap = new Map();
  (backup._meta?.padres ?? []).forEach(function(pr) {
    padresMap.set(pr.producto_id, { categoria: pr.categoria, nombre: pr.nombre, variantes: pr.variantes });
  });

  for (const [oldId, p] of entries) {
    const nombre = p.nombre || "";
    const skuOriginal = p.SKU || "";
    const precio = Number(p.precio_venta) || 0;
    const existencia = Number(p.existencia) || 0;
    const imagenes = Array.isArray(p.Imagenes) ? p.Imagenes : [];
    const descripcion = p.descripcion || "";

    const padreInfo = (function() {
      // Buscar padre por coincidencia parcial del ID (oldId tiene sufijo __xxxx)
      for (const [pid, info] of padresMap) {
        if (oldId.startsWith(pid)) return info;
      }
      // Fallback: deducir por nombre del producto
      const nombreUpper = (nombre ?? "").toUpperCase();
      if (nombreUpper.includes("ESTUCHE") || nombreUpper.includes("CASE") || nombreUpper.includes("SILICON")) return { categoria: "ESTUCHES", nombre: nombre, variantes: 0 };
      if (nombreUpper.includes("VIDRIO") || nombreUpper.includes("CERAMIC")) return { categoria: "VIDRIOS", nombre: nombre, variantes: 0 };
      return { categoria: "General", nombre: nombre, variantes: 0 };
    })();
    const categoriaPadre = padreInfo.categoria;
    const catalogoFinal = categoriaPadre === "ESTUCHES" ? CATALOG_ESTUCHES : CATALOG_VIDRIOS;

    const { sku, reasons } = assignSku(skuOriginal, nombre);
    if (reasons.length) changes.push({ original: skuOriginal || "(vacío)", final: sku, producto: nombre, motivo: reasons.join("; ") });

    const stockRaw = existencia;
    const stock = Math.max(0, Math.round(stockRaw));
    if (stockRaw < 0) stockFixes.push({ sku: sku, producto: nombre, stock: stockRaw });

    const validImages = imagenes.map(function(u) { return String(u ?? "").trim(); }).filter(function(u) {
      try { new URL(u); return true; } catch { return false; }
    });

    const tieneVariantes = padreInfo.variantes > 0;

    var doc = {
      sku: sku,
      name: nombre,
      price: Math.round(precio),
      stock: stock,
      isAvailable: p.visibilidad !== false,
      images: validImages,
      catalogIds: [catalogoFinal],
    };
    if (descripcion) { doc.description = descripcion; }
    if (tieneVariantes) { doc.variants = []; }

    docs.push({ doc: doc, oldId: oldId });
  }

  const withVariants = docs.filter(function(d) { return d.doc.variants; }).length;
  const withoutImages = docs.filter(function(d) { return d.doc.images.length === 0; }).length;

  console.log("\nTransformados:", docs.length, "productos (" + withVariants + " con variantes, " + withoutImages + " sin imagen).");
  console.log("SKUs modificados:", changes.length, "· stocks negativos ajustados:", stockFixes.length, "\n");

  console.log("=== SKUs modificados ===");
  for (var i = 0; i < changes.length; i++) {
    var c = changes[i];
    console.log("  " + (c.original || "(vacío)") + " → " + c.final + " · " + c.producto.substring(0, 30) + "..." + " · " + c.motivo);
  }

  console.log("\n=== Stocks negativos ajustados ===");
  for (var j = 0; j < stockFixes.length; j++) {
    var s = stockFixes[j];
    console.log("  stock " + s.stock + " → 0 · " + s.sku + " · " + s.producto.substring(0, 30) + "...");
  }

  // Generar reporte markdown
  var lines = [];
  lines.push("# Migración Productos Nuevos → VentasOnline");
  lines.push("");
  lines.push("Fecha: " + new Date().toISOString());
  lines.push("Origen: respaldo JSON del proyecto briges (`" + path.basename(INPUT_PATH) + "`).");
  lines.push("Destino: catálogos `" + CATALOG_ESTUCHES + "` y `" + CATALOG_VIDRIOS + "`. ");
  lines.push("Productos importados: " + docs.length + ".");
  lines.push("");
  lines.push("## Distribución por catálogo");
  lines.push("");
  lines.push("| Catálogo | Productos |");
  lines.push("| --- | --- |");
  lines.push("| `" + CATALOG_ESTUCHES + "` | " + docs.filter(function(d) { return d.doc.catalogIds.includes(CATALOG_ESTUCHES); }).length + " |");
  lines.push("| `" + CATALOG_VIDRIOS + "` | " + docs.filter(function(d) { return d.doc.catalogIds.includes(CATALOG_VIDRIOS); }).length + " |");
  lines.push("");
  lines.push("## SKUs modificados");
  lines.push("");
  lines.push("| SKU original | SKU final | Producto | Motivo |");
  lines.push("| --- | --- | --- | --- |");
  var changesHtml = "";
  for (var i = 0; i < changes.length; i++) {
    var c = changes[i];
    changesHtml += "| `" + c.original + "` | `" + c.final + "` | " + c.producto + " | " + c.motivo + " |";
  }
  lines.push(changesHtml);
  lines.push("");
  if (stockFixes.length) {
    lines.push("## Stocks negativos ajustados a 0");
    lines.push("");
    lines.push("| SKU | Producto | Stock original |");
    lines.push("| --- | --- | --- |");
    var stockHtml = "";
    for (var j = 0; j < stockFixes.length; j++) {
      var s = stockFixes[j];
      stockHtml += "| `" + s.sku + "` | " + s.producto + " | " + s.stock + " |";
    }
    lines.push(stockHtml);
    lines.push("");
  }

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log("Reporte escrito: " + REPORT_PATH);

  // Guardar datos procesados
  var output = {
    productos: docs,
    resumen: {
      total: docs.length,
      estucheria: docs.filter(function(d) { return d.doc.catalogIds.includes(CATALOG_ESTUCHES); }).length,
      vidrios: docs.filter(function(d) { return d.doc.catalogIds.includes(CATALOG_VIDRIOS); }).length
    }
  };
  var outputPath = path.resolve(import.meta.dirname, "data/productos-nuevos-procesados.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("Datos procesados guardados: " + outputPath);

  console.log("\n=== RESUMEN FINAL ===");
  console.log("Total productos:", docs.length);
  console.log("Estucheria (" + CATALOG_ESTUCHES + "):", output.resumen.estucheria);
  console.log("Vidrios (" + CATALOG_VIDRIOS + "):", output.resumen.vidrios);
  console.log("SKUs modificados:", changes.length);
  console.log("Stocks negativos ajustados:", stockFixes.length);
  console.log("\n¡Migración completada!");
}

main().catch(function(error) {
  console.error("Error en la migración:", error);
  process.exitCode = 1;
});