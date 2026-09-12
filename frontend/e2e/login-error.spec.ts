import { expect, test } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";

/**
 * The branded sign-in page (real Keycloak, RehletShifaa theme) on a failed attempt: one generic,
 * accessible error — never "email does not exist" versus "password is incorrect" — rendered once, with
 * quiet invalid fields and no raw identity-provider wording. Runs only against a live stack.
 */
const live = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "true";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

for (const locale of ["en", "ar"] as const) {
  test(`a failed sign-in shows one generic error (${locale})`, async ({ page }) => {
    test.skip(!live, "needs the live Keycloak behind the tunnel stack");
    const authorize = `${OIDC_AUTHORITY}/protocol/openid-connect/auth?client_id=rehletshifaa-web&redirect_uri=${encodeURIComponent(`${baseURL}/auth/callback`)}&response_type=code&scope=openid&prompt=login&ui_locales=${locale}&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`; // PKCE is mandatory for the web client; any well-formed challenge renders the form
    await page.goto(authorize);
    // Deliberately non-existent credentials: the page must answer exactly as it would for a wrong password.
    await page.locator("#username").fill("nobody-uat@example.invalid");
    await page.locator("#password").fill("not-a-real-password");
    await page.locator("#kc-login").click();

    const expected = locale === "ar" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : "Email or password is incorrect.";
    const error = page.locator("#input-error");
    await expect(error).toHaveCount(1);
    await expect(error).toHaveText(expected);
    await expect(error).toHaveAttribute("aria-live", "polite");
    // Said once: no alert banner repeating it, no second copy anywhere on the page.
    await expect(page.locator(".alert-error, .pf-c-alert.pf-m-danger")).toHaveCount(0);
    expect((await page.locator("body").innerText()).split(expected).length - 1).toBe(1);
    // Nothing that would let a caller tell the two failure causes apart.
    await expect(page.getByText(/does not exist|invalid username|invalid password|Invalid username or password/i)).toHaveCount(0);
    // Fields are flagged accessibly, and the invalid state is a thin border, not PatternFly's icon-in-field.
    await expect(page.locator("#username")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#password")).toHaveAttribute("aria-invalid", "true");
    const decoration = await page.locator("#username").evaluate(el => {
      const style = getComputedStyle(el);
      return { backgroundImage: style.backgroundImage, bottom: style.borderBottomWidth, top: style.borderTopWidth };
    });
    expect(decoration.backgroundImage).toBe("none");
    expect(decoration.bottom).toBe(decoration.top);
    // The username stays in the field and focus returns to it for another attempt.
    await expect(page.locator("#username")).toHaveValue("nobody-uat@example.invalid");
    await expect(page.locator("#username")).toBeFocused();
    await page.screenshot({ path: `e2e/screenshots/login-error-${locale}.png`, fullPage: true });
  });
}
