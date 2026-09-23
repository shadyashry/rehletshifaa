import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ConsultantOnboardingWizard, firstOpenStep } from "./ConsultantOnboardingWizard";
import { ConsultantWorkspace } from "./ConsultantWorkspace";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, onboarding, organization, providerDetail, readiness } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "ops" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const caps = ["provider.view", "provider.clinician.invite", "provider.update", "credential.view", "credential.submit", "credential.review", "provider.relationship.manage", "provider.activate", "price_list.view", "availability.view", "provider.member.invite"];
const setupRoutes = {
  "/admin/providers": [organization], "/admin/providers/org-a": providerDetail,
  "/admin/providers/org-a/clinicians/prac-1/onboarding": onboarding,
  "/admin/providers/org-a/clinicians/prac-1/readiness": readiness(),
  "/admin/providers/org-a/clinicians/prac-1/credential-requirements": [{ type: "MEDICAL_LICENSE", displayName: "Medical licence", mandatory: true, expiryRequired: true }],
  "/admin/providers/org-a/clinicians/prac-1/credentials": [],
  "/admin/providers/org-a/clinicians/prac-1/profile": { registrationNumber: null, specialty: null, subspecialty: null, qualifications: null, jurisdiction: "EG", version: 4 },
};
beforeEach(() => { auth.roles = []; vi.mocked(apiFetchAs).mockImplementation(fakeApi(setupRoutes, caps)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Add consultant wizard — step 1", () => {
  it("validates required fields next to each field before sending anything", async () => {
    render(<ConsultantOnboardingWizard locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send invitation & continue" }));
    expect(screen.getAllByText("This field is required.").length).toBeGreaterThanOrEqual(2);
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", expect.stringContaining("/members/invite"), expect.anything());
    const progress = screen.getByRole("list", { name: "Setup steps" });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(4);
    expect(within(progress).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");
  });

  it("invites into the organization with the unchanged API, then continues to professional setup", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...setupRoutes, "POST /admin/providers/org-a/members/invite": { id: "op-1", organizationId: "org-a", subject: "kc-consultant", status: "COMPLETED", role: "CONSULTANT" } }, caps));
    render(<ConsultantOnboardingWizard locale="en" />);
    await waitFor(() => expect(screen.getByLabelText(/Organization/)).toHaveValue("org-a"));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Dr Salma Farouk" } });
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "salma@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation & continue" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/portal/control-center/providers/consultants/org-a/prac-1/setup?step=professional"));
    expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/members/invite", expect.objectContaining({ method: "POST", body: expect.stringContaining("\"role\":\"CONSULTANT\"") }));
  });

  it("offers the direct (current case workflow) route only to accounts that have it, and uses the unchanged endpoint", async () => {
    auth.roles = ["CREDENTIALING_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...setupRoutes, "POST /admin/practitioners": { id: "p-77" } }, caps));
    render(<ConsultantOnboardingWizard locale="en" />);
    fireEvent.click(await screen.findByRole("radio", { name: /Directly with RehletShifaa/ }));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Dr Omar Said" } });
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "omar@example.test" } });
    fireEvent.change(screen.getByLabelText(/Speciality/), { target: { value: "Cardiology" } });
    fireEvent.change(screen.getByLabelText(/Care area/), { target: { value: "cardiology" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation & continue" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/portal/control-center/providers/consultants/direct/p-77?tab=approval&created=1"));
  });
});

