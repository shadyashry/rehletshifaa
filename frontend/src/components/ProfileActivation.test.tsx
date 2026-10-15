import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ProfileActivation } from "./ProfileActivation";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

/**
 * Drives the activation journey through a stubbed API: verify -> prefilled form -> validation errors ->
 * profile completion -> account setup -> deposit -> journey handoff. Only the contract with the backend is
 * stubbed; the component's own state machine, prefill and error rendering are exercised for real.
 */
const deposit = { required: true, status: "REQUESTED", currency: "EGP", amountDue: 3000, amountPaid: 0, balance: 3000, satisfied: false };
const notProvisioned = { status: "NOT_PROVISIONED", emailHint: null as string | null, awaitingEmail: false, emailSent: false };
const setupPending = { status: "SETUP_PENDING", emailHint: "li***@local.test", awaitingEmail: true, emailSent: true };
const active = { status: "ACTIVE", emailHint: "li***@local.test", awaitingEmail: false, emailSent: false };

const prefill = {
  caseNumber: "RS-2026-000123", caseStatus: "ACCEPTED", onboardingState: "IN_PROGRESS", profileActive: false, accountLinked: false, account: notProvisioned,
  givenName: "Link", familyName: "Patient", preferredName: null,
  candidateEmail: "link@local.test", emailVerified: false,
  knownMobile: "+254700000020", mobileOwner: "PATIENT", phoneVerified: true,
  dateOfBirth: null, nationality: null, countryOfResidence: "KE", preferredLanguage: "en", sex: null,
  submittedBy: "PATIENT", representativeName: null, representativeRelationship: null,
  requiredConsents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"],
  completedConsents: [], deposit,
};

const completed = (account: { status: string; emailHint: string | null; awaitingEmail: boolean; emailSent: boolean } = setupPending, extra: Record<string, unknown> = {}) => ({
  profileActive: true, accountLinked: false, account, caseNumber: "RS-2026-000123", caseStatus: "ACCEPTED", onboardingState: "COMPLETED",
  currentAction: account.status === "ACTIVE" ? "CONTINUE_IN_PORTAL" : "SET_UP_ACCOUNT", journeyStage: account.status === "ACTIVE" ? "DEPOSIT" : "ACCOUNT_SETUP", waitingOn: "STAFF", deposit, ...extra,
});

function json(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

/** Route the component's calls by URL suffix so tests describe intent, not call order. */
function stub(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((url: string, _init?: RequestInit) => {
    const match = Object.keys(routes).find(suffix => String(url).endsWith(suffix));
    if (!match) throw new Error(`Unstubbed call: ${url}`);
    return routes[match]();
  });
}

const summary = { caseNumber: "RS-2026-000123", purpose: "ONBOARDING", channel: "WHATSAPP", destinationHint: "***0020" };

async function reachForm(overrides: Record<string, () => Promise<Response>> = {}, prefillOverride: Record<string, unknown> = {}) {
  const fetchMock = stub({
    "/request-access": () => json(summary),
    "/verify": () => json({ grant: "grant-1", expiresAt: new Date().toISOString() }),
    "/profile": () => json({ ...prefill, ...prefillOverride }),
    ...overrides,
    "/activate": overrides["/activate"] ?? (() => json(completed())),
    // The bare summary GET has no suffix beyond the token, so it is matched last.
    "000": () => json(summary),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ProfileActivation locale="en" token="tok-000" copy={en.secureLink.activation} />);

  fireEvent.click(await screen.findByRole("button", { name: /send code/i }));
  const code = await screen.findByLabelText(/6-digit code/i);
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await screen.findByRole("heading", { name: /complete your profile/i });
  return fetchMock;
}

/** Supply everything the case did not already contain, the way a patient completes the form. */
async function fillRequired() {
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: "1990-01-01" } });
  fireEvent.change(screen.getByLabelText(/^sex/i), { target: { value: "MALE" } });
  const nationality = screen.getByLabelText(/nationality/i);
  fireEvent.focus(nationality);
  fireEvent.change(nationality, { target: { value: "Kenya" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: /Kenya/i }));
  screen.getAllByRole("checkbox").forEach(box => { if (!(box as HTMLInputElement).checked) fireEvent.click(box); });
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

