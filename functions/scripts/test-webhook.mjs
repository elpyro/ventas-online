const projectId = process.env.FIREBASE_PROJECT ?? "ventas-online-ec";
const url =
  process.env.WEBHOOK_URL ??
  `http://127.0.0.1:5001/${projectId}/us-central1/webhookSku`;
const secret = process.env.WEBHOOK_SECRET ?? "dev-secret";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const restBase = emulatorHost
  ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const validPayload = {
  sku: "TEST-SKU-001",
  name: "Producto de prueba webhook",
  price: 12.5,
  stock: 10,
  catalogIds: ["hogar"],
  images: ["https://picsum.photos/seed/test-webhook/600/400"],
  description: "Creado por test-webhook.mjs",
};

async function post(body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text };
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

  const unauthorized = await post(validPayload);
  check(
    "rechaza petición sin secret (401)",
    unauthorized.status === 401,
    `status ${unauthorized.status}: ${unauthorized.text}`
  );

  const invalid = await post({ name: "Sin SKU" }, {
    "x-webhook-secret": secret,
  });
  check(
    "rechaza petición sin sku (400)",
    invalid.status === 400,
    `status ${invalid.status}: ${invalid.text}`
  );

  const created = await post(validPayload, {
    "x-webhook-secret": secret,
  });
  check(
    "crea/actualiza producto (200)",
    created.status === 200,
    `status ${created.status}: ${created.text}`
  );

  if (created.status === 200) {
    const response = await fetch(`${restBase}/products/${validPayload.sku}`);
    check(
      "el producto existe en Firestore",
      response.ok,
      `status ${response.status}`
    );
    if (response.ok) {
      const document = await response.json();
      console.log("Documento:", JSON.stringify(document.fields, null, 2));
    }
  }

  // Actualización parcial: solo stock. No debe borrar el nombre ni el precio.
  const partial = await post(
    { sku: validPayload.sku, stock: 5 },
    { "x-webhook-secret": secret }
  );
  check(
    "acepta una actualización parcial (200)",
    partial.status === 200,
    `status ${partial.status}: ${partial.text}`
  );

  if (partial.status === 200) {
    const response = await fetch(`${restBase}/products/${validPayload.sku}`);
    const document = await response.json();
    check(
      "conserva el nombre al actualizar solo el stock",
      document.fields?.name?.stringValue === validPayload.name,
      `name: ${document.fields?.name?.stringValue}`
    );
    check(
      "actualiza el stock",
      document.fields?.stock?.integerValue === "5",
      `stock: ${document.fields?.stock?.integerValue}`
    );
    check(
      "recalcula isAvailable",
      document.fields?.isAvailable?.booleanValue === true,
      `isAvailable: ${document.fields?.isAvailable?.booleanValue}`
    );
  }
}

main().catch((error) => {
  console.error("Error probando el webhook:", error);
  process.exitCode = 1;
});
