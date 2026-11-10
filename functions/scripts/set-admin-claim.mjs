// Asigna el custom claim `admin: true` a un usuario existente de Firebase
// Authentication. Es lo que exigen las reglas de Firestore / Storage y el
// login del APK admin.
//
// Uso:
//   node scripts/set-admin-claim.mjs <correo>
//
// Credencial: usa el token de gcloud de la máquina (`gcloud auth print-access-token`)
// o, si existe, la variable de entorno GOOGLE_ACCESS_TOKEN. No guarda nada en disco.
// Si el script rechaza el token por alcance insuficiente, crea ADC con
// `gcloud auth application-default login` y exporta GOOGLE_ACCESS_TOKEN=$(gcloud auth print-access-token).

import { execSync } from "node:child_process";

const projectId = process.env.FIREBASE_PROJECT ?? "ventas-online-ec";
const email = process.argv[2];

if (!email) {
  console.error("Uso: node scripts/set-admin-claim.mjs <correo>");
  process.exit(1);
}

function accessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN.trim();
  try {
    const token = execSync("gcloud auth print-access-token", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!token) throw new Error("token vacío");
    return token;
  } catch (e) {
    console.error("No pude obtener el token con gcloud.");
    console.error("Ejecuta `gcloud auth login` o exporta GOOGLE_ACCESS_TOKEN.");
    process.exit(1);
  }
}

const token = accessToken();
const base = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
// El token de gcloud viene con credenciales de usuario y necesita un proyecto
// de cuotas explícito; sin él la API responde 403.
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": projectId };

async function call(path, body) {
  const res = await fetch(`${base}/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    throw new Error(`${res.status} ${data.error?.message ?? text}`);
  }
  return data;
}

const lookup = await call("accounts:lookup", { email: [email] });
const user = lookup.users?.[0];
if (!user) {
  console.error(`No existe el usuario ${email} en ${projectId}.`);
  process.exit(1);
}
console.log(`uid: ${user.localId}`);

const current = JSON.parse(user.customAttributes ?? "{}");
if (current.admin === true) {
  console.log("El usuario ya tiene admin: true. Nada que hacer.");
  process.exit(0);
}

await call("accounts:update", {
  localId: user.localId,
  customAttributes: JSON.stringify({ ...current, admin: true }),
});

const verify = await call("accounts:lookup", { localId: [user.localId] });
const verified = JSON.parse(verify.users?.[0]?.customAttributes ?? "{}");

if (verified.admin === true) {
  console.log(`OK: claim admin: true asignado a ${email} en ${projectId}.`);
} else {
  console.log("El claim se escribió, pero no pude confirmarlo por la API.");
  console.log(`Respuesta: ${JSON.stringify(verified)}`);
}
console.log("El APK lo tomará en el próximo login (getIdTokenResult fuerza el refresco).");
