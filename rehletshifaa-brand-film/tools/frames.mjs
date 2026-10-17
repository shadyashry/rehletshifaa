// node tools/frames.mjs <composition.html> <compId> <outPrefix> t1,t2,... [scale]
import { chromium } from "playwright";
import path from "node:path";
const [file, id, out, times, scale = "0.5"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: +scale });
p.on("pageerror", (e) => console.log("pageerror:", e.message));
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await p.addInitScript(() => { window.__timelines = {}; });
await p.goto("file://" + path.resolve(file));
await p.waitForFunction((id) => !!window.__timelines[id], id, { timeout: 15000 });
const dims = await p.evaluate(() => { const r = document.querySelector("[data-composition-id]"); r.style.width = r.dataset.width + "px"; r.style.height = r.dataset.height + "px"; return [+r.dataset.width, +r.dataset.height]; });
await p.setViewportSize({ width: dims[0], height: dims[1] });
await p.waitForTimeout(300);
p.on("crash", () => console.log("CRASH"));
for (const t of times.split(",").map(Number)) {
  await p.evaluate(([id, t]) => { window.__timelines[id].seek(t, false); }, [id, t]);
  await p.screenshot({ path: `${out}_${String(t).padStart(5, "0")}.png` });
}
await b.close();
