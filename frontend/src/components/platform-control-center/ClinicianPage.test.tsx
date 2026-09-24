import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ClinicianPage } from "./ClinicianPage";
import { DirectClinicianPage } from "./DirectClinicianPage";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, onboarding, organization, providerDetail, readiness } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "ops" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** Provider Operations: everything setup needs, but no credential review capability. */
const ops = ["provider.view", "provider.update", "credential.view", "credential.submit", "provider.relationship.manage", "provider.activate", "price_list.view", "availability.view", "provider.member.invite"];
const base = "/admin/providers/org-a/clinicians/prac-1";
const directoryRow = { organizationId: "org-a", organizationName: "Nile Care Clinic", organizationStatus: "ONBOARDING", organizationLegacyMapping: false, practitionerId: "prac-1", displayName: "Dr Salma Farouk", clinicianType: "CONSULTANT", onboardingStatus: "PROFILE_INCOMPLETE", membershipStatus: "ACTIVE", providerCredentialing: true, credentialsRequired: 1, credentialStatuses: { MISSING: 1 } };
const routes = (over: Record<string, unknown> = {}) => ({
  "/admin/providers/org-a": providerDetail, [`${base}/onboarding`]: onboarding, [`${base}/readiness`]: readiness(),
  [`${base}/credential-requirements`]: [{ type: "MEDICAL_LICENSE", displayName: "Medical licence", mandatory: true, expiryRequired: true }], [`${base}/credentials`]: [],
  [`${base}/profile`]: { registrationNumber: null, specialty: null, subspecialty: null, qualifications: null, jurisdiction: "EG", version: 4 },
  "/admin/providers/clinicians?organizationId=org-a": [directoryRow], ...over,
});
const verifiedButRoutingMissing = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, credentialReady: true,
  blockers: [{ code: "SERVICES_PRICING_INCOMPLETE", message: "At least one active price is required." }, { code: "AVAILABILITY_INCOMPLETE", message: "Clinician availability has not been configured." }, { code: "ROUTING_INCOMPLETE", message: "Routing preference missing." }, { code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "Required commercial or legal acceptance is missing." }] });