describe("ProfileActivation", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("verifies with a one-time code before any profile data is shown", async () => {
    vi.stubGlobal("fetch", stub({ "000": () => json(summary) }));
    render(<ProfileActivation locale="en" token="tok-000" copy={en.secureLink.activation} />);
    expect(await screen.findByRole("heading", { name: /confirm it's you/i })).toBeTruthy();
    // Nothing about the patient is on screen until the code is verified.
    expect(screen.queryByDisplayValue("Link")).toBeNull();
  });

  it("pre-fills the structured name, contact and country the patient already provided", async () => {
    await reachForm();
    expect((screen.getByLabelText(/given name/i) as HTMLInputElement).value).toBe("Link");
    expect((screen.getByLabelText(/^family name \/ surname/i) as HTMLInputElement).value).toBe("Patient");
    expect(screen.getByText("+254700000020")).toBeTruthy();
    expect(screen.getByText(/we've filled in what you already shared/i)).toBeTruthy();
    // Known email is offered as a candidate — masked, never assumed.
    expect(screen.getByText("li***@local.test")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /use this email/i })).toBeTruthy();
    // Case data (care area, concern, documents) is nowhere on this form.
    expect(screen.queryByLabelText(/care area|condition|documents/i)).toBeNull();
    // No registration wording anywhere.
    expect(screen.queryByText(/register/i)).toBeNull();
  });

  it("requires an account email when the case had none", async () => {
    await reachForm({}, { candidateEmail: null });
    await fillRequired();
    submit();
    expect(await screen.findByText(/enter the email address you will use to sign in/i)).toBeTruthy();
  });

  it("lets the patient use another email than the one from the case", async () => {
    const fetchMock = await reachForm();
    fireEvent.click(screen.getByRole("radio", { name: /use another email/i }));
    fireEvent.change(screen.getByLabelText(/^email address/i), { target: { value: "other@local.test" } });
    await fillRequired();
    submit();
    await screen.findByRole("heading", { name: /profile information is complete/i });
    const activateCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/activate"));
    expect(JSON.parse(String((activateCall?.[1] as RequestInit | undefined)?.body)).profile.email).toBe("other@local.test");
  });

  it("asks who the known number belongs to and never stores a representative's number as the patient's", async () => {
    const fetchMock = await reachForm();
    fireEvent.click(screen.getByRole("radio", { name: /family member/i }));
    expect(screen.getByText(/belongs to your representative and stays theirs/i)).toBeTruthy();
    // A personal number is optional in that case.
    expect(screen.getByLabelText(/your own whatsapp/i)).toBeTruthy();
    await fillRequired();
    submit();
    await screen.findByRole("heading", { name: /profile information is complete/i });
    const body = JSON.parse(String((fetchMock.mock.calls.find(([url]) => String(url).endsWith("/activate"))?.[1] as RequestInit | undefined)?.body)).profile;
    expect(body.mobileOwner).toBe("REPRESENTATIVE");
    expect(body.phone).toBeNull();
  });

  it("explains a representative-submitted case and asks the patient for their own account email", async () => {
    await reachForm({}, { submittedBy: "REPRESENTATIVE", representativeName: "Omar Hassan", representativeRelationship: "PARENT", candidateEmail: null, knownMobile: "+254700000006", mobileOwner: "REPRESENTATIVE" });
    // The name is bidi-isolated inside the sentence.
    expect(screen.getByText(/submitted by ⁨?Omar Hassan⁩? \(parent\)/i)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /use this email/i })).toBeNull();
    expect(screen.getByLabelText(/^email address/i)).toBeTruthy();
  });

  it("shows backend field errors against the right fields and keeps entered data", async () => {
    await reachForm({
      "/activate": () => json({
        code: "VALIDATION_FAILED", message: "The request contains invalid fields",
        errors: [{ field: "dateOfBirth", message: "The date of birth cannot be in the future." }],
      }, false, 400),
    });
    await fillRequired();
    submit();
    // The backend names the field; the words are the page's own, never its English message.
    expect(await screen.findByText(en.secureLink.activation.errDobInvalid)).toBeTruthy();
    expect(screen.queryByText(/date of birth cannot be in the future/i)).toBeNull();
    await waitFor(() => expect(document.activeElement?.id).toBe("act-dateOfBirth"));
    // The form is still populated — nothing the patient typed was lost.
    expect((screen.getByLabelText(/given name/i) as HTMLInputElement).value).toBe("Link");
  });

  it("continues straight into account setup: no password on screen, a resend, no money", async () => {
    const fetchMock = await reachForm({ "/resend-setup": () => json(setupPending) });
    await fillRequired();
    submit();
    expect(await screen.findByRole("heading", { name: /profile information is complete/i })).toBeTruthy();
    expect(screen.getByText(/create your password to securely access/i)).toBeTruthy();
    expect(screen.getByText("li***@local.test")).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByText(/3,000/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /resend setup link/i }));
    expect(await screen.findByText(/new setup link is on its way/i)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/resend-setup"))).toHaveLength(1);
  });

  it("skips account setup for an already-active account and names the unpaid deposit as the next step, paid in My Care", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { href: "/en/activate/tok-000", assign } });
    await reachForm({ "/activate": () => json(completed(active)), "/portal-access": () => json({ alreadyLinked: true, account: active, caseId: "case-1" }) });
    await fillRequired();
    submit();

    expect(await screen.findByRole("heading", { name: /your profile is ready/i })).toBeTruthy();
    expect(screen.getByText("Next step")).toBeTruthy();
    expect(screen.getByText(/you pay it in My Care, by bank transfer or through an agent/i)).toBeTruthy();
    // Only what is true is ticked: the deposit is owed, so it is not on the finished list.
    expect(screen.queryByText("Deposit received")).toBeNull();
    expect(screen.getByText("Account secured")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pay your coordination deposit" })).toBeTruthy();
    expect(screen.getByText(/3,000/)).toBeTruthy();
    const pay = screen.getByRole("button", { name: /sign in to pay/i });
    expect(pay.className).toContain("btn-primary");
    expect(screen.getAllByRole("button").filter(b => b.className.includes("btn-primary"))).toHaveLength(1);
    fireEvent.click(pay);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/en/portal?case=case-1&signin=1"));
  });

  it("on a return visit after activation never claims a deposit that was not paid", async () => {
    await reachForm({}, { profileActive: true, account: active, currentAction: "CONTINUE_IN_PORTAL", journeyStage: "DEPOSIT" }).catch(() => {});
    expect(await screen.findByRole("heading", { name: /your profile is ready/i })).toBeTruthy();
    expect(screen.queryByText("Deposit received")).toBeNull();
    expect(screen.queryByText(/treatment journey is now active/i)).toBeNull();
    expect(screen.getByRole("button", { name: /sign in to pay/i })).toBeTruthy();
  });

  it("on a return visit with the deposit received says the coordination is underway", async () => {
    await reachForm({}, { profileActive: true, account: active, currentAction: "CONTINUE_IN_PORTAL", journeyStage: "CARE_COORDINATION",
      deposit: { ...deposit, status: "PAID", satisfied: true, amountPaid: 3000, balance: 0 } }).catch(() => {});
    expect(await screen.findByRole("heading", { name: /your treatment journey is now active/i })).toBeTruthy();
    expect(screen.getByText("Deposit received")).toBeTruthy();
    expect(screen.queryByText(/shortly/i)).toBeNull();
    expect(screen.getByRole("button", { name: /sign in to my case/i })).toBeTruthy();
  });

  it("resumes on the account-setup screen when the profile is done but the password is not", async () => {
    await reachForm({}, { profileActive: true, account: setupPending, currentAction: "SET_UP_ACCOUNT", journeyStage: "ACCOUNT_SETUP" }).catch(() => {});
    expect(await screen.findByRole("heading", { name: /profile information is complete/i })).toBeTruthy();
  });

  it("never shows a payment control while the profile is still incomplete", async () => {
    await reachForm();
    for (const gone of [/deposit/i, /pay/i, /payment status/i]) expect(screen.queryByRole("button", { name: gone })).toBeNull();
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeTruthy();
  });

  it("sends a patient with a set-up account to sign in on their own case", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { href: "/en/activate/tok-000", assign } });
    await reachForm({
      "/activate": () => json(completed(active, { caseStatus: "TRAVEL_COORDINATION", currentAction: "CONTINUE_IN_PORTAL", journeyStage: "CARE_COORDINATION", deposit: { ...deposit, status: "PAID", satisfied: true, amountPaid: 3000, balance: 0 } })),
      "/portal-access": () => json({ alreadyLinked: true, account: active, caseId: "case-1" }),
    });
    await fillRequired();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: /sign in to my case/i }));
    // Straight to sign-in on the current case — never the public homepage, never a search for the case.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/en/portal?case=case-1&signin=1"));
  });

  it("returns to account setup when the portal handoff awaits account setup email", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { href: "/en/activate/tok-000", assign } });
    await reachForm({
      "/activate": () => json(completed(notProvisioned, { currentAction: "CONTINUE_IN_PORTAL", journeyStage: "CARE_COORDINATION", deposit: { ...deposit, satisfied: true } })),
      "/portal-access": () => json({ alreadyLinked: false, account: setupPending, caseId: "case-1" }),
    });
    await fillRequired();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: /sign in to my case/i }));
    expect(await screen.findByRole("heading", { name: /profile information is complete/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /resend setup link/i })).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("reports an invalid or expired link without exposing anything else", async () => {
    vi.stubGlobal("fetch", stub({ "000": () => json({ code: "CASE_LINK_INVALID" }, false, 404) }));
    render(<ProfileActivation locale="en" token="tok-000" copy={en.secureLink.activation} />);
    expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
  });

  it("shows the deposit, refund and cancellation terms right above the consent that accepts them", async () => {
    await reachForm();
    const terms = screen.getByRole("region", { name: "Coordination deposit, refunds and cancellation" });
    expect(terms.textContent).toMatch(/EGP.3,000/);
    expect(within(terms).getByText(/Full refund if we cannot arrange your care, the provider does not accept your case/)).toBeTruthy();
    expect(within(terms).getByText(/You can cancel at any time by telling your coordinator/)).toBeTruthy();
    const consent = screen.getByRole("checkbox", { name: "I have read the coordination deposit, refund and cancellation terms shown above and accept them." });
    expect(consent.getAttribute("aria-describedby")).toBe("activation-deposit-terms");
    expect(terms.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing the business has not decided: no refund timing, no provider charges, no old wording.
    expect(document.body.textContent).not.toMatch(/within 14 days|provider.{0,20}charges|accepted care estimate|I have read and accept the coordination deposit, cancellation and refund terms/i);
  });

  it("renders the Arabic journey for RTL locales", async () => {
    vi.stubGlobal("fetch", stub({ "000": () => json(summary) }));
    render(<ProfileActivation locale="ar" token="tok-000" copy={ar.secureLink.activation} />);
    expect(await screen.findByRole("heading", { name: /لنتأكد أنه أنت/ })).toBeTruthy();
  });
});

