import { describe, test } from "@e2e-dev/web";
import { expect } from "e2e";

/**
 * Journey A — public case submission, driven by an agent against the real backend.
 *
 * The deterministic wizard checks (validation, retry idempotency, payload shape) stay in `e2e/case-flow.spec.ts`.
 * These tests ask whether someone who only reads the screen can send a case, in either language, and pin each
 * outcome exactly. All values are synthetic.
 */

const CASE_NUMBER = /^RS-\d{4}-\d{6}$/;
const STATUS_LINK = (locale: string) => new RegExp(`/${locale}/status/[0-9a-f]{40,}`);

describe("case submission", { tags: ["intake"] }, () => {
  test("a patient sends their own case and gets a case number and a tracking link", async ({ app, agent, screen }) => {
    await app.open("/en/send-my-case");
    await expect(screen.getByRole("heading", "Send your medical case")).toBeVisible();

    await agent.act(
      "send the case for yourself: fill in the contact details with given name {given}, family name {family}, " +
        "country of residence {country} and WhatsApp number {phone}, then continue to the next step",
      { params: { given: "Agentic", family: "Intake", country: "Kenya", phone: "700000000" } },
    );
    await expect(screen.getByText("Tell us briefly about your condition", { exact: false })).toBeVisible();

    await agent.act("describe the condition as {description}, leave the care area unselected, and continue", {
      params: { description: "Synthetic test case: knee pain after a sports injury." },
    });
    await expect(screen.getByText("I consent to RehletShifaa", { exact: false })).toBeVisible();

    await agent.act("give consent and send the case");
    await expect(screen.getByRole("heading", "Your case has been received")).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByText(CASE_NUMBER)).toBeVisible();
    // The status link is the patient's only way back into the case, so it must be offered here.
    await expect(screen.getByRole("link", "Track your case")).toHaveAttribute("href", STATUS_LINK("en"));
    await agent.assert("the confirmation says a coordinator will guide the patient through the next steps");
  });

  test("a relative sends a case in Arabic on the patient's behalf", async ({ app, agent, screen, browser }) => {
    await app.open("/ar/send-my-case");
    await expect(screen.getByRole("heading", "أرسل حالتك الطبية")).toBeVisible();

    await agent.act(
      "send the case for someone else: the patient's given name is {given} and family name {family}, country of " +
        "residence {country}; you are {representative}, the patient's parent; WhatsApp number {phone}. Then continue",
      {
        params: { given: "ليلى", family: "حسن", country: "Kenya", representative: "عمر حسن", phone: "700000006" },
      },
    );
    await expect(screen.getByText("أخبرنا باختصار عن حالتك", { exact: false })).toBeVisible();

    await agent.act("skip the optional details and continue to the review step");
    await expect(screen.getByText("أوافق على معالجة رحلة شفاء", { exact: false })).toBeVisible();
    await agent.assert("the review shows the case is submitted by a representative on the patient's behalf");

    await agent.act("give consent and send the case");
    await expect(screen.getByRole("heading", "تم استلام حالتك")).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByText(CASE_NUMBER)).toBeVisible();
    await expect(screen.getByRole("link", "متابعة حالة الطلب")).toHaveAttribute("href", STATUS_LINK("ar"));
    await expect(browser).toHaveURL(/\/ar\//);
  });
});