beforeEach(() => { vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes(), ops)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const section = (title: string) => screen.getByRole("heading", { level: 3, name: new RegExp(title) }).closest("li")!;

describe("Consultant Setup — one persistent workspace", () => {
  it("opens on Setup after the invitation, with the confirmation focused and six sections each naming who is responsible", async () => {
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" invited />);
    const list = await screen.findByRole("list", { name: "Consultant setup sections" });
    expect(screen.getByText(/Invitation sent\. Setup continues here/).closest(".cc-focus-target")).toHaveFocus();
    expect(within(list).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["1Account", "2Professional Profile", "3Credentials Submitted", "4Independent Credential Review", "5Operational Setup", "6Activation"]);
    expect(within(section("Account")).getByText("Complete")).toBeVisible();
    expect(within(section("Professional Profile")).getByText("Responsible: Provider Operations")).toBeVisible();
    expect(within(section("Professional Profile")).getByText("Professional details are missing.")).toBeVisible();
    expect(within(section("Independent Credential Review")).getByText("Responsible: Credential Review Team")).toBeVisible();
    expect(within(section("Independent Credential Review")).getByText("Starts once every required credential is submitted.")).toBeVisible();
    expect(screen.getByText(/2 of 6 sections complete|1 of 6 sections complete/)).toBeVisible();
    expect(screen.getByText("Professional Profile", { selector: "strong" })).toBeVisible();
    expect(section("Professional Profile")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("list", { name: "Setup steps" })).not.toBeInTheDocument();
  });

  it("never gives Provider Operations review controls; a reviewer gets only a contextual 'Open review' link", async () => {
    const submitted = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, blockers: [{ code: "CREDENTIAL_AWAITING_VERIFICATION", message: "Medical licence is awaiting verification." }] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ [`${base}/readiness`]: submitted }), ops));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="setup" />);
    const review = await waitFor(() => section("Independent Credential Review"));
    expect(within(review).getByText("Waiting")).toBeVisible();
    expect(within(review).getByText("Awaiting independent review.")).toBeVisible();
    expect(within(review).getByRole("button", { name: "View credential status" })).toBeVisible();
    expect(within(review).queryByRole("link", { name: "Open review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Verify|Reject|Approve/ })).not.toBeInTheDocument();
    cleanup();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ [`${base}/readiness`]: submitted }), [...ops, "credential.review"]));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="setup" />);
    expect(await screen.findByRole("link", { name: "Open review" })).toHaveAttribute("href", "/en/portal/control-center/credentials?org=org-a");
    expect(screen.queryByRole("button", { name: /Verify|Reject/ })).not.toBeInTheDocument();
  });

  it("summarizes operational setup truthfully and deep-links to the existing editors instead of duplicating them", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ [`${base}/readiness`]: verifiedButRoutingMissing }), [...ops, "assignment.policy.view"]));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="setup" />);
    const op = await waitFor(() => section("Operational Setup"));
    expect(within(op).getByText("No live price yet")).toBeVisible();
    expect(within(op).getByText("Not configured")).toBeVisible();
    expect(within(op).getByText("Needs configuration")).toBeVisible();
    expect(within(op).getByText(/No practice manager manages this clinician yet/)).toBeVisible();
    expect(within(op).getByText(/Responsible: Practice manager \(prices, schedule\)/)).toBeVisible();
    expect(within(op).getByRole("link", { name: "Open Coordination Setup" })).toHaveAttribute("href", "/en/portal/control-center/coordination/org-a");
    // Activation follows Decision D: information, no disabled primary button, when the step is not in this release.
    const activation = section("Activation");
    expect(within(activation).getByText("Not available yet")).toBeVisible();
    expect(within(activation).getByText("Activation isn't available yet")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Activate consultant" })).not.toBeInTheDocument();
    fireEvent.click(within(op).getByRole("button", { name: "Set schedule" }));
    expect(router.replace).toHaveBeenCalledWith("/en/portal/control-center/providers/clinicians/org-a/prac-1?tab=schedule", { scroll: false });
  });

  it("keeps activation disabled with named blockers while achievable prerequisites remain, and confirms a real activation", async () => {
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="setup" />);
    expect(await screen.findByRole("button", { name: "Activate consultant" })).toBeDisabled();
    expect(screen.getByText("Not ready to activate")).toBeVisible();
    cleanup();
    const ready = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, pricingSetupComplete: true, availabilitySetupComplete: true, credentialReady: true, blockers: [], readyForActivation: true });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ "/admin/providers/org-a": { ...providerDetail, organization: { ...organization, status: "ACTIVE" } }, [`${base}/readiness`]: ready, [`POST ${base}/activate?version=4`]: ready }), ops));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="setup" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate consultant" }));
    expect(screen.getByText(/becomes eligible to receive cases/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Yes, activate consultant" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", `${base}/activate?version=4`, expect.objectContaining({ method: "POST" })));
  });
});

