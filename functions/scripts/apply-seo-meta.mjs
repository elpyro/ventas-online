// Aplica metadata SEO (home/store_config + catálogos visibles) con merge seguro.
// Uso:
//   node scripts/apply-seo-meta.mjs              → dry-run (solo imprime el diff)
//   node scripts/apply-seo-meta.mjs --write      → escribe en producción (requiere ADC)
// Antes de escribir exporta un respaldo JSON de los documentos actuales.

import fs from "node:fs";
import path from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.argv.includes("--project")
  ? process.argv[process.argv.indexOf("--project") + 1]
  : "ventas-online-ec";
const write = process.argv.includes("--write");
const adcPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  path.join(
    process.env.APPDATA ?? process.env.USERPROFILE ?? "",
    "gcloud",
    "application_default_credentials.json"
  );
const hasAdc = fs.existsSync(adcPath);
if (!hasAdc) {
  console.error("Falta ADC. Corre primero: gcloud auth application-default login");
  process.exit(1);
}

const NEW_STORE_CONFIG = {
  metaTitle: "CELTOONS | Distribuidor Mayorista de Accesorios en Bogotá",
  metaDescription:
    "Distribuidor mayorista de accesorios de celular y tecnología en Bogotá. Compra desde $200.000: envíos a toda Colombia, pago contra entrega.",
  slogan:
    "Distribuidor mayorista de accesorios de celular y tecnología en Bogotá, con envíos a toda Colombia",
  keywords: [
    "distribuidor mayorista de accesorios de celular",
    "tienda mayorista Bogotá",
    "accesorios de celular al por mayor",
    "distribuidor de tecnología Bogotá",
    "compras al por mayor en Colombia",
  ],
  privacyPolicyUrl: "https://celtoons.com/privacidad",
};

const NEW_FAQ = {
  question: "¿Dónde quedan ubicados?",
  answer:
    "Estamos en Bogotá, Colombia; atendemos por WhatsApp y despachamos a toda Colombia.",
};

const NEW_CATALOGS = {
  estucheria: {
    seoTitle: "Estuchería al por mayor en Bogotá",
    seoDescription:
      "Estuches, forros y carcasas al por mayor en Bogotá para celular y tablet. Envíos a toda Colombia y contra entrega.",
  },
  tecnologiaymas: {
    seoTitle: "Tecnología y accesorios al por mayor en Bogotá",
    seoDescription:
      "Tecnología al por mayor en Bogotá: parlantes, audífonos, cargadores y accesorios. Envíos a toda Colombia contra entrega.",
  },
  vidrios: {
    seoTitle: "Vidrios templados al por mayor",
    seoDescription:
      "Vidrios templados 5D, 9D y privacidad al por mayor para iPhone, Samsung y más. Bogotá y envíos a toda Colombia.",
  },
  bisuteria: {
    seoTitle: "Bisutería y accesorios al por mayor",
    seoDescription:
      "Bisutería, calcomanías y accesorios de moda al por mayor en Bogotá. Despachos a toda Colombia contra entrega.",
  },
  deportiva: {
    seoTitle: "Ropa deportiva al por mayor",
    seoDescription:
      "Biker, conjuntos y ropa deportiva al por mayor en Bogotá. Precios de distribuidor y envíos a toda Colombia.",
  },
};

const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

const backup = {};
const changes = [];

// ---- store_config/general ----
const storeRef = db.collection("store_config").doc("general");
const storeSnap = await storeRef.get();
if (!storeSnap.exists) {
  console.error("store_config/general no existe. Se aborta.");
  process.exit(1);
}
const store = storeSnap.data();
backup["store_config/general"] = store;

for (const [k, v] of Object.entries(NEW_STORE_CONFIG)) {
  if (store[k] !== v) changes.push({ doc: "store_config/general", field: k, from: store[k], to: v });
}
const currentFaqs = Array.isArray(store.faqs) ? store.faqs : [];
const hasFaq = currentFaqs.some((f) => f?.question === NEW_FAQ.question);
if (!hasFaq) changes.push({ doc: "store_config/general", field: "faqs", from: `${currentFaqs.length} preguntas`, to: `+ "${NEW_FAQ.question}"` });

// ---- catálogos visibles ----
const catalogDocs = {};
for (const [id, patch] of Object.entries(NEW_CATALOGS)) {
  const ref = db.collection("catalogs").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.warn(`catalogs/${id} no existe. Se omite.`);
    continue;
  }
  catalogDocs[id] = snap.data();
  backup[`catalogs/${id}`] = catalogDocs[id];
  for (const [k, v] of Object.entries(patch)) {
    if (catalogDocs[id][k] !== v) changes.push({ doc: `catalogs/${id}`, field: k, from: catalogDocs[id][k] ?? "", to: v });
  }
}

console.log("=== DRY RUN: cambios propuestos ===");
if (changes.length === 0) console.log("(nada por cambiar)");
for (const c of changes) {
  console.log(`\n[${c.doc}] ${c.field}\n  antes: ${JSON.stringify(c.from)}\n  después: ${JSON.stringify(c.to)}`);
}

const backupPath = path.join(
  process.cwd(),
  "backups",
  `seo-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`
);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nRespaldo escrito en: ${backupPath}`);

if (!write) {
  console.log("\nDry-run terminado. Repite con --write para aplicar en producción.");
  process.exit(0);
}

await storeRef.set(
  {
    ...NEW_STORE_CONFIG,
    faqs: hasFaq ? currentFaqs : [...currentFaqs, NEW_FAQ],
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);
for (const [id, patch] of Object.entries(NEW_CATALOGS)) {
  if (!catalogDocs[id]) continue;
  await db.collection("catalogs").doc(id).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
console.log("\nEscritura completada en producción.");
