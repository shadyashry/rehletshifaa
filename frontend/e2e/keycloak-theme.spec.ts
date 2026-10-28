import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// UX area 7: the Keycloak login theme, rendered from the real Keycloak templates by
// infrastructure/keycloak/theme-harness/render.sh (no running Keycloak; synthetic data only). Skipped unless
// KC_HARNESS_DIR points at the harness output. Run with PLAYWRIGHT_EXTERNAL_SERVER=true: no Next server is needed.
// Shots are written only when `AREA7_SHOTS` names a folder under screenshots/area-7 ("before", "7-0", "after", …), so a
// plain check run never overwrites a baseline.
const harness = process.env.KC_HARNESS_DIR;
const folder = process.env.AREA7_SHOTS;
const repo = path.join(__dirname, "..", "..");
const shot = (name: string) => path.join(repo, "docs/ux-redesign/screenshots/area-7", folder ?? "", `${name}.png`);

const LOCALES = ["en", "ar"] as const;
// The scenarios are Render.java's own list (pages.txt), so the spec cannot drift from the harness; the first test
// holds the count and the en/ar pairing.
const PAGES = harness
  ? [...new Set(readFileSync(path.join(harness, "pages.txt"), "utf8").trim().split("\n").map(f => f.replace(/-(en|ar)\.html$/, "")))]
  : [];

async function open(page: Page, name: string) {
  await page.goto(pathToFileURL(path.join(harness ?? "", `${name}.html`)).href);
  await page.evaluate(async () => { await document.fonts.ready; });
}