describe("Clinician page — Overview", () => {
  it("answers who, how they work with RehletShifaa, credentials and case eligibility as separate facts, and what needs attention", async () => {
    const ready = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, credentialReady: true, blockers: [{ code: "AVAILABILITY_INCOMPLETE", message: "Clinician availability has not been configured." }, { code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "missing" }] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ [`${base}/readiness`]: ready, "/admin/providers/clinicians?organizationId=org-a": [{ ...directoryRow, credentialStatuses: { VERIFIED: 1 } }] }), ops));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="overview" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Dr Salma Farouk" })).toBeVisible();
    const facts = screen.getByRole("heading", { name: "Summary" }).closest("section")!;
    expect(within(facts).getAllByText("Through a Provider Organization").length).toBeGreaterThan(0);
    expect(within(facts).getByText("Verified", { selector: ".cc-status" })).toBeVisible();
    expect(within(facts).getByText("Not ready for cases", { selector: ".cc-status" })).toBeVisible();
    expect(within(facts).getByText("What needs attention")).toBeVisible();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Setup — needs attention", "Credentials", "Professional Relationships", "Prices", "Schedule"]);
    expect(screen.getByRole("button", { name: "Continue setup" })).toBeVisible();
    expect(screen.getByText("prac-1").closest("details")).not.toHaveAttribute("open");
  });

  it("reads saved professional details back with a human country name, edits in place and never blanks untouched fields", async () => {
    const saved = { registrationNumber: "EG-12345", specialty: "Cardiology", subspecialty: null, qualifications: "MD, FRCP", jurisdiction: "EG", version: 6 };
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ [`${base}/readiness`]: readiness({ clinicianProfileComplete: true }), [`${base}/profile`]: saved }), ops));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="overview" />);
    const summary = await screen.findByLabelText("Saved professional details");
    expect(within(summary).getByText("EG-12345")).toBeVisible();
    expect(within(summary).getByText("Egypt")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const form = screen.getByRole("form", { name: "Professional details" });
    expect(within(form).getByLabelText(/Licensing country/)).toHaveValue("EG");
    expect(within(form).getByRole("option", { name: "Egypt" })).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/Sub-speciality/), { target: { value: "Interventional" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save professional details" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", `${base}/profile`, expect.objectContaining({ method: "PUT" })));
    const put = vi.mocked(apiFetchAs).mock.calls.find(([, path, init]) => path === `${base}/profile` && init?.method === "PUT")!;
    expect(JSON.parse(String(put[2]!.body))).toEqual({ registrationNumber: "EG-12345", specialty: "Cardiology", subspecialty: "Interventional", qualifications: "MD, FRCP", jurisdiction: "EG", version: 6 });
  });

  it("hides sections the caller cannot read instead of showing empty tabs", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes(), ["provider.view"]));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="overview" />);
    await screen.findByRole("heading", { level: 1, name: "Dr Salma Farouk" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(" — needs attention", ""))).toEqual(["Overview", "Setup", "Professional Relationships"]);
    expect(screen.queryByRole("form", { name: "Professional details" })).not.toBeInTheDocument();
    expect(screen.getByText("Not complete yet. Managed by Provider Operations.")).toBeVisible();
  });

  it("renders in Arabic right-to-left with the draft terms", async () => {
    render(<ClinicianPage locale="ar" organizationId="org-a" practitionerId="prac-1" initialTab="setup" />);
    expect(await screen.findByRole("list", { name: "خطوات إعداد الاستشاري" })).toBeVisible();
    expect(screen.getAllByText("من خلال جهة طبية").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 3, name: /المراجعة المستقلة للاعتمادات/ })).toBeVisible();
  });
});

describe("Direct clinician page", () => {
  const direct = { id: "p-9", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "UNDER_REVIEW", availabilityStatus: "UNAVAILABLE", accountStatus: "INVITED", email: "omar@example.test" };
  it("uses the same page family with its own model: one credential & case-approval decision, no provider activation", async () => {
    auth.roles = ["SYSTEM_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/practitioners": [direct] }, []));
    render(<DirectClinicianPage locale="en" practitionerId="p-9" invited />);
    expect(await screen.findByRole("heading", { level: 1, name: "Dr Omar Said" })).toBeVisible();
    expect(screen.getByText(/Invitation sent and profile created/).closest(".cc-focus-target")).toHaveFocus();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Credential & case approval — needs attention", "Price list", "Account access"]);
    expect(screen.getAllByText("Direct with RehletShifaa").length).toBeGreaterThan(0);
    expect(screen.getByText("Not ready for cases", { selector: ".cc-status" })).toBeVisible();
    expect(screen.getByText("Awaiting review", { selector: ".cc-status" })).toBeVisible();
    expect(screen.queryByText(/Independent Credential Review|Activation/)).not.toBeInTheDocument();
    auth.roles = [];
  });

  it("does not offer Direct approval to someone under provider credentialing (the backend refuses it)", async () => {
    auth.roles = ["SYSTEM_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/practitioners": [{ ...direct, providerCredentialing: true }] }, []));
    render(<DirectClinicianPage locale="en" practitionerId="p-9" initialTab="approval" />);
    expect(await screen.findByText(/uses its independent credentialing, so Direct approval no longer applies/)).toBeVisible();
    expect(screen.queryByRole("tab", { name: /Credential & case approval/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve for cases…" })).not.toBeInTheDocument();
    auth.roles = [];
  });
});

