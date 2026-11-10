import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { catalogs, products, storeConfig } from "./seed-data.mjs";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const projectId =
  getArg("--project") ?? process.env.SEED_PROJECT ?? "ventas-online-ec";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

// Firestore reconoce applicationDefault() tanto en producción como en el
// emulador. En el emulador no se llega a usar el token.
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

async function main() {
  const target = emulatorHost
    ? `emulador (${emulatorHost})`
    : "producción";
  console.log(`Sembrando ${projectId} en ${target}...`);

  const batch = db.batch();

  batch.set(
    db.doc("store_config/general"),
    { ...storeConfig, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  for (const catalog of catalogs) {
    const { id, data } = catalog;
    batch.set(
      db.doc(`catalogs/${id}`),
      { ...data, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  for (const product of products) {
    batch.set(
      db.doc(`products/${product.sku}`),
      { ...product, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  await batch.commit();

  console.log(
    `OK: 1 config, ${catalogs.length} catálogos y ${products.length} productos.`
  );
  console.log(
    "Productos: " + products.map((product) => product.sku).join(", ")
  );
}

main().catch((error) => {
  console.error("Error sembrando Firestore:", error);
  process.exitCode = 1;
});
