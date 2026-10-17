// Read the authored sound cues and narration placement straight out of a built composition.
// node tools/dump_cues.mjs source/master-en.html out.json
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const [file, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => { window.__timelines = {}; });
await p.goto("file://" + path.resolve(file));
const data = await p.evaluate(() => {
  const root = document.querySelector("[data-composition-id]");
  const lang = document.documentElement.lang;
  const T = window.RS_TIMINGS[lang];
  const ids = [...document.querySelectorAll("section.scene")].map((s) => s.id);
  return {
    lang, total: +root.dataset.duration, music_offset: +(root.dataset.rebase || 0), cues: window.RS_CUES,
    // editions publish their own narration placements (RS.VO); the master derives them from the timing
    vo: window.RS.VO ? window.RS.VO : T.scenes.filter((s) => ids.includes(s.id)).flatMap((s) => s.vo.map((v) => ({ scene: s.id, t: +(s.start + v.at).toFixed(3), file: v.file, dur: v.dur, speech: v.speech }))),
  };
});
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log(out, data.cues.length, "cues", data.vo.length, "lines", data.total, "s");
await b.close();