describe("Clinician page — credential status and operational readiness stay separate (UX-6)", () => {
  const complete = { clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, credentialReady: true, pricingSetupComplete: true, availabilitySetupComplete: true };
  const readinessPanel = async () => (await screen.findByRole("heading", { name: "Operational readiness" })).closest("div")!;
  const renderWith = (r: ReturnType<typeof readiness>, statuses: Record<string, number>, over: Record<string, unknown> = {}) => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ [`${base}/readiness`]: r, "/admin/providers/clinicians?organizationId=org-a": [{ ...directoryRow, credentialStatuses: statuses }], ...over }), ops));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="overview" />);
  };

  it("credential verified but schedule missing: credentials Verified, readiness names the schedule and the unavailable activation", async () => {
    renderWith(readiness({ ...complete, availabilitySetupComplete: false, blockers: [{ code: "AVAILABILITY_INCOMPLETE", message: "x" }, { code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "y" }] }), { VERIFIED: 1 });
    const panel = await readinessPanel();
    expect(within(panel).getByText("Needs attention", { selector: ".cc-status" })).toBeVisible();
    expect(within(panel).getByText("Schedule").nextElementSibling).toHaveTextContent("Not configured");
    expect(within(panel).getByText("Activation").nextElementSibling).toHaveTextContent("Unavailable in this release");
    const summary = screen.getByRole("heading", { name: "Summary" }).closest("section")!;
    expect(within(summary).getByText("Verified", { selector: ".cc-status" })).toBeVisible();
    expect(within(summary).getByText("Not ready for cases", { selector: ".cc-status" })).toBeVisible();
    expect(screen.queryByText("Ready for cases")).not.toBeInTheDocument();
  });

  it("credential verified but routing missing: routing needs configuration", async () => {
    renderWith(readiness({ ...complete, blockers: [{ code: "ROUTING_INCOMPLETE", message: "x" }, { code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "y" }] }), { VERIFIED: 1 });
    const panel = await readinessPanel();
    expect(within(panel).getByText("Routing").nextElementSibling).toHaveTextContent("Needs configuration");
  });

  it("credentials incomplete: the credential status says what is outstanding and readiness is not claimed", async () => {
    renderWith(readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, blockers: [{ code: "CREDENTIAL_MORE_INFORMATION_REQUIRED", message: "Medical licence needs more information before review can continue." }] }), { MORE_INFORMATION_REQUIRED: 1 });
    await readinessPanel();
    const summary = screen.getByRole("heading", { name: "Summary" }).closest("section")!;
    expect(within(summary).getByText("More information required", { selector: ".cc-status" })).toBeVisible();
    expect(within(summary).getByText("0 of 1 verified · 1 needs more information")).toBeVisible();
    expect(screen.queryByText("CREDENTIAL_MORE_INFORMATION_REQUIRED")).not.toBeInTheDocument();
  });

  it("everything complete but activation unavailable in this release: never Ready for cases", async () => {
    renderWith(readiness({ ...complete, blockers: [{ code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "y" }] }), { VERIFIED: 1 });
    const panel = await readinessPanel();
    expect(within(panel).getByText("Needs attention", { selector: ".cc-status" })).toBeVisible();
    expect(within(panel).getByText("Activation").nextElementSibling).toHaveTextContent("Unavailable in this release");
    expect(within(panel).getByText("Independent Credential Review").nextElementSibling).toHaveTextContent("All verified");
    expect(screen.queryByText(/Ready for cases|Activated for cases/)).not.toBeInTheDocument();
  });

  it("a provider clinician who is not activated is not described as activated even when the backend says ready", async () => {
    renderWith(readiness({ ...complete, blockers: [], readyForActivation: true }), { VERIFIED: 1 });
    const panel = await readinessPanel();
    expect(within(panel).getByText("Ready to activate", { selector: ".cc-status" })).toBeVisible();
    expect(within(panel).getByText("Activation").nextElementSibling).toHaveTextContent("Ready — not activated yet");
  });

  it("the Setup checklist labels the review section by its exact outcome", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes({ [`${base}/readiness`]: readiness({ ...complete, blockers: [{ code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "y" }] }), "/admin/providers/clinicians?organizationId=org-a": [{ ...directoryRow, credentialStatuses: { VERIFIED: 1 } }] }), ops));
    render(<ClinicianPage locale="en" organizationId="org-a" practitionerId="prac-1" initialTab="setup" />);
    await screen.findByRole("heading", { level: 3, name: /Independent Credential Review/ });
    expect(within(section("Independent Credential Review")).getByText("All verified", { selector: ".cc-status" })).toBeVisible();
    expect(within(section("Credentials Submitted")).getByText("All submitted", { selector: ".cc-status" })).toBeVisible();
  });
});
