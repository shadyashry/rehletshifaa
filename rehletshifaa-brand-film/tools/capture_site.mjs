import { chromium } from "playwright";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: undefined });
for (const [name, url, w, h] of [
  ["send-en-mobile", "https://dev.rehletshifaa.com/en/send-my-case", 390, 844],
  ["send-ar-mobile", "https://dev.rehletshifaa.com/ar/send-my-case", 390, 844],
  ["home-en-desktop", "https://dev.rehletshifaa.com/en", 1440, 900],
  ["home-ar-desktop", "https://dev.rehletshifaa.com/ar", 1440, 900],
  ["how-en-desktop", "https://dev.rehletshifaa.com/en/how-it-works", 1440, 900],
]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: name.startsWith("send") });
  await p.close();
}
await browser.close();
