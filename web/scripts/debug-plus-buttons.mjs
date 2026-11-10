// Debug temporal: cuenta los botones "Más" en el DOM.
import { chromium } from "playwright-core";

const url = process.env.URL ?? "http://localhost:3002/producto/SKU-001";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(9000);
  const list = [];
  for (const wait of [0, 3000, 5000, 8000]) {
    await page.waitForTimeout(wait);
    const state = await page.evaluate(() => {
      const plus = document.querySelector('button[aria-label="Más"]');
      return {
        qty: document.querySelector('#qty')?.value,
        disabled: plus?.disabled,
        cart: localStorage.getItem('cart')?.slice(0, 120),
      };
    });
    list.push({ after: (list.length ? list.length * wait : 0) + 9000, ...state });
  }
  console.log(JSON.stringify(list, null, 2));
} finally {
  await browser.close();
}
process.exit(0);