describe("ProfileActivation — completing the file (slice D)", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const t = en.secureLink.activation;

  it("seals the page with the case, where the code goes, the never-ask line, and steps drawn as the journey", async () => {
    vi.stubGlobal("fetch", stub({ "000": () => json(summary) }));
    render(<ProfileActivation locale="en" token="tok-000" copy={t} />);
    await screen.findByRole("heading", { level: 1, name: t.verifyTitle });
    expect(screen.getByText("RS-2026-000123")).toBeTruthy();
    expect(screen.getByText(t.neverAsk)).toBeTruthy();
    const steps = screen.getByRole("list", { name: "Step 1 of 3" });
    expect(steps.querySelector("[aria-current=step]")?.textContent).toContain(t.steps[0]);
    expect(steps.textContent).not.toContain("✓");
  });

  it("says a wrong code in its own words", async () => {
    vi.stubGlobal("fetch", stub({
      "/request-access": () => json(summary),
      "/verify": () => json({ code: "VERIFICATION_INVALID", message: "The verification code is invalid or has expired" }, false, 400),
      "000": () => json(summary),
    }));
    render(<ProfileActivation locale="en" token="tok-000" copy={t} />);
    fireEvent.click(await screen.findByRole("button", { name: /send code/i }));
    fireEvent.change(await screen.findByLabelText(/6-digit code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByText(t.codeInvalid)).toBeTruthy();
    expect(screen.queryByText(/verification code is invalid/)).toBeNull();
  });

  it("ends on the no-longer-works page with the reason when the case can no longer be activated", async () => {
    vi.stubGlobal("fetch", stub({
      "/request-access": () => json({ code: "CASE_NOT_ACTIVATABLE", message: "This case is no longer active." }, false, 409),
      "000": () => json(summary),
    }));
    render(<ProfileActivation locale="en" token="tok-000" copy={t} />);
    fireEvent.click(await screen.findByRole("button", { name: /send code/i }));
    expect(await screen.findByRole("heading", { level: 1, name: t.invalidTitle })).toBeTruthy();
    expect(screen.getByText(t.invalidInactive)).toBeTruthy();
  });

  it("marks the details step current and the verify step completed, in words", async () => {
    await reachForm();
    const steps = screen.getByRole("list", { name: "Step 2 of 3" });
    expect(steps.querySelector("[aria-current=step]")?.textContent).toContain(t.steps[1]);
    expect(steps.textContent).toContain(`(${t.stepCompleted})`);
  });

  it("offers the known email and the number's owner as choice cards", async () => {
    await reachForm();
    const email = screen.getByRole("radiogroup", { name: t.accountEmail });
    expect(within(email).getAllByRole("radio")).toHaveLength(2);
    expect(within(email).getByText("li***@local.test")).toBeTruthy();
    const owner = screen.getByRole("radiogroup", { name: t.belongsTo });
    expect(within(owner).getByRole("radio", { name: t.ownerMe })).toBeTruthy();
  });

  it("never renders a consent's code; one with no words is named generically", async () => {
    await reachForm({}, { requiredConsents: ["PRIVACY_DATA_PROCESSING", "SOMETHING_NEW"] });
    expect(screen.queryByText("SOMETHING_NEW")).toBeNull();
    expect(screen.getByText(t.consentUnknown)).toBeTruthy();
  });

  it("with no number on file, an empty phone is a phone error on the phone field", async () => {
    await reachForm({}, { knownMobile: null, mobileOwner: null });
    submit();
    expect(await screen.findByText(t.errPhone)).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe("act-dateOfBirth"));
    expect(screen.queryByText(t.errOwner)).toBeNull();
  });

  it("an agreement without words cannot be accepted, and says why", async () => {
    await reachForm({}, { requiredConsents: ["SOMETHING_NEW"] });
    const box = screen.getByRole("checkbox", { name: t.consentUnknown }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    await fillRequired();
    submit();
    expect(await screen.findByText(t.consentBlocked)).toBeTruthy();
  });

  it("returns to the code step, without an error tone, when the session lapses on account setup", async () => {
    await reachForm({ "/resend-setup": () => json({ code: "VERIFICATION_REQUIRED" }, false, 401) });
    await fillRequired();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: t.accountResend }));
    expect(await screen.findByText(t.sessionExpired)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: t.verifyTitle })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("never prints a placeholder address when the account email is unknown", async () => {
    await reachForm({ "/activate": () => json(completed({ ...setupPending, emailHint: null })) });
    await fillRequired();
    submit();
    expect(await screen.findByText(t.accountSentNoAddress)).toBeTruthy();
    expect(screen.queryByText("***")).toBeNull();
  });

  it("moves focus to the first missing field", async () => {
    await reachForm();
    submit();
    await screen.findByText(t.errDob);
    await waitFor(() => expect(document.activeElement?.id).toBe("act-dateOfBirth"));
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
  });
});
