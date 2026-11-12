// Pruebas del contrato de webhookSku.
//
// Por defecto apunta al emulador (dev-secret de functions/.env.local):
//   $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
//   npm --prefix functions run webhook:test
//
// Contra producción (escrituras mínimas: re-escribe el stock que el producto
// ya tiene y solo toca updatedAt):
//   $env:WEBHOOK_URL = "https://us-central1-ventas-online-ec.cloudfunctions.net/webhookSku"
//   $env:WEBHOOK_SECRET = "<secreto-real>"
//   $env:FIREBASE_PROJECT = "ventas-online-ec"
//   Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
//   npm --prefix functions run webhook:test
//
// El producto de prueba debe existir y contener al menos un guion (para
// probar la resolución de SKU con espacios); se cambia con WEBHOOK_TEST_SKU.

const projectId = process.env.FIREBASE_PROJECT ?? "ventas-online-ec";
const url =
  process.env.WEBHOOK_URL ??
  `http://127.0.0.1:5001/${projectId}/us-central1/webhookSku`;
const secret = process.env.WEBHOOK_SECRET ?? "dev-secret";
const testSku = process.env.WEBHOOK_TEST_SKU ?? "CABLE 21";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
// En producción la REST de Firestore pide token: se usa GOOGLE_ACCESS_TOKEN
// (o el que devuelva `gcloud auth print-access-token`).
const accessToken = (process.env.GOOGLE_ACCESS_TOKEN ?? "").trim();
const restBase = emulatorHost
  ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function post(body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function getDoc(sku) {
  const response = await fetch(
    `${restBase}/products/${encodeURIComponent(sku)}`,
    accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}
  );
  return {
    status: response.status,
    ok: response.ok,
    json: await response.json().catch(() => null),
  };
}

