import { chromium } from 'playwright-core';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded', timeout: 90000 });
const probe = await page.evaluate(() => Object.keys(document.body).filter(k => k.startsWith('__react')));
console.log('BODY_KEYS:', JSON.stringify(probe));
await browser.close();
