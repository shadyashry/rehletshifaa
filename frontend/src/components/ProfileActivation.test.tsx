import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProfileActivation } from "./ProfileActivation";

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
  givenName: "Link", familyName: "Patient", preferredName: null, legacyFullName: null, nameConfirmationRequired: false,
  candidateEmail: "link@local.test", emailVerified: false,
  knownMobile: "+254700000020", mobileOwner: "PATIENT", phoneVerified: true,
  dateOfBirth: null, nationality: null, countryOfResidence: "KE", preferredLanguage: "en", sex: null,
  submittedBy: "PATIENT", representativeName: null, representativeRelationship: null,
  requiredConsents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"],
  completedConsents: [], deposit,
};

const completed = (account: { status: string; emailHint: string | null; awaitingEmail: boolean; emailSent: boolean } = setupPending, extra: Record<string, unknown> = {}) => ({
  profileActive: true, accountLinked: false, account, caseNumber: "RS-2026-000123", caseStatus: "ACCEPTED", onboardingState: "COMPLETED",
  currentAction: account.status === "ACTIVE" ? "NONE" : "SET_UP_ACCOUNT", journeyStage: account.status === "ACTIVE" ? "DEPOSIT" : "ACCOUNT_SETUP", waitingOn: "STAFF", deposit, ...extra,
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
  render(<ProfileActivation locale="en" token="tok-000" />);

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
    render(<ProfileActivation locale="en" token="tok-000" />);
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
    expect(screen.getByText(/submitted by Omar Hassan \(parent\)/i)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /use this email/i })).toBeNull();
    expect(screen.getByLabelText(/^email address/i)).toBeTruthy();
  });

  it("asks a legacy patient to confirm their name instead of splitting it", async () => {
    await reachForm({}, { givenName: null, familyName: null, legacyFullName: "Maria da Silva Santos", nameConfirmationRequired: true });
    expect(screen.getByText(/we never split names automatically/i)).toBeTruthy();
    expect((screen.getByLabelText(/given name/i) as HTMLInputElement).value).toBe("");
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
    expect(await screen.findByText(/date of birth cannot be in the future/i)).toBeTruthy();
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

  it("skips account setup for an already-active account and finishes before mentioning any money", async () => {
    await reachForm({ "/activate": () => json(completed(active)) });
    await fillRequired();
    submit();

    expect(await screen.findByRole("heading", { name: /your profile is ready/i })).toBeTruthy();
    expect(screen.getByText(/next step/i)).toBeTruthy();
    expect(screen.queryByText(/3,000/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /view deposit details/i }));
    expect(await screen.findByRole("heading", { name: /deposit arrangements/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/3,000/)).toBeTruthy());
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

  it("gives the patient no action at all while staff arrange the offline deposit", async () => {
    await reachForm({ "/activate": () => json(completed(active)) });
    await fillRequired();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: /view deposit details/i }));

    expect(screen.getByRole("heading", { name: /deposit arrangements/i })).toBeTruthy();
    expect(screen.getByText(/no action is required from you right now/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /check payment status/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^pay/i })).toBeNull();
    for (const control of screen.getAllByRole("button")) expect(control.className).not.toContain("btn-primary");
    expect(screen.getByRole("button", { name: /go to my case/i }).className).not.toContain("btn-primary");
  });

  it("sends a patient with a set-up account to sign in on their own case", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { href: "/en/activate/tok-000", assign } });
    await reachForm({
      "/activate": () => json(completed(active, { caseStatus: "TRAVEL_COORDINATION", currentAction: "CONTINUE_IN_PORTAL", journeyStage: "CARE_COORDINATION", deposit: { ...deposit, status: "PAID", satisfied: true, amountPaid: 3000, balance: 0 } })),
      "/portal-access": () => json({ activationToken: null, alreadyLinked: true, account: active, caseId: "case-1" }),
    });
    await fillRequired();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: /go to my case/i }));
    // Straight to sign-in on the current case — never the public homepage, never a search for the case.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/en/portal?case=case-1&signin=1"));
  });

  it("still hands a legacy account-less profile its one-time binding", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { href: "/en/activate/tok-000", assign } });
    await reachForm({
      "/activate": () => json(completed(notProvisioned, { currentAction: "CONTINUE_IN_PORTAL", journeyStage: "CARE_COORDINATION", deposit: { ...deposit, satisfied: true } })),
      "/portal-access": () => json({ activationToken: "bind-123", alreadyLinked: false, account: notProvisioned, caseId: "case-1" }),
    });
    await fillRequired();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: /go to my case/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/en/portal?case=case-1&activate=bind-123"));
  });

  it("reports an invalid or expired link without exposing anything else", async () => {
    vi.stubGlobal("fetch", stub({ "000": () => json({ code: "CASE_LINK_INVALID" }, false, 404) }));
    render(<ProfileActivation locale="en" token="tok-000" />);
    expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
  });

  it("renders the Arabic journey for RTL locales", async () => {
    vi.stubGlobal("fetch", stub({ "000": () => json(summary) }));
    render(<ProfileActivation locale="ar" token="tok-000" />);
    expect(await screen.findByRole("heading", { name: /لنتأكد أنه أنت/ })).toBeTruthy();
  });
});
