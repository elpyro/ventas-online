// Debug temporal: captura console/pageerror del tracker de visitas.
import { chromium } from "playwright-core";

const url = process.env.URL ?? "http://localhost:3002/producto/SKU-001";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  page.on("request", (req) => {
    const host = new URL(req.url()).host;
    if (host.includes("8080")) console.log("FS", req.method(), req.url().slice(0, 140));
  });
  page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text().slice(0, 400)));
  page.on("pageerror", (err) => console.log("PAGEERROR", String(err).slice(0, 400)));
  page.on("requestfailed", (req) =>
    console.log("REQFAIL", req.url().slice(0, 150), req.failure()?.errorText)
  );
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  const probe = await page.evaluate(() => {
    const out = {};
    try { out.localStorage = `ok (${typeof localStorage})`; } catch (e) { out.localStorage = `THROWS: ${e}`; }
    out.fbEmulators = String(globalThis.__fbEmulators);
    out.visitKeys = Object.keys(localStorage).filter((k) => k.startsWith("visit"));
    return out;
  });
  console.log("probe:", JSON.stringify(probe));
  await page.waitForTimeout(8000);
  const probe2 = await page.evaluate(() => {
    const qty = document.querySelector('#qty')?.value;
    const cart = localStorage.getItem('cart');
    const btn = document.querySelector('[data-testid="add-to-cart"]');
    const plus = document.querySelector('button[aria-label="Más"]');
    return {
      qty,
      cart: cart ? cart.slice(0, 300) : null,
      addDisabled: btn?.disabled,
      addText: btn?.textContent?.trim(),
      plusDisabled: plus?.disabled,
    };
  });
  console.log('probe2:', JSON.stringify(probe2));
  await page.screenshot({ path: 'visit-debug.png', fullPage: false });
  const lsKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("visit")));
  console.log("visit localStorage keys:", JSON.stringify(lsKeys));
} finally {
  await browser.close();
}
const r = await fetch(
  "http://127.0.0.1:8080/v1/projects/ventas-online-ec/databases/(default)/documents/metrics/visits"
);
console.log("metrics:", (await r.text()).slice(0, 200));
process.exit(0);
