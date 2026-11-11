// Re-apunta el campo `images` de productos a nuestras copias en Storage
// (products/{sku}/images/import-N.ext, en orden). Pensado para reparar
// productos cuyas URLs fueron pisadas por envíos del webhook.
//
// Uso:
//   node scripts/restore-product-images.mjs --skus ML5,ML6          # dry-run
//   node scripts/restore-product-images.mjs --skus ML5,ML6 --apply # escribe
//
// Contra producción requiere ADC. Si un SKU no tiene copias propias en
// Storage, se deja su `images` actual y se reporta.

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const APPLY = process.argv.includes("--apply");
const skusArg = getArg("--skus");
const projectId = process.env.SEED_PROJECT ?? "ventas-online-ec";
const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

if (!skusArg) {
  console.error("Falta --skus (lista separada por comas).");
  process.exit(1);
}
const skus = skusArg.split(",").map((s) => s.trim()).filter(Boolean);

const app = initializeApp({ projectId });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

/** Mismo formato de URL que usan la migración y el APK al subir fotos. */
function storageUrl(destPath, token) {
  const host = storageEmulator
    ? `http://${storageEmulator}`
    : "https://firebasestorage.googleapis.com";
  return `${host}/v0/b/${bucket.name}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
}

/** Ordena import-1, import-2, … import-10 correctamente (no alfabético). */
function importIndex(name) {
  const match = /import-(\d+)\./.exec(name);
  return match ? Number(match[1]) : 9999;
}

async function urlsFor(sku) {
  const [files] = await bucket.getFiles({ prefix: `products/${sku}/images/` });
  const sorted = files
    .filter((f) => /import-\d+\./.test(f.name))
    .sort((a, b) => importIndex(a.name) - importIndex(b.name));
  const urls = [];
  for (const file of sorted) {
    const [meta] = await file.getMetadata();
    const token = meta.metadata?.firebaseStorageDownloadTokens;
    if (!token) {
      console.log(`  AVISO: ${file.name} no tiene token de descarga; se omite.`);
      continue;
    }
    urls.push(storageUrl(file.name, token.split(",")[0]));
  }
  return urls;
}

async function main() {
  for (const sku of skus) {
    const snap = await db.collection("products").doc(sku).get();
    if (!snap.exists) {
      console.log(`${sku}: NO EXISTE, se salta.`);
      continue;
    }
    const current = snap.data().images ?? [];
    const urls = await urlsFor(sku);
    if (urls.length === 0) {
      console.log(
        `${sku}: sin copias propias en Storage; se deja su images actual (${current.length} URL(s)).`
      );
      continue;
    }
    console.log(`${sku}: ${current.length} URL(s) actual(es) → ${urls.length} copia(s) propia(s)`);
    for (const u of urls) console.log(`   ${u}`);
    if (APPLY) {
      await snap.ref.update({ images: urls });
      console.log("   → ESCRITO");
    }
  }
  if (!APPLY) console.log("\nDRY-RUN: nada se escribió. Usa --apply para escribir.");
}

main().catch((error) => {
  console.error("Error restaurando imágenes:", error);
  process.exitCode = 1;
});
