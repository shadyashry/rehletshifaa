import { chromium } from "@playwright/test";
const [out, base, path, name, ...widths] = process.argv.slice(2);
const b = await chromium.launch();
for (const w of widths) {
  const p = await b.newPage({ viewport: { width: +w, height: 900 }, reducedMotion: "reduce" });
  await p.goto(`${base}/${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const over = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  console.log(name, w, "overflow:", over, "height:", h);
  await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true }); await p.close();
}
await b.close();
