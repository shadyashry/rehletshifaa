// Edition timing for the score composer: one "scene" per segment, carrying the master scene's number so each
// segment keeps its own harmony. node tools/edition_timing.mjs <edition> <lang> <out.json>
import fs from "node:fs";
import path from "node:path";
const [edition, lang, out] = process.argv.slice(2);
const SRC = path.resolve("source");
const mod = { exports: {} };
new Function("module", fs.readFileSync(path.join(SRC, "shared/rs-editions.js"), "utf8"))(mod);
const T = JSON.parse(fs.readFileSync(path.join(SRC, `data/timing.${lang}.json`), "utf8"));
const P = mod.exports.plan(edition, T);
const scenes = P.segments.map((g) => ({ id: g.id, index: g.sc.index, start: g.start, dur: g.len }));
fs.writeFileSync(out, JSON.stringify({ edition, lang, total: P.total, scenes }, null, 1));
console.log(out, P.total, scenes.map((s) => `${s.id}@${s.start}+${s.dur}`).join(" "));
