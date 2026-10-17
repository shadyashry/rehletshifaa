// node tools/shoot.mjs <url-relative-to-tools> <out.png> [width] [height]
import { chromium } from "playwright";
import path from "node:path";
const [rel, out, w = 2400, h = 1300] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto("file://" + path.resolve("tools", rel));
await p.waitForTimeout(300);
await p.screenshot({ path: out, fullPage: true });
await b.close();
