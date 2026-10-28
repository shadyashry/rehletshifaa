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

// Keep in step with Render.java's scenarios.
const PAGES = [
  "login", "login-error", "reset-password", "setup-start", "setup-start-two", "setup-password", "setup-password-error",
  "setup-done", "setup-expired",
  "verify-email", "verify-email-sent", "otp-setup", "otp", "otp-error", "passkey-setup", "passkey",
] as const;
const LOCALES = ["en", "ar"] as const;

async function open(page: Page, name: string) {
  await page.goto(pathToFileURL(path.join(harness ?? "", `${name}.html`)).href);
  await page.evaluate(async () => { await document.fonts.ready; });
}

test.describe("Keycloak theme", () => {
  test.skip(!harness, "set KC_HARNESS_DIR to the theme harness output");

  test("every harness page was rendered", () => {
    const pages = readFileSync(path.join(harness ?? "", "pages.txt"), "utf8").trim().split("\n");
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
          // Second-factor pages show the account in the title slot instead of a heading until 7-3 gives them one.
          if (!/^(otp|passkey)/.test(name)) {
            expect.soft(facts.heading, `${where}: heading face`).toMatch(/^Alexandria/);
          }
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
  // Keys a page may still take from Keycloak's own bundles (Render.java lists them in stock-keys.txt): reviewed as
  // plain enough, or app names.
  const STOCK_OK = new Set([
    "showPassword", "hidePassword", "passwordConfirm", "logoutOtherSessions",
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
            if (!parent || parent.closest("script, style, noscript, [role=menuitem]")) continue;
            if (n.textContent?.trim()) out.push(n.textContent.trim());
          }
          for (const el of document.querySelectorAll("[aria-label], [alt], [placeholder], [title], input[type=submit], input[type=button]")) {
            // The QR image's alt is hard-coded in Keycloak's login-config-totp.ftl; 7-3 overrides that template.
            if (el.id === "kc-totp-secret-qr-code") continue;
            for (const attr of ["aria-label", "alt", "placeholder", "title"]) { const v = el.getAttribute(attr); if (v?.trim()) out.push(v.trim()); }
            if (el instanceof HTMLInputElement && el.value.trim()) out.push(el.value.trim());
          }
          return out;
        });
        const copy = strings.map(s => NOT_COPY.reduce((t, re) => t.replace(re, ""), s));
        const where = `${name}-${locale}`;
        expect.soft(copy.filter(s => RAW_KEY.test(s)), `${where}: raw message keys`).toEqual([]);
        expect.soft(copy.filter(s => KEYCLOAK_VOICE.test(s)), `${where}: Keycloak's voice`).toEqual([]);
        if (locale === "ar") expect.soft(copy.filter(s => /[A-Za-z]{2,}/.test(s)), `${where}: English on the Arabic page`).toEqual([]);
      }
    });
  }

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
