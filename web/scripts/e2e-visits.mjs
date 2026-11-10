// Prueba E2E del contador de visitas y del tope de stock en la ficha de producto.
// Uso: WEB_URL=http://localhost:3001 node scripts/e2e-visits.mjs
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
  if ("arrayValue" in field) return (field.arrayValue.values ?? []).map(valueOf);
  if ("mapValue" in field) {
    const out = {};
    for (const [k, v] of Object.entries(field.mapValue.fields ?? {})) out[k] = valueOf(v);
    return out;
  }
  return undefined;
}

// En el emulador, "Bearer owner" salta las reglas (admin). En producción no existe
// ese bypass, así que este script solo sirve contra los emuladores.
const OWNER_HEADER = { Authorization: "Bearer owner" };

async function getDocument(path) {
  const response = await fetch(`${FS_BASE}/${path}`, { headers: OWNER_HEADER });
  if (!response.ok) return null;
  const json = await response.json();
  const out = {};
  for (const [k, v] of Object.entries(json.fields ?? {})) out[k] = valueOf(v);
  return out;
}

async function getProduct(sku) {
  return getDocument(`products/${encodeURIComponent(sku)}`);
}

const sku = process.env.E2E_SKU ?? "SKU-001";
const product = await getProduct(sku);
check(Boolean(product), `existe ${sku} en el emulador`);
const stock = Number(product.stock ?? 0);
check(stock > 0, `${sku} tiene stock (${stock})`);

const before = (await getDocument("metrics/visits")) ?? { anonymous: 0, registered: 0 };
console.log(`Contador antes: desconocidos=${before.anonymous ?? 0} registrados=${before.registered ?? 0}`);

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // El dev server compila la ruta bajo demanda; 'domcontentloaded' es suficiente.
  await page.goto(`${WEB_URL}/producto/${encodeURIComponent(sku)}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByTestId("add-to-cart").waitFor({ timeout: 60000 });

  // El contador cuenta una visita por día y navegador; en dev la hidratación tarda.
  await page.waitForTimeout(10000);
  const after = await getDocument("metrics/visits");
  const anonDelta = Number(after?.anonymous ?? 0) - Number(before.anonymous ?? 0);
  const regDelta = Number(after?.registered ?? 0) - Number(before.registered ?? 0);
  check(anonDelta + regDelta === 1, "la visita se contabilizó (+1)", `desconocidos+${anonDelta} registrados+${regDelta}`);

  // Tope: el botón "+" no permite superar el stock disponible.
  const plus = page.getByRole("button", { name: "Más" });
  let clicks = 0;
  for (let i = 0; i < stock + 5; i++) {
    if (await plus.isDisabled()) break;
    await plus.click({ timeout: 5000 }).catch(() => {});
    clicks++;
    await page.waitForTimeout(120);
  }
  console.log(`Clics en "+": ${clicks}`);
  const qtyValue = await page.locator("#qty").inputValue();
  check(qtyValue === String(stock), `cantidad limitada al stock (${stock})`, `mostraba ${qtyValue}`);

  // Agregar todo y comprobar que no se puede agregar más.
  await page.getByTestId("add-to-cart").click();
  await page.waitForTimeout(300);
  const addLabel = (await page.getByTestId("add-to-cart").innerText()).trim();
  check(/en el carrito/i.test(addLabel), "tras agotar el stock, el botón queda como 'En el carrito'", addLabel);
  const plusDisabled = await plus.isDisabled();
  check(plusDisabled, "el botón + se deshabilita al llegar al máximo");

  // La ficha muestra siempre las unidades disponibles y, si hay algo cargado,
  // cuántas van en el carrito.
  const help = (await page.getByTestId("qty-help").innerText()).trim();
  check(
    help.includes(String(stock)) && /en tu carrito/i.test(help),
    "la ayuda muestra el stock total y lo que ya está en el carrito",
    help
  );

  // Al recargar, la cantidad arranca en lo cargado (stock completo), no en 1.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("add-to-cart").waitFor({ timeout: 60000 });
  await page.waitForFunction(
    (expected) => document.querySelector("#qty")?.value === String(expected),
    stock,
    { timeout: 30000 }
  );
  check(true, `al recargar la cantidad arranca en ${stock} (lo que hay en el carrito)`);
  const reloadLabel = (await page.getByTestId("add-to-cart").innerText()).trim();
  check(/en el carrito/i.test(reloadLabel), "sin cambios, el botón queda deshabilitado", reloadLabel);

  // Bajar la cantidad actualiza el carrito existente en lugar de duplicarlo.
  await page.locator("#qty").fill("2");
  const updateLabel = (await page.getByTestId("add-to-cart").innerText()).trim();
  check(/actualizar carrito/i.test(updateLabel), "al bajar la cantidad el botón dice 'Actualizar carrito'", updateLabel);
  await page.getByTestId("add-to-cart").click();
  await page.waitForTimeout(500);
  const cartQty = await page.evaluate(() => {
    const raw = localStorage.getItem("cart");
    if (!raw) return -1;
    return JSON.parse(raw).reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
  });
  check(cartQty === 2, "el carrito quedó con 2 unidades (no se sumaron otras 2)", `quedó ${cartQty}`);

  // Segunda visita, esta vez de un cliente "registrado" (perfil guardado en el
  // navegador): debe sumar a la columna de registrados, no a la de desconocidos.
  const registeredContext = await browser.newContext();
  await registeredContext.addInitScript(() => {
    localStorage.setItem(
      "customerProfile",
      JSON.stringify({ name: "Cliente Prueba", email: "prueba@ejemplo.test", phone: "+573001112297", address: "Bogotá" })
    );
  });
  const registeredPage = await registeredContext.newPage();
  await registeredPage.goto(`${WEB_URL}/producto/${encodeURIComponent(sku)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await registeredPage.getByTestId("add-to-cart").waitFor({ timeout: 60000 });
  await registeredPage.waitForTimeout(10000);
  const afterRegistered = await getDocument("metrics/visits");
  const registeredDelta =
    Number(afterRegistered?.registered ?? 0) - Number(after?.registered ?? 0);
  check(registeredDelta === 1, "la visita de un cliente registrado suma en 'registrados'", `+${registeredDelta}`);
  await registeredContext.close();

  console.log("Contador final:", JSON.stringify(await getDocument("metrics/visits")));
} finally {
  await browser.close();
}
console.log("E2E de visitas y stock: OK");
