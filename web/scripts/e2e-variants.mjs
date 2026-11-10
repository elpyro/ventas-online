// Prueba E2E de variantes y búsqueda contra el emulador.
// Uso: WEB_URL=http://localhost:3001 node scripts/e2e-variants.mjs
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
  if ("mapValue" in field) {
    const out = {};
    for (const key of Object.keys(field.mapValue.fields ?? {})) {
      out[key] = valueOf(field.mapValue.fields[key]);
    }
    return out;
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

  const before = await getDocument("products/SKU-003");
  const beforeStock = valueOf(before?.fields?.stock);
  const beforeVariants = (valueOf(before?.fields?.variants) ?? []).map((v) => v.stock);
  console.log(`INFO: SKU-003 stock=${beforeStock} variantes=${JSON.stringify(beforeVariants)}`);

  check(
    typeof beforeStock === "number" && Array.isArray(valueOf(before?.fields?.variants)),
    "el emulador tiene SKU-003 con variantes sembradas",
    `stock=${beforeStock}`
  );

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const page = await browser.newPage();

  // En dev, los bundles de la portada pesan mucho y React hidrata tarde.
  // En vez de dormir X segundos, abrimos y cerramos el carrito hasta que
  // el componente responda: eso confirma que la portada está interactiva.
  async function waitForHomeInteractive() {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      await page.click('button[aria-label="Abrir carrito"]', { timeout: 2500 }).catch(() => {});
      const visible = await page.locator('text=Tu carrito').first().isVisible().catch(() => false);
      if (visible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        return;
      }
      await page.waitForTimeout(500);
    }
    throw new Error("La portada no terminó de hidratarse");
  }

  try {
    // ------------------------------------------------------------------
    // 1) Buscador en la home (API + desplegable)
    // ------------------------------------------------------------------
    await page.goto(`${WEB_URL}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await waitForHomeInteractive();
    await page.fill("#home-search", "audifonos");
    await page.waitForSelector('a[href^="/producto/SKU-003"]', { timeout: 20000 });
    console.log("OK: el buscador de la home encuentra SKU-003");

    // ------------------------------------------------------------------
    // 2) Página de resultados
    // ------------------------------------------------------------------
    await page.goto(`${WEB_URL}/buscar?q=audifonos`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    const buscarText = await page.locator("body").innerText();
    check(
      buscarText.includes("Audífonos Bluetooth"),
      "la página /buscar lista los resultados"
    );

    // ------------------------------------------------------------------
    // 3) Buscador dentro del catálogo
    // ------------------------------------------------------------------
    await page.goto(`${WEB_URL}/catalogo/tecnologia`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.fill("#catalog-search", "audifonos");
    const visible = await page.locator('[data-testid^="product-"]').count();
    check(visible === 1, "el buscador del catálogo filtra a un producto", `visibles=${visible}`);

    // ------------------------------------------------------------------
    // 4) Ficha: variantes + compartir
    // ------------------------------------------------------------------
    await page.goto(`${WEB_URL}/producto/SKU-003?catalogo=tecnologia`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForSelector("h1", { timeout: 60000 });

    // La ficha hidrata lento en dev: esperamos a que el botón "+" cambie
    // el input a 2 con React funcionando.
    let interactive = false;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !interactive) {
      await page.click('button[aria-label="Más"]', { timeout: 2500 }).catch(() => {});
      interactive = await page
        .waitForFunction(() => document.querySelector("#qty")?.value === "2",
          undefined,
          { timeout: 1500 })
        .then(() => true)
        .catch(() => false);
    }
    if (!interactive) {
      throw new Error("La ficha no terminó de hidratarse");
    }
    // La cantidad ya quedó en 2 (útil para la compra de prueba).
    const heading = await page.locator("h1").innerText();
    check(heading.includes("Audífonos"), "la ficha muestra el producto", heading);

    const shareHref = await page.getAttribute('[data-testid="share-whatsapp"]', "href");
    check(
      typeof shareHref === "string" && shareHref.startsWith("https://wa.me/"),
      "existe el botón Compartir (WhatsApp)",
      shareHref ?? "null"
    );

    // Selecciona la variante "Blanco" (3 unidades sembradas).
    await page.click('button:has-text("Blanco")');
    // La cantidad ya está en 2 (mínimo de tecnología: 2 x $29.99 = $59.98).
    await page.click('[data-testid="add-to-cart"]');

    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("cart") ?? "";
        return raw.includes("\"sku\":\"SKU-003\"") && raw.includes("variantId");
      },
      undefined,
      { timeout: 15000 }
    );
    console.log("OK: el carrito lleva la variante elegida");

    // ------------------------------------------------------------------
    // 5) Compra completa con variante (para verificar descuento de stock)
    // ------------------------------------------------------------------
    await page.goto(`${WEB_URL}/checkout`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForSelector('input[placeholder="Nombre"]', { timeout: 60000 });
    await page.fill('input[placeholder="Nombre"]', "Cliente Variantes E2E");
    await page.fill('input[placeholder="Email"]', "variantes@example.com");
    await page.fill('input[placeholder="Teléfono (WhatsApp)"]', "573001112298");
    await page.fill('input[placeholder="Dirección de entrega"]', "Calle Prueba 456");
    await page.click('button:has-text("Confirmar pedido")');

    await page.waitForSelector('[data-testid="order-id"]', { timeout: 30000 });
    const orderId = (await page.locator('[data-testid="order-id"]').innerText()).trim();
    console.log(`INFO: pedido de variantes creado: ${orderId}`);

    // ------------------------------------------------------------------
    // 6) Verifica que el pedido guardó la variante (vía Function, no REST)
    // ------------------------------------------------------------------
    const phone = "573001112298";
    const details = await callGetOrderDetails(orderId, phone);
    check(
      details.status === 200 && Boolean(details.body?.result),
      "el pedido es consultable con el teléfono usado en la compra",
      `HTTP ${details.status}`
    );
    const order = details.body?.result ?? {};
    const items = Array.isArray(order.items) ? order.items : [];
    const line = items.find((item) => item.sku === "SKU-003");
    check(
      items.length === 1 && line?.quantity === 2,
      "el pedido tiene una línea con las 2 unidades",
      JSON.stringify(items)
    );
    check(
      line?.variantLabel === "Blanco",
      "la línea del pedido registra la variante elegida",
      JSON.stringify(items)
    );

    // ------------------------------------------------------------------
    // 6) Verifica que la variante correcta perdió stock
    // ------------------------------------------------------------------
    const after = await getDocument("products/SKU-003");
    const afterStock = valueOf(after?.fields?.stock);
    const afterVariants = (valueOf(after?.fields?.variants) ?? []).map((v) => ({
      id: v.id,
      color: v.color,
      stock: v.stock,
    }));
    const blanco = afterVariants.find((v) => v.color === "Blanco");

    check(
      blanco?.stock === 1,
      "descuenta 2 unidades de la variante Blanco (3 → 1)",
      JSON.stringify(afterVariants)
    );
    check(
      typeof afterStock === "number" && afterStock === beforeStock - 2,
      "recalcula el stock total del producto",
      `${beforeStock} → ${afterStock}`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
