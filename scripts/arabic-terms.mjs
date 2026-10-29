#!/usr/bin/env node
// One term per concept (UX area X, plans/arabic-first.md "Glossary"): counts each glossary term in the Arabic
// messages and the Keycloak Arabic bundles, and fails when a replaced variant comes back.
// Usage: node scripts/arabic-terms.mjs [--list]   (--list prints every string a row counts)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const list = process.argv.includes("--list");

function flatten(node, prefix, out) {
  if (typeof node === "string") out.push([prefix, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

function properties(file, tag) {
  return readFileSync(join(root, file), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [`${tag}:${line.slice(0, line.indexOf("="))}`, line.slice(line.indexOf("=") + 1)]);
}

const strings = [
  ...flatten(JSON.parse(readFileSync(join(root, "frontend/src/messages/ar.json"), "utf8")), "", []),
  ...properties("infrastructure/keycloak/themes/rehletshifaa/login/messages/messages_ar.properties", "kc-login"),
  ...properties("infrastructure/keycloak/themes/rehletshifaa/email/messages/messages_ar.properties", "kc-email"),
];

// Arabic letters (and the shadda) as a word boundary: JavaScript's \b does not see Arabic.
const L = "[\\u0621-\\u064A\\u0651]";
const word = (body) => new RegExp(`(?<!${L})${body}(?!${L})`, "u");

// Each row: the one term, the variants it replaced, and the keys allowed to use a variant for a different concept.
const rows = [
  {
    concept: "coordination deposit",
    term: /دفعة (ال)?تنسيق/u,
    variants: [/وديع/u, /عربون/u, /الدفعة المقدمة/u, /دفعة مقدمة/u],
  },
  {
    concept: "Finance, the team that acts",
    term: /الفريق المالي|فريقنا المالي/u,
    variants: [/فريق المالية/u, /قسم المالية/u, word("المالية")],
    // «المالية» stays a role, queue or thread label; the adjective (financial interest, records) is another concept.
    allow: {
      [word("المالية").source]: [
        /\.roles\.FINANCE$/,
        /caseMessages\.threads\.COORDINATOR_FINANCE$/,
        /currentAction\.actions\.ASSIGN_FINANCE$/,
        /^portalWork\.affiliations\./,
      ],
    },
  },
  {
    concept: "commercial terms",
    term: /الشروط التجارية/u,
    variants: [/الشروط المالية/u],
  },
  {
    concept: "coordinator",
    term: /منسّق/u,
    variants: [/منسق/u],
  },
  {
    concept: "preliminary estimate",
    term: /التقدير|تقدير/u,
    // «مقترح» as "suggested" (referrals) and «المقترحة» (proposed steps) are another concept.
    variants: [word("(ال)?مقترح(ك)?")],
    allow: { [word("(ال)?مقترح(ك)?").source]: [/^portalWork\.referrals\./] },
  },
  {
    concept: "final quote / the priced proposal",
    term: /عرض (ال)?سعر/u,
    // Bare «العرض» / «عرضك» as the document. «عرض» the verb (show, view) and the Consultant's assignment offer stay.
    variants: [word("(ال|لل|بال|وال|فال)عرض(?! (ال)?سعر)"), word("(و|ف|ب|ل)?عرض(ك|ي|ًا|ا)"), /عرض العلاج النهائي/u],
    allow: {
      [word("(ال|لل|بال|وال|فال)عرض(?! (ال)?سعر)").source]: [/ASSIGNMENT_OFFER_EXPIRED\.context$/],
      [word("(و|ف|ب|ل)?عرض(ك|ي|ًا|ا)").source]: [/^portalWork\.plural\.pendingOffers\./],
    },
  },
];

let failures = 0;
for (const row of rows) {
  const using = strings.filter(([, v]) => row.term.test(v));
  console.log(`${row.concept}: «${row.term.source}» in ${using.length} strings`);
  if (list) for (const [k] of using) console.log(`    ${k}`);
  for (const variant of row.variants) {
    const allowed = row.allow?.[variant.source] ?? [];
    const hits = strings.filter(([k, v]) => variant.test(v) && !allowed.some((re) => re.test(k)));
    const kept = strings.filter(([k, v]) => variant.test(v) && allowed.some((re) => re.test(k)));
    if (kept.length) console.log(`  kept for another concept: «${variant.source}» in ${kept.length} (${kept.map(([k]) => k).join(", ")})`);
    for (const [k, v] of hits) {
      failures++;
      console.log(`  REPLACED VARIANT «${variant.source}» in ${k}: ${v}`);
    }
  }
}
// Arabic hard-coded in components (Control Center, staff panels) follows the same rows. Bare «العرض» is left out here:
// in code it is mostly the verb (show, display name) and is reviewed by hand.
const codeVariants = rows
  .flatMap((row) => row.variants.filter((v) => !v.source.includes("عرض")))
  .filter((v) => !v.source.includes("المالية(?!"));
function sources(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}
for (const file of sources(join(root, "frontend/src"), [])) {
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    for (const variant of codeVariants) {
      if (variant.test(line) && !/referrals|suggest/i.test(line)) {
        failures++;
        console.log(`  REPLACED VARIANT «${variant.source}» in ${relative(root, file)}:${i + 1}`);
      }
    }
  });
}

// The backend's own Arabic (WhatsApp and email templates, status and readiness labels, consent text) follows every row,
// bare «العرض» included: in Java the Arabic is only ever patient or staff text. One register too: no «يرجى» (X-3).
const register = /يُ?رجى|الرجاء|نرجو/u;
// One spelling (X-3): «تحقّق/تعذّر/تحدّث» carry the shadda on the middle letter; «تحققّ» puts it on the last.
const spelling = /تحقق|تعذر|تحدث|ققّ/u;
for (const [k, v] of strings) {
  for (const rule of [register, spelling]) {
    if (rule.test(v)) {
      failures++;
      console.log(`  «${rule.source}» in ${k}: ${v}`);
    }
  }
}
for (const file of sources(join(root, "frontend/src"), [])) {
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    for (const rule of [register, spelling]) {
      if (rule.test(line)) {
        failures++;
        console.log(`  «${rule.source}» in ${relative(root, file)}:${i + 1}`);
      }
    }
  });
}
const javaVariants = [...rows.flatMap((row) => row.variants), register, spelling];
function javaSources(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) javaSources(path, out);
    else if (entry.name.endsWith(".java")) out.push(path);
  }
  return out;
}
let javaLines = 0;
for (const file of javaSources(join(root, "backend/src/main/java"), [])) {
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (!/[ء-ي]/u.test(line)) return;
    javaLines++;
    for (const variant of javaVariants) {
      if (variant.test(line)) {
        failures++;
        console.log(`  REPLACED VARIANT «${variant.source}» in ${relative(root, file)}:${i + 1}`);
      }
    }
  });
}
console.log(`backend: ${javaLines} Java lines with Arabic checked`);

if (failures) {
  console.log(`\n${failures} string(s) use a replaced variant.`);
  process.exit(1);
}
console.log("\nOne term per glossary row.");