function check(name, condition, detail) {
  if (!condition) {
    console.error(`FALLO: ${name} -> ${detail}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ${name}`);
}

async function main() {
  console.log(`Webhook: ${url}`);
  console.log(`Producto de prueba: ${testSku}`);

  const unauthorized = await post({ sku: testSku });
  check(
    "rechaza petición sin secret (401)",
    unauthorized.status === 401,
    `status ${unauthorized.status}: ${unauthorized.text}`
  );

  const invalid = await post({ name: "Sin SKU" }, { "x-webhook-secret": secret });
  check(
    "rechaza petición sin sku (400)",
    invalid.status === 400,
    `status ${invalid.status}: ${invalid.text}`
  );

  // El webhook ya no crea productos: un SKU inexistente responde 404 y no
  // deja documento.
  const ghostSku = "TEST-SKU-INEXISTENTE";
  const ghost = await post(
    { sku: ghostSku, name: "Basura", price: 1 },
    { "x-webhook-secret": secret }
  );
  check(
    "rechaza SKU inexistente (404, no crea basura)",
    ghost.status === 404,
    `status ${ghost.status}: ${ghost.text}`
  );
  const ghostDoc = await getDoc(ghostSku);
  check(
    "no dejó documento del SKU inexistente",
    ghostDoc.status === 404,
    `status ${ghostDoc.status}`
  );

  const existing = await getDoc(testSku);
  if (!existing.ok) {
    console.log(
      `AVISO: ${testSku} no existe en el destino; se omiten las pruebas de escritura.`
    );
    console.log("(El webhook ya no crea productos: usa un SKU real o WEBHOOK_TEST_SKU).");
    return;
  }

  const fields = existing.json?.fields ?? {};
  const currentStock = Number(fields.stock?.integerValue ?? 0);
  const currentName = fields.name?.stringValue;
  const currentPrice = Number(
    fields.price?.doubleValue ?? fields.price?.integerValue ?? 0
  );
  const currentImage = fields.images?.arrayValue?.values?.[0]?.stringValue;

  // Actualización parcial "inocua": re-escribe el stock que ya tiene y manda
  // campos prohibidos (images/description), que deben ignorarse.
  const partial = await post(
    {
      sku: testSku,
      stock: currentStock,
      images: ["https://picsum.photos/seed/no-debe-cambiar/600/400"],
      description: "no debe escribirse",
      name: "NOMBRE QUE NO DEBE ESCRIBIRSE",
      price: 1,
    },
    { "x-webhook-secret": secret }
  );
  check(
    "acepta actualización parcial (200)",
    partial.status === 200,
    `status ${partial.status}: ${partial.text}`
  );

  const partialBody = partial.status === 200 ? JSON.parse(partial.text) : {};
  check(
    "reporta images como ignorado",
    Array.isArray(partialBody.ignored) && partialBody.ignored.includes("images"),
    `ignored: ${JSON.stringify(partialBody.ignored)}`
  );
  check(
    "reporta description como ignorado",
    Array.isArray(partialBody.ignored) && partialBody.ignored.includes("description"),
    `ignored: ${JSON.stringify(partialBody.ignored)}`
  );
  check(
    "reporta name como ignorado",
    Array.isArray(partialBody.ignored) && partialBody.ignored.includes("name"),
    `ignored: ${JSON.stringify(partialBody.ignored)}`
  );
  check(
    "reporta price como ignorado",
    Array.isArray(partialBody.ignored) && partialBody.ignored.includes("price"),
    `ignored: ${JSON.stringify(partialBody.ignored)}`
  );

  const after = await getDoc(testSku);
  const afterFields = after.json?.fields ?? {};
  check(
    "NO pisa el nombre (blindado)",
    afterFields.name?.stringValue === currentName,
    `name: ${afterFields.name?.stringValue}`
  );
  check(
    "NO pisa el precio (blindado)",
    Number(
      afterFields.price?.doubleValue ?? afterFields.price?.integerValue ?? 0
    ) === currentPrice,
    `price: ${JSON.stringify(afterFields.price)}`
  );
  check(
    "conserva el stock (re-escrito con el mismo valor)",
    Number(afterFields.stock?.integerValue) === currentStock,
    `stock: ${afterFields.stock?.integerValue}`
  );
  check(
    "NO pisa la primera imagen",
    afterFields.images?.arrayValue?.values?.[0]?.stringValue === currentImage,
    `images[0]: ${afterFields.images?.arrayValue?.values?.[0]?.stringValue}`
  );
  check(
    "NO escribe la descripción enviada",
    afterFields.description?.stringValue !== "no debe escribirse",
    `description: ${afterFields.description?.stringValue}`
  );

  // Normalización del SKU: los espacios SOLO se eliminan ("A 1" → "A1").
  // Si el SKU canónico tiene guiones, la variante con espacios se resuelve con
  // el respaldo de guiones (regla vieja, para lo que quedó de la migración).
  const half = Math.ceil(testSku.length / 2);
  const spaced = testSku.includes("-")
    ? testSku.replace(/-/g, " ")
    : `${testSku.slice(0, half)} ${testSku.slice(half)}`;
  const resolved = await post({ sku: spaced }, { "x-webhook-secret": secret });
  const resolvedBody = resolved.status === 200 ? JSON.parse(resolved.text) : {};
  console.log("spaced:", spaced);
  check(
    "resuelve SKU con espacios al real (200)",
    resolved.status === 200 && resolvedBody.sku === testSku,
    `status ${resolved.status}: ${resolved.text}`
  );
  check(
    "reporta resolvedFrom",
    resolvedBody.resolvedFrom === spaced,
    `resolvedFrom: ${JSON.stringify(resolvedBody.resolvedFrom)}, spaced: ${spaced}`
  );
  check(
    "normaliza quitando los espacios (no pone guion)",
    resolvedBody.normalized === spaced.replace(/\s+/g, ""),
    `normalized: ${JSON.stringify(resolvedBody.normalized)}, spaced: ${spaced}`
  );
}

main().catch((error) => {
  console.error("Error probando el webhook:", error);
  process.exitCode = 1;
});
