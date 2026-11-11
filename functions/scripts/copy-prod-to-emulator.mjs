// Copia `products`, `catalogs` y `store_config` desde PRODUCCIÓN al emulador
// local de Firestore. Sirve para ver en el emulador los mismos datos reales que
// el usuario edita en la web/APK.
//
// Seguridad:
//   - Solo LEE de producción (Firestore REST + token de gcloud).
//   - Solo ESCRIBE en el emulador (127.0.0.1:8080 con `Bearer owner`).
//   - Aborta si el host de escritura no es local.
//
// Uso:
//   $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
//   node scripts/copy-prod-to-emulator.mjs
//
// Credencial: token de gcloud (`gcloud auth print-access-token`) o
// GOOGLE_ACCESS_TOKEN. No guarda nada en disco.

import { execSync } from "node:child_process";

const PROJECT = process.env.FIREBASE_PROJECT ?? "ventas-online-ec";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(EMULATOR_HOST)) {
  console.error(`Abortado: "${EMULATOR_HOST}" no parece un emulador local.`);
  console.error("Este script nunca escribe fuera de 127.0.0.1 / localhost.");
  process.exit(1);
}

const DOCS = "documents";
const PROD = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/${DOCS}`;
const EMU = `http://${EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/${DOCS}`;
const COLLECTIONS = ["products", "catalogs", "store_config"];

function accessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN.trim();
  try {
    const token = execSync("gcloud auth print-access-token", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!token) throw new Error("token vacío");
    return token;
  } catch {
    console.error("No pude obtener el token con gcloud.");
    console.error("Ejecuta `gcloud auth login` o exporta GOOGLE_ACCESS_TOKEN.");
    process.exit(1);
  }
}

const token = accessToken();

async function listProduction(collection) {
  const out = [];
  let pageToken = "";
  for (;;) {
    const url = new URL(`${PROD}/${collection}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        // El token de gcloud es de usuario y necesita proyecto de cuotas.
        "x-goog-user-project": PROJECT,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`leyendo ${collection} de producción: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = text ? JSON.parse(text) : {};
    out.push(...(json.documents ?? []));
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return out;
}

async function writeToEmulator(doc) {
  // doc.name = projects/{p}/databases/(default)/documents/{collection}/{id}
  // -> 7 segmentos: collection es el 6º (índice 5) e id el 7º (índice 6).
  const [, , , , , collection, id] = doc.name.split("/");
  const fields = doc.fields ?? {};
  const url = new URL(`${EMU}/${collection}/${encodeURIComponent(id)}`);
  // updateMask con todos los campos: así el documento queda idéntico y se
  // borran los campos que ya no existan en producción.
  for (const key of Object.keys(fields)) {
    url.searchParams.append("updateMask.fieldPaths", key);
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`escribiendo ${collection}/${id}: ${res.status} ${text.slice(0, 300)}`);
  }
}

for (const collection of COLLECTIONS) {
  const docs = await listProduction(collection);
  console.log(`Producción ${collection}: ${docs.length} documento(s)`);
  for (const doc of docs) {
    await writeToEmulator(doc);
  }
  console.log(`OK: ${collection} copiado al emulador`);
}

console.log(
  "\nListo. Reinicia la web del emulador o recarga la página para ver los datos reales.\n" +
    "Ojo: los pedidos y las visitas del emulador no se tocan."
);
