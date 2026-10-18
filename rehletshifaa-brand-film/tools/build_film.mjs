// Generate a root composition for one edition/language.
// node tools/build_film.mjs --lang en --edition master [--only s03-coordinator] [--audio mixes/master_en.wav] [--out master-en.html]
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]]] : a), []));
const SRC = path.resolve("source");
const lang = args.lang || "en";
const edition = args.edition || "master";
const only = args.only ? String(args.only).split(",") : null;
const timing = JSON.parse(fs.readFileSync(path.join(SRC, `data/timing.${lang}.json`), "utf8"));

// test mode: rebase the chosen scenes so the composition starts at 0
let total = timing.total;
let rebase = 0;
// editions (cut-downs) take their duration from the shared edition planner
if (edition !== "master" && !only) {
  // the planner is a browser script with a CommonJS tail; source/ is an ES-module package, so evaluate it directly
  const mod = { exports: {} };
  new Function("module", fs.readFileSync(path.join(SRC, "shared/rs-editions.js"), "utf8"))(mod);
  const { plan } = mod.exports;
  total = plan(edition, timing).total;
}
if (only) {
  const scs = timing.scenes.filter((s) => only.includes(s.id));
  const first = scs[0], last = scs[scs.length - 1];
  const lead = args.lead ? +args.lead : 1.0;
  rebase = first.start - lead;
  total = +(last.start + last.dur - rebase).toFixed(2);
}

const css = fs.readFileSync(path.join(SRC, "film.css"), "utf8");
const scripts = [
  "shared/vendor/gsap.min.js", "shared/rs-rig.js", "shared/rs-face.js", "shared/chars/amal.js", "shared/chars/nour.js",
  "shared/chars/consultant.js", "shared/rs-scene.js", "shared/rs-env.js", "shared/rs-props.js", "shared/rs-ui.js", "shared/rs-proposal.js", "shared/rs-standing.js", "shared/rs-env-travel.js",
  "shared/rs-i18n.js", "shared/rs-film.js", `data/timing.${lang}.js`,
  ...fs.readdirSync(path.join(SRC, "shared/scenes")).filter((f) => f.endsWith(".js")).sort().map((f) => `shared/scenes/${f}`),
];
if (fs.existsSync(path.join(SRC, "shared/rs-editions.js"))) scripts.push("shared/rs-editions.js");
const id = only ? `test-${lang}` : `${edition}-${lang}`;
const audio = args.audio ? `\n      <audio id="mix-${lang}" src="${args.audio}" data-start="0" data-duration="${total}" data-track-index="10" data-volume="1"></audio>` : "";
const W = edition.includes("9x16") ? 1080 : 1920, H = edition.includes("9x16") ? 1920 : 1080;
const html = `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>RehletShifaa — From Uncertainty to Clarity (${edition}, ${lang})</title>
${scripts.map((s) => `    <script src="${s}"></script>`).join("\n")}
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${id}" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}" data-fps="30" data-rebase="${rebase}">${audio}
    </div>
    <script>
      (function () {
        const lang = ${JSON.stringify(lang)};
        const only = ${JSON.stringify(only)};
        const rebase = ${rebase};
        if (rebase) {
          const T = window.RS_TIMINGS[lang];
          T.scenes.forEach((s) => { s.start = +(s.start - rebase).toFixed(3); s.captions.forEach((c) => { c.s -= rebase; c.e -= rebase; }); });
          T.total = ${total};
        }
        const edition = ${JSON.stringify(edition)};
        const { tl, compId } = (edition !== "master" && !only ? RS.filmEdition : RS.film)({ lang, edition, only });
        window.RS_CUES = RS.CUES;
        window.__timelines[compId] = tl;
      })();
    </script>
  </body>
</html>
`;
const out = path.join(SRC, args.out || `${id}.html`);
fs.writeFileSync(out, html);
console.log(out, "duration", total, "rebase", rebase);
