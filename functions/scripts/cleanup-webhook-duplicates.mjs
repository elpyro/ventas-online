// Limpieza de los productos duplicados que creó el webhook con envíos de una
// IA externa (SKUs que no coincidían con los reales: "CABLE 21" vs "CABLE-21").
//
// Qué borra:
//   - products SIN `catalogIds` escritos desde el 2026-11-10 (era del webhook)
//     y SIN variantes (los que tengan variantes se saltan y se reportan para
//     revisarlos a mano).
//   - TEST-SKU-001 (producto de prueba del test antiguo del webhook).
//
// Antes de borrar guarda un respaldo JSON con los documentos completos en
// backups/ (ignorado por git).
//
// Uso:
//   node scripts/cleanup-webhook-duplicates.mjs            # dry-run: solo reporta
//   node scripts/cleanup-webhook-duplicates.mjs --apply    # respalda y borra
//
// Contra producción requiere ADC (`gcloud auth application-default login`).

import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");

// Los duplicados empezaron con los envíos del webhook por IA el 2026-11-10.
const SINCE = new Date("2026-11-10T00:00:00Z");
const EXTRA_SKUS = ["TEST-SKU-001"];

const projectId = process.env.SEED_PROJECT ?? "ventas-online-ec";

const app = initializeApp({ projectId });
const db = getFirestore(app);

function toDate(value) {
  return value && typeof value.toDate === "function" ? value.toDate() : null;
}

async function main() {
  const snapshot = await db.collection("products").get();
  const toDelete = [];
  const skipped = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const updatedAt = toDate(data.updatedAt);
    const catalogs = Array.isArray(data.catalogIds) ? data.catalogIds.length : 0;
    const hasVariants = Array.isArray(data.variants) && data.variants.length > 0;

    if (EXTRA_SKUS.includes(doc.id)) {
      toDelete.push(doc);
      continue;
    }

    if (catalogs > 0) continue; // producto real de la tienda
    if (!updatedAt || updatedAt < SINCE) continue; // anterior a la era del webhook
    if (hasVariants) {
      skipped.push(`${doc.id} (tiene variantes)`);
      continue;
    }
    toDelete.push(doc);
  }

  console.log(`Proyecto: ${projectId}`);
  console.log(`Productos totales: ${snapshot.size}`);
  console.log(`A borrar: ${toDelete.length}`);
  console.log(
    `Saltados por revisar: ${skipped.length}${skipped.length ? ` → ${skipped.join(", ")}` : ""}`
  );

  const withSpace = toDelete.filter((d) => d.id.includes(" ")).length;
  console.log(`  (de los borrables, ${withSpace} tienen espacios en el SKU)`);
  if (toDelete.length > 0) {
    console.log("Muestra:", toDelete.slice(0, 10).map((d) => d.id).join(" | "));
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nada se borró. Ejecuta con --apply para respaldar y borrar.");
    return;
  }

  const backupDir = path.resolve(import.meta.dirname, "../../backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "webhook-duplicates-2026-11-11.json");
  const backup = {
    generatedAt: new Date().toISOString(),
    project: projectId,
    reason: "duplicados invisibles creados por envíos del webhook desde una IA externa",
    docs: toDelete.map((doc) => ({
      id: doc.id,
      data: JSON.parse(JSON.stringify(doc.data())),
    })),
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nRespaldo escrito: ${backupPath} (${toDelete.length} documentos)`);

  // collection().doc() trata el ID literal (sin parsear "/"), a diferencia de
  // db.doc("products/a/b").
  const ids = toDelete.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + 400)) {
      batch.delete(db.collection("products").doc(id));
    }
    await batch.commit();
  }
  console.log(`Borrados: ${ids.length}`);

  const after = await db.collection("products").count().get();
  console.log(`Productos restantes: ${after.data().count}`);
}

main().catch((error) => {
  console.error("Error en la limpieza:", error);
  process.exitCode = 1;
});
