import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProfileActivation } from "./ProfileActivation";

/**
 * Drives the activation journey through a stubbed API: verify -> prefilled form -> validation errors ->
 * activation -> deposit -> journey handoff. Only the contract with the backend is stubbed; the component's
 * own state machine, prefill and error rendering are exercised for real.
 */
const deposit = { required: true, status: "REQUESTED", currency: "EGP", amountDue: 3000, amountPaid: 0, balance: 3000, satisfied: false };

const prefill = {
  caseNumber: "RS-2026-000123", caseStatus: "ACCEPTED", onboardingState: "IN_PROGRESS", profileActive: false, accountLinked: false,
  fullName: "Link Patient", email: "link@local.test", phone: "+254700000020", dateOfBirth: null,
  nationality: null, countryOfResidence: "KE", preferredLanguage: "en", sex: null,
  emailVerified: false, phoneVerified: true,
  requiredConsents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"],
  completedConsents: [], deposit,
};

function json(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

/** Route the component's calls by URL suffix so tests describe intent, not call order. */
function stub(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((url: string) => {
    const match = Object.keys(routes).find(suffix => String(url).endsWith(suffix));
    if (!match) throw new Error(`Unstubbed call: ${url}`);
    return routes[match]();
  });
}

const summary = { caseNumber: "RS-2026-000123", purpose: "ONBOARDING", channel: "WHATSAPP", destinationHint: "***0020" };

async function reachForm(overrides: Record<string, () => Promise<Response>> = {}) {
  const fetchMock = stub({
    "/request-access": () => json(summary),
    "/verify": () => json({ grant: "grant-1", expiresAt: new Date().toISOString() }),
    "/profile": () => json(prefill),
    ...overrides,
    "/activate": overrides["/activate"] ?? (() => json({ profileActive: true, caseNumber: "RS-2026-000123", caseStatus: "ACCEPTED", onboardingState: "COMPLETED", deposit })),
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
  screen.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
}

describe("ProfileActivation", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("verifies with a one-time code before any profile data is shown", async () => {
    vi.stubGlobal("fetch", stub({ "000": () => json(summary) }));
    render(<ProfileActivation locale="en" token="tok-000" />);
    expect(await screen.findByRole("heading", { name: /confirm it's you/i })).toBeTruthy();
    // Nothing about the patient is on screen until the code is verified.
    expect(screen.queryByDisplayValue("Link Patient")).toBeNull();
  });

  it("pre-fills what the patient already provided", async () => {
    await reachForm();
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe("Link Patient");
    expect((screen.getByLabelText(/whatsapp number/i) as HTMLInputElement).value).toBe("+254700000020");
    expect(screen.getByText(/already filled in the information/i)).toBeTruthy();
  });

  it("shows backend field errors against the right fields and keeps entered data", async () => {
    await reachForm({
      "/activate": () => json({
        code: "VALIDATION_FAILED", message: "The request contains invalid fields",
        errors: [{ field: "dateOfBirth", message: "The date of birth cannot be in the future." }],
      }, false, 400),
    });
    await fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /activate profile/i }));
    expect(await screen.findByText(/date of birth cannot be in the future/i)).toBeTruthy();
    // The form is still populated — nothing the patient typed was lost.
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe("Link Patient");
  });

  it("moves to the deposit step with the backend-resolved amount after activation", async () => {
    await reachForm();
    await fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /activate profile/i }));
    expect(await screen.findByRole("heading", { name: /coordination deposit/i })).toBeTruthy();
    // The amount is rendered from the server payload; the client never computes it.
    await waitFor(() => expect(screen.getByText(/3,000/)).toBeTruthy());
  });

  it("shows the journey handoff once the deposit is settled", async () => {
    await reachForm({
      "/activate": () => json({
        profileActive: true, caseNumber: "RS-2026-000123", caseStatus: "TRAVEL_COORDINATION",
        onboardingState: "COMPLETED", deposit: { ...deposit, status: "PAID", satisfied: true, amountPaid: 3000, balance: 0 },
      }),
    });
    await fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /activate profile/i }));
    expect(await screen.findByRole("heading", { name: /journey is now active/i })).toBeTruthy();
    expect(screen.getByText(/deposit received/i)).toBeTruthy();
  });

  it("hands the finished journey over to the authenticated portal in one step", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { href: "/en/activate/tok-000", assign } });
    await reachForm({
      "/activate": () => json({
        profileActive: true, accountLinked: false, caseNumber: "RS-2026-000123", caseStatus: "TRAVEL_COORDINATION",
        onboardingState: "COMPLETED", deposit: { ...deposit, status: "PAID", satisfied: true, amountPaid: 3000, balance: 0 },
      }),
      "/portal-access": () => json({ activationToken: "bind-123", alreadyLinked: false }),
    });
    await fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /activate profile/i }));
    fireEvent.click(await screen.findByRole("button", { name: /view my journey/i }));
    // The account binding travels to the portal, which is where every authorized case becomes visible.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/en/portal?activate=bind-123"));
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