describe("Add consultant wizard — resume", () => {
  it("resumes at the first milestone the backend reports as incomplete and shows its issues beside it", async () => {
    render(<ConsultantOnboardingWizard locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByRole("heading", { name: "Professional setup" })).toBeVisible();
    expect(screen.getByText("Professional details are missing.")).toBeVisible();
    expect(screen.getByText("A required credential has not been added.")).toBeVisible();
    expect(screen.queryByText("At least one live price is needed.")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Medical licence/ })).toBeVisible();
    expect(screen.getByRole("link", { name: "Save & continue later" })).toHaveAttribute("href", "/en/portal/control-center/providers/consultants/org-a/prac-1");
  });

  it("saves professional details with the record version and refreshes readiness", async () => {
    render(<ConsultantOnboardingWizard locale="en" organizationId="org-a" practitionerId="prac-1" initialStep="professional" />);
    const form = await screen.findByRole("form", { name: "Professional details" });
    fireEvent.click(within(form).getByRole("button", { name: "Save professional details" }));
    expect(within(form).getAllByText("This field is required.").length).toBe(3);
    fireEvent.change(within(form).getByLabelText(/registration number/), { target: { value: "EG-12345" } });
    fireEvent.change(within(form).getByLabelText(/^Speciality/), { target: { value: "Cardiology" } });
    fireEvent.change(within(form).getByLabelText(/Qualifications/), { target: { value: "MD, FRCP" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save professional details" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/clinicians/prac-1/profile", expect.objectContaining({ method: "PUT", body: expect.stringContaining("\"version\":4") })));
  });

  it("reads saved professional details back, edits them in place and never blanks untouched fields", async () => {
    const saved = { registrationNumber: "EG-12345", specialty: "Cardiology", subspecialty: null, qualifications: "MD, FRCP", jurisdiction: "EG", version: 6 };
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...setupRoutes, "/admin/providers/org-a/clinicians/prac-1/readiness": readiness({ clinicianProfileComplete: true }), "/admin/providers/org-a/clinicians/prac-1/profile": saved }, caps));
    render(<ConsultantOnboardingWizard locale="en" organizationId="org-a" practitionerId="prac-1" initialStep="professional" />);
    const summary = await screen.findByLabelText("Saved professional details");
    expect(within(summary).getByText("EG-12345")).toBeVisible();
    expect(screen.queryByText(/Saved values aren't shown/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const form = screen.getByRole("form", { name: "Professional details" });
    expect(within(form).getByLabelText(/registration number/)).toHaveValue("EG-12345");
    expect(within(form).getByLabelText(/Qualifications/)).toHaveValue("MD, FRCP");
    fireEvent.change(within(form).getByLabelText(/Sub-speciality/), { target: { value: "Interventional" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save professional details" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/clinicians/prac-1/profile", expect.objectContaining({ method: "PUT" })));
    const put = vi.mocked(apiFetchAs).mock.calls.find(([, path, init]) => path === "/admin/providers/org-a/clinicians/prac-1/profile" && init?.method === "PUT")!;
    expect(JSON.parse(String(put[2]!.body))).toEqual({ registrationNumber: "EG-12345", specialty: "Cardiology", subspecialty: "Interventional", qualifications: "MD, FRCP", jurisdiction: "EG", version: 6 });
  });

  it("does not offer the professional details form until the saved values could be read", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...setupRoutes, "/admin/providers/org-a/clinicians/prac-1/profile": new Response(JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: "down" }), { status: 503 }) }, caps));
    render(<ConsultantOnboardingWizard locale="en" organizationId="org-a" practitionerId="prac-1" initialStep="professional" />);
    expect(await screen.findByText(/temporarily unavailable/)).toBeVisible();
    expect(screen.queryByRole("form", { name: "Professional details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("keeps activation disabled with named blockers while achievable prerequisites remain", async () => {
    render(<ConsultantOnboardingWizard locale="en" organizationId="org-a" practitionerId="prac-1" initialStep="review" />);
    expect(await screen.findByRole("button", { name: "Activate consultant" })).toBeDisabled();
    expect(screen.getByText("Not ready to activate")).toBeVisible();
    expect(screen.getAllByText("Needs action").length).toBeGreaterThan(0);
  });

  it("shows 'Activation isn't available yet' — with no activate button — when commercial acceptance is not in this release", async () => {
    const blocked = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, pricingSetupComplete: true, availabilitySetupComplete: true, credentialReady: true, blockers: [{ code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "Required commercial or legal acceptance is missing." }] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...setupRoutes, "/admin/providers/org-a/clinicians/prac-1/readiness": blocked }, caps));
    render(<ConsultantOnboardingWizard locale="en" organizationId="org-a" practitionerId="prac-1" initialStep="review" />);
    expect(await screen.findByText("Activation isn't available yet")).toBeVisible();
    expect(screen.getByText(/That step isn't available in the current release/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Activate consultant" })).not.toBeInTheDocument();
    expect(screen.queryByText("Needs action")).not.toBeInTheDocument();
    expect(screen.getByText("Setup complete — activation isn't available yet")).toBeVisible();
  });

  it("still offers real activation, behind a confirmation, when the backend says the consultant is ready", async () => {
    const ready = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, pricingSetupComplete: true, availabilitySetupComplete: true, credentialReady: true, blockers: [], readyForActivation: true });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...setupRoutes, "/admin/providers/org-a": { ...providerDetail, organization: { ...organization, status: "ACTIVE" } }, "/admin/providers/org-a/clinicians/prac-1/readiness": ready, "POST /admin/providers/org-a/clinicians/prac-1/activate?version=4": ready }, caps));
    render(<ConsultantOnboardingWizard locale="en" organizationId="org-a" practitionerId="prac-1" initialStep="review" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate consultant" }));
    expect(screen.getByText(/becomes eligible to receive cases/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Yes, activate consultant" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/clinicians/prac-1/activate?version=4", expect.objectContaining({ method: "POST" })));
  });

  it("derives the resume step from backend readiness only", () => {
    expect(firstOpenStep(readiness() as never, "PROFILE_INCOMPLETE")).toBe("professional");
    expect(firstOpenStep(readiness({ organizationMembershipActive: false }) as never)).toBe("details");
    expect(firstOpenStep(readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true }) as never)).toBe("working");
  });
});

describe("Consultant workspace", () => {
  it("is a workspace with sections and a contextual Continue setup action — not the wizard", async () => {
    render(<ConsultantWorkspace locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Dr Salma Farouk" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/en/portal/control-center/providers/consultants/org-a/prac-1/setup?step=professional");
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Credentials — needs attention", "Practice relationships", "Pricing — needs attention", "Availability — needs attention", "Readiness — needs attention"]);
    expect(screen.getByText("Setup in progress")).toBeVisible();
    expect(screen.getByText("prac-1").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(within(tabs).getByRole("tab", { name: /^Readiness/ }));
    expect(router.replace).toHaveBeenCalledWith("/en/portal/control-center/providers/consultants/org-a/prac-1?tab=readiness", { scroll: false });
    expect(screen.getByRole("button", { name: "Activate consultant" })).toBeDisabled();
  });
});
