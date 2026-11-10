// Prueba de compra de punta a punta contra el emulador.
// Uso: WEB_URL=http://localhost:3001 node scripts/e2e-purchase.mjs
import { chromium } from "playwright-core";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001";
const PROJECT = process.env.FIREBASE_PROJECT ?? "ventas-online-ec";
const FS_BASE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function check(condition, message, detail = "") {
  if (!condition) {
    throw new Error(`FALLO: ${message}${detail ? ` -> ${detail}` : ""}`);
  }
  console.log(`OK: ${message}`);
}

function valueOf(field) {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("arrayValue" in field) {
    return (field.arrayValue.values ?? []).map(valueOf);
  }
  return undefined;
}

async function getDocument(path) {
  const response = await fetch(`${FS_BASE}/${path}`);
  if (!response.ok) return null;
  return response.json();
}

async function callGetOrderDetails(orderId, customerPhone) {
  const url = `http://127.0.0.1:5001/${PROJECT}/us-central1/getOrderDetails`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { orderId, customerPhone } }),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: response.status, body: null, text };
  }
  return { status: response.status, body };
}

async function main() {
  console.log(`Web: ${WEB_URL}`);

  const before1 = await getDocument("products/SKU-001");
  const before2 = await getDocument("products/SKU-002");
  const stockBefore1 = valueOf(before1?.fields?.stock);
  const stockBefore2 = valueOf(before2?.fields?.stock);

  check(
    typeof stockBefore1 === "number" && typeof stockBefore2 === "number",
    "el emulador tiene los productos sembrados",
    `SKU-001=${stockBefore1}, SKU-002=${stockBefore2}`
  );

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const page = await browser.newPage();

  let whatsappUrl = "";
  page.on("request", (request) => {
    if (request.url().startsWith("https://wa.me/")) {
      whatsappUrl = request.url();
    }
  });
  await page.route("https://wa.me/**", (route) => route.abort());

  try {
    await page.goto(`${WEB_URL}/catalogo/hogar`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForSelector('[data-testid="product-SKU-001"]', { timeout: 60000 });

    await page.click('[data-testid="add-SKU-001"]');
    await page.click('[data-testid="add-SKU-002"]');

    // El carrito se persiste al navegar; espera a que localStorage y el DOM
    // reflejen los dos productos antes de avanzar.
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("cart") ?? "";
        return raw.includes("SKU-001") && raw.includes("SKU-002");
      },
      undefined,
      { timeout: 15000 }
    );

    await page.goto(`${WEB_URL}/carrito`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return (
          text.includes("Juego de ollas 5 piezas") &&
          text.includes("Organizador de cocina")
        );
      },
      undefined,
      { timeout: 20000 }
    );
    const cartText = await page.locator("body").innerText();
    check(
      cartText.includes("Juego de ollas 5 piezas") &&
        cartText.includes("Organizador de cocina"),
      "el carrito contiene los dos productos"
    );

    await page.goto(`${WEB_URL}/checkout`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForSelector('input[placeholder="Nombre"]', { timeout: 60000 });

    await page.fill('input[placeholder="Nombre"]', "Cliente E2E");
    await page.fill('input[placeholder="Email"]', "e2e@example.com");
    await page.fill('input[placeholder="Teléfono (WhatsApp)"]', "573001112299");
    await page.fill(
      'input[placeholder="Dirección de entrega"]',
      "Av. Prueba 123"
    );

    await page.click('button:has-text("Confirmar pedido")');

    // Nuevo flujo: la confirmación muestra una pantalla de éxito y
    // el envío por WhatsApp es opcional.
    await page.waitForSelector('[data-testid="order-id"]', { timeout: 30000 });
    const orderId = (await page.locator('[data-testid="order-id"]').innerText()).trim();
    check(orderId.length >= 10, "la pantalla de éxito muestra el pedido", orderId);

    const stored = await page.evaluate(() => localStorage.getItem("customerProfile"));
    check(Boolean(stored), "guarda al cliente en este navegador", stored ?? "");

    whatsappUrl =
      (await page.getAttribute('[data-testid="whatsapp-confirm"]', "href")) ?? "";
    check(
      whatsappUrl.startsWith("https://wa.me/"),
      "ofrece envío por WhatsApp",
      whatsappUrl
    );

    const text = new URL(whatsappUrl).searchParams.get("text") ?? "";
    check(
      text.includes(`Pedido #${orderId}`),
      "el mensaje incluye el ID del pedido",
      text.slice(0, 80)
    );

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Los pedidos están privados; se consulta con orderId + teléfono.
    const details = await callGetOrderDetails(orderId, "573001112299");
    check(
      details.status === 200 && Boolean(details.body?.result),
      "el pedido es consultable con teléfono",
      `HTTP ${details.status}: ${JSON.stringify(details.body).slice(0, 120)}`
    );

    const order = details.body?.result ?? {};
    const itemList = Array.isArray(order.items) ? order.items : [];
    check(
      itemList.length === 2,
      "el pedido tiene dos líneas",
      `items=${itemList.length}`
    );
    check(
      Math.abs(Number(order.total ?? 0) - 64.4) < 0.01,
      "el total lo calculó el servidor (64.40)",
      `total=${order.total}`
    );
    check(
      order.status === "pending",
      "el pedido queda en estado pending",
      order.status
    );

    const after1 = await getDocument("products/SKU-001");
    const after2 = await getDocument("products/SKU-002");
    check(
      valueOf(after1?.fields?.stock) === stockBefore1 - 1,
      "descuenta stock de SKU-001",
      `${stockBefore1} -> ${valueOf(after1?.fields?.stock)}`
    );
    check(
      valueOf(after2?.fields?.stock) === stockBefore2 - 1,
      "descuenta stock de SKU-002",
      `${stockBefore2} -> ${valueOf(after2?.fields?.stock)}`
    );

    console.log("INFO: pedido completo consultado con teléfono correcto.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