test.describe("Keycloak theme", () => {
  test.skip(!harness, "set KC_HARNESS_DIR to the theme harness output");

  test("every scenario was rendered in both languages", () => {
    const pages = readFileSync(path.join(harness ?? "", "pages.txt"), "utf8").trim().split("\n");
    expect(PAGES.length).toBeGreaterThanOrEqual(24);
    expect(pages.toSorted()).toEqual(PAGES.flatMap(p => LOCALES.map(l => `${p}-${l}.html`)).toSorted());
  });

  // The theme mirrors Petrol & Paper values it cannot import; each mirrored name must hold its source's value.
  test("mirrored tokens match the portal's", () => {
    const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
    const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
    const declarations = (css: string) => new Map([...css.matchAll(/(--[\w-]+):\s*([^;{}]+);/g)].map(m => [m[1], normal(m[2])]));
    const source = new Map([...declarations(read("frontend/src/app/globals.css")), ...declarations(read("frontend/src/app/theme-petrol.css"))]);
    const theme = read("infrastructure/keycloak/themes/rehletshifaa/login/resources/css/rehletshifaa.css");
    const start = theme.indexOf(":root {");
    const mirrored = [...declarations(theme.slice(start, theme.indexOf("}", start)))].filter(([name]) => !name.startsWith("--rs-"));
    expect(mirrored.length).toBeGreaterThan(20);
    for (const [name, value] of mirrored) expect.soft(source.get(name), name).toBe(value);
  });

  for (const locale of LOCALES) {
    test(`Petrol & Paper and Arabic rules (${locale})`, async ({ page }) => {
      test.setTimeout(180000);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const name of PAGES) {
          const where = `${name}-${locale} @${width}`;
          await open(page, `${name}-${locale}`);
          const facts = await page.evaluate(() => {
            const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
            const style = (sel: string) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
            const text = [...document.querySelectorAll("#kc-content *, #kc-page-title, label, .pf-c-button, input[type=submit]")].filter(visible);
            return {
              dir: document.documentElement.dir,
              lang: document.documentElement.lang,
              failedFonts: [...document.fonts].filter(f => f.status === "error").map(f => f.family),
              loadedFonts: [...new Set([...document.fonts].filter(f => f.status === "loaded").map(f => f.family.replace(/"/g, "")))],
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              body: style("body")?.fontFamily ?? "",
              heading: style("#kc-page-title")?.fontFamily ?? "",
              headings: [...document.querySelectorAll("h1")].filter(visible).map(h => h.textContent?.trim() ?? ""),
              tracked: text.filter(el => !["otp", "totp"].includes(el.id) && parseFloat(getComputedStyle(el).letterSpacing) > 0).map(el => el.id || el.tagName),
              uppercase: text.filter(el => getComputedStyle(el).textTransform === "uppercase").map(el => el.id || el.tagName),
              small: [...document.querySelectorAll(".card-pf a[href], .card-pf button, .card-pf input:not([type=hidden]), .card-pf select")]
                .filter(visible)
                .map(el => { const r = (el.closest("label") ?? el).getBoundingClientRect(); return { id: el.id || el.textContent?.trim() || el.tagName, h: Math.round(r.height) }; })
                .filter(t => t.h < 44),
            };
          });
          expect.soft(facts.dir, `${where}: direction`).toBe(locale === "ar" ? "rtl" : "ltr");
          expect.soft(facts.lang, `${where}: lang`).toBe(locale);
          expect.soft(facts.failedFonts, `${where}: fonts that failed to load`).toEqual([]);
          expect.soft(facts.loadedFonts, `${where}: body face loaded`).toContain(locale === "ar" ? "Cairo" : "Plus Jakarta Sans");
          expect.soft(facts.body, `${where}: body face`).toMatch(locale === "ar" ? /^Cairo/ : /^"?Plus Jakarta Sans/);
          // 7-3: every page, the second step included, has one h1 that says something.
          expect.soft(facts.heading, `${where}: heading face`).toMatch(/^Alexandria/);
          expect.soft(facts.headings.length, `${where}: one h1`).toBe(1);
          expect.soft(facts.headings[0] ?? "", `${where}: h1 text`).not.toBe("");
          expect.soft(facts.overflow, `${where}: horizontal scroll`).toBeLessThanOrEqual(0);
          if (locale === "ar") expect.soft(facts.tracked, `${where}: tracked Arabic`).toEqual([]);
          expect.soft(facts.uppercase, `${where}: uppercase`).toEqual([]);
          expect.soft(facts.small, `${where}: targets under 44px`).toEqual([]);
          if (width === 390) {
            const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
            const blocking = axe.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${v.id} ×${v.nodes.length}`);
            expect.soft(blocking, `${where}: axe serious/critical`).toEqual([]);
          }
        }
      }
    });
  }

  // 7-1: every string comes from our bundles in the page's language. A raw message key means a missing message;
  // Keycloak's own voice (« » arrows, "We are sorry…", Submit, barcode, OTP devices) must not reach either locale.
  const RAW_KEY = /\b[a-z]+(?:[A-Z][A-Za-z]+)+\d*\b|\b[a-z]+(?:-[a-z]+){2,}\b|\b[a-z]\w*\.[A-Za-z_-]{3,}\b/;
  const KEYCLOAK_VOICE = /[«»]|we are sorry|\bsubmit\b|barcode|device name|\botp\b|webauthn|click here|نعتذر|انقر هنا/i;
  // Text that is not copy: the account's email and the authenticator apps' own names.
  const NOT_COPY = [/\S+@\S+/g, /FreeOTP|Google Authenticator|Microsoft Authenticator/g];
  // Keys a page may still take from Keycloak's own bundles (Render.java lists them in stock-keys.txt): only the
  // authenticator apps' own names (7-3 close: every other key is ours).
  const STOCK_OK = new Set([
    "totpAppFreeOTPName", "totpAppGoogleName", "totpAppMicrosoftAuthenticatorName",
  ]);

  test("words: stock Keycloak keys are reviewed ones", () => {
    const stock = readFileSync(path.join(harness ?? "", "stock-keys.txt"), "utf8").trim().split("\n").filter(Boolean);
    expect(stock.filter(line => !STOCK_OK.has(line.split(" ")[1]))).toEqual([]);
  });

  for (const locale of LOCALES) {
    test(`words: our bundles only (${locale})`, async ({ page }) => {
      for (const name of PAGES) {
        await open(page, `${name}-${locale}`);
        const strings = await page.evaluate(() => {
          const out: string[] = [document.title];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const parent = n.parentElement;
            // The locale menu names each language in that language ("English" on an Arabic page is the way out).
            // translate="no" marks what is not copy: the brand's two-script lockup, the authenticator key and algorithm,
            // the apps' own names.
            if (!parent || parent.closest("script, style, noscript, [role=menuitem], [translate=no]")) continue;
            if (n.textContent?.trim()) out.push(n.textContent.trim());
          }
          for (const el of document.querySelectorAll("[aria-label], [alt], [placeholder], [title], input[type=submit], input[type=button]")) {
            for (const attr of ["aria-label", "alt", "placeholder", "title"]) { const v = el.getAttribute(attr); if (v?.trim()) out.push(v.trim()); }
            if (el instanceof HTMLInputElement && el.value.trim()) out.push(el.value.trim());
          }
          // The passkey pages hand their prompt, default label and unsupported-browser text to Keycloak's scripts.
          const scripted: string[] = [];
          for (const script of document.querySelectorAll("script:not([src])")) {
            for (const m of script.textContent?.matchAll(/\b(?:initLabel|initLabelPrompt|errmsg)\s*:\s*("(?:[^"\\]|\\.)*")/g) ?? []) {
              scripted.push(JSON.parse(m[1]) as string);
            }
          }
          return { out: [...out, ...scripted], scripted: scripted.length };
        });
        const where = `${name}-${locale}`;
        // A template change that moved these strings would otherwise skip them silently.
        if (name === "passkey-setup") expect.soft(strings.scripted, `${where}: script texts found`).toBe(2);
        const copy = strings.out.map(s => NOT_COPY.reduce((t, re) => t.replace(re, ""), s));
        expect.soft(copy.filter(s => RAW_KEY.test(s)), `${where}: raw message keys`).toEqual([]);
        expect.soft(copy.filter(s => KEYCLOAK_VOICE.test(s)), `${where}: Keycloak's voice`).toEqual([]);
        if (locale === "ar") expect.soft(copy.filter(s => /[A-Za-z]{2,}/.test(s)), `${where}: English on the Arabic page`).toEqual([]);
      }
    });
  }

  // 7-3: the code fields ask a phone for digits and let the browser offer a one-time code; the restart link has words.
  test("second step: code fields and the account line", async ({ page }) => {
    for (const locale of LOCALES) {
      for (const name of ["otp", "otp-choose", "otp-error", "otp-setup", "otp-setup-manual"]) {
        await open(page, `${name}-${locale}`);
        const code = page.locator("#otp, #totp");
        await expect.soft(code, `${name}-${locale}: inputmode`).toHaveAttribute("inputmode", "numeric");
        await expect.soft(code, `${name}-${locale}: autocomplete`).toHaveAttribute("autocomplete", "one-time-code");
        await expect.soft(page.locator("#reset-login"), `${name}-${locale}: restart link`).toHaveText(/\S/);
      }
      await open(page, `otp-error-${locale}`);
      await expect.soft(page.locator("#otp")).toHaveAttribute("aria-describedby", "input-error-otp-code");
      await open(page, `otp-setup-error-${locale}`);
      await expect.soft(page.locator("#totp")).toHaveAttribute("aria-describedby", "input-error-otp-code");
      await expect.soft(page.locator("#totp")).toBeFocused();
      // "Try another way" submits its form: a button, not a link.
      await open(page, `otp-${locale}`);
      await expect.soft(page.locator("button#try-another-way")).toBeVisible();
    }
  });

  // 7-3 close: an expired setup link always has a way on, with or without a client, and a route to the coordinator.
  test("expired link: sign in and the coordinator", async ({ page }) => {
    for (const locale of LOCALES) {
      for (const name of ["setup-expired", "setup-expired-no-client"]) {
        await open(page, `${name}-${locale}`);
        await expect.soft(page.locator("#backToApplication"), `${name}-${locale}: sign in`).toBeVisible();
        await expect.soft(page.locator("#kc-contact-coordinator"), `${name}-${locale}: coordinator`)
          .toHaveAttribute("href", new RegExp(`/${locale}/whatsapp$`));
      }
      await open(page, `setup-expired-no-client-${locale}`);
      await expect.soft(page.locator("#backToApplication")).toHaveAttribute("href", new RegExp(`/${locale}/portal$`));
    }
  });

  // 7-3 close: the password rule ticks as the person types (a hint; the realm's policy still decides).
  test("password rule ticks as you type", async ({ page }) => {
    await open(page, "setup-password-en");
    const field = page.locator("#password-new");
    await expect(page.locator("#kc-password-rule li[data-met]")).toHaveCount(0);
    await field.fill("Abcdefghijk1!");
    await expect(page.locator("#kc-password-rule li:not([data-met])")).toHaveCount(0);
    await expect(page.locator("#kc-password-rule li[data-rule=upper] .rs-rule-state")).toHaveText(" (done)");
    await field.fill("abc");
    await expect(page.locator("#kc-password-rule li[data-rule=upper]")).not.toHaveAttribute("data-met");
    // As Keycloak's policy: an Arabic letter is a letter, never a symbol.
    await field.fill("كلمة");
    await expect(page.locator("#kc-password-rule li[data-rule=special]")).not.toHaveAttribute("data-met");
  });

  for (const locale of LOCALES) for (const width of [390, 1440]) {
    test(`shots (${locale}, ${width})`, async ({ page }) => {
      test.skip(!folder, "set AREA7_SHOTS to write shots");
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const name of PAGES) {
        await open(page, `${name}-${locale}`);
        await page.screenshot({ path: shot(`${name}-${locale}-${width}`), fullPage: true });
      }
    });
  }
});
