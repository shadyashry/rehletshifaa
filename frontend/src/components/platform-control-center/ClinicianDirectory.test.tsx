import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ClinicianDirectory } from "./ClinicianDirectory";
import { buildDirectory, credentialSummary, directCaseEligibility, providerCaseEligibility, type DirectConsultant, type ProviderClinicianRow } from "./clinician-model";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "ops" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const row = (o: Partial<ProviderClinicianRow>): ProviderClinicianRow => ({
  organizationId: "org-a", organizationName: "Nile Care Clinic", organizationStatus: "ONBOARDING", organizationLegacyMapping: false, practitionerId: "prac-1", displayName: "Dr Salma Farouk",
  clinicianType: "CONSULTANT", onboardingStatus: "UNDER_VERIFICATION", membershipStatus: "ACTIVE", providerCredentialing: true, credentialsRequired: 2, credentialStatuses: { VERIFIED: 1, UNDER_REVIEW: 1 }, ...o,
});
const providerRows = [
  row({}),
  row({ practitionerId: "prac-2", displayName: "Dr Karim Adel", clinicianType: "ASSOCIATE_DOCTOR", onboardingStatus: "VERIFIED", credentialStatuses: { VERIFIED: 2 } }),
  row({ organizationId: "org-b", organizationName: "Delta Hospital", practitionerId: "prac-3", displayName: "د. منى حسن", onboardingStatus: "ACTIVE", credentialStatuses: { VERIFIED: 2 } }),
];
const directRows: DirectConsultant[] = [
  { id: "p-9", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "VERIFIED", availabilityStatus: "AVAILABLE", accountStatus: "ACTIVE" },
  // The same person as prac-1: a record the provider invitation created. The backend refuses Direct approval for it.
  { id: "prac-1", displayName: "Dr Salma Farouk", credentialingStatus: "UNDER_REVIEW", accountStatus: "INVITED", providerCredentialing: true },
];
const both = ["provider.view", "provider.clinician.invite"];
beforeEach(() => { auth.roles = ["SYSTEM_ADMIN"]; vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/clinicians": providerRows, "/admin/practitioners": directRows }, both)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const rowOf = (name: string) => screen.getByRole("link", { name }).closest("li")!;

describe("Clinicians directory", () => {
  it("lists Direct and provider clinicians together, each with its engagement, organization and type — no Direct/Provider toggle", async () => {
    render(<ClinicianDirectory locale="en" />);
    const list = await screen.findByRole("list", { name: "Clinicians" });
    expect(within(list).getAllByRole("link").filter((a) => !a.textContent?.startsWith("Continue")).map((a) => a.textContent)).toEqual(["Dr Karim Adel", "Dr Omar Said", "Dr Salma Farouk", "د. منى حسن"]);
    expect(screen.queryByRole("group", { name: /source/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(within(rowOf("Dr Omar Said")).getByText("Direct with RehletShifaa")).toBeVisible();
    expect(within(rowOf("Dr Omar Said")).getByText("RehletShifaa")).toBeVisible();
    expect(within(rowOf("Dr Salma Farouk")).getByText("Through a Provider Organization")).toBeVisible();
    expect(within(rowOf("Dr Salma Farouk")).getByText("Nile Care Clinic")).toBeVisible();
    expect(within(rowOf("Dr Karim Adel")).getByText(/Associate doctor/)).toBeVisible();
    expect(rowOf("Dr Salma Farouk").querySelector("a")).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/org-a/prac-1");
    // A Direct record under provider credentialing is not a second, Direct "Dr Salma Farouk".
    expect(screen.getAllByRole("link", { name: "Dr Salma Farouk" })).toHaveLength(1);
    // One bounded read per engagement model: no per-organization or per-clinician fan-out.
    const paths = vi.mocked(apiFetchAs).mock.calls.map(([, p]) => p).filter((p) => p !== "/admin/access/me");
    expect(paths.sort()).toEqual(["/admin/practitioners", "/admin/providers/clinicians"]);
  });

  it("keeps credential status, setup and case eligibility as separate facts, and offers Continue setup only while setup is in progress", async () => {
    render(<ClinicianDirectory locale="en" />);
    await screen.findByRole("link", { name: "Dr Karim Adel" });
    const karim = rowOf("Dr Karim Adel");
    expect(within(karim).getByText("Verified", { selector: ".cc-status" })).toBeVisible();
    expect(within(karim).getByText("Not ready for cases", { selector: ".cc-status" })).toBeVisible();
    expect(within(karim).getByText("Provider activation isn't available in this release")).toBeInTheDocument();
    expect(within(karim).getByRole("link", { name: "Continue setup: Dr Karim Adel" })).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/org-a/prac-2?tab=setup");
    const salma = rowOf("Dr Salma Farouk");
    expect(within(salma).getByText("Under review", { selector: ".cc-status" })).toBeVisible();
    expect(within(salma).getByText("1 of 2 verified")).toBeInTheDocument();
    const omar = rowOf("Dr Omar Said");
    expect(within(omar).getByText("Can receive cases", { selector: ".cc-status" })).toBeVisible();
    expect(within(omar).queryByRole("link", { name: /Continue setup/ })).not.toBeInTheDocument();
    expect(within(rowOf("د. منى حسن")).getByText("Activated for cases", { selector: ".cc-status" })).toBeVisible();
    expect(within(rowOf("د. منى حسن")).queryByRole("link", { name: /Continue setup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Actions/ })).not.toBeInTheDocument();
  });

  it("searches and filters by engagement, organization, type and setup, with a clear filtered empty state", async () => {
    render(<ClinicianDirectory locale="en" />);
    await screen.findByRole("list", { name: "Clinicians" });
    fireEvent.change(screen.getByLabelText("Engagement"), { target: { value: "direct" } });
    expect(screen.getAllByRole("link", { name: /^Dr|^د\./ }).map((a) => a.textContent)).toEqual(["Dr Omar Said"]);
    fireEvent.change(screen.getByLabelText("Engagement"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "org-b" } });
    expect(screen.getAllByRole("link", { name: /^Dr|^د\./ }).map((a) => a.textContent)).toEqual(["د. منى حسن"]);
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Clinician type"), { target: { value: "ASSOCIATE_DOCTOR" } });
    expect(screen.getAllByRole("link", { name: /^Dr|^د\./ }).map((a) => a.textContent)).toEqual(["Dr Karim Adel"]);
    fireEvent.change(screen.getByLabelText("Clinician type"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Setup"), { target: { value: "complete" } });
    expect(screen.getAllByRole("link", { name: /^Dr|^د\./ }).map((a) => a.textContent)).toEqual(["Dr Omar Said", "د. منى حسن"]);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzz" } });
    expect(screen.getByText("No clinicians match these filters.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("4 clinicians")).toBeVisible();
  });

  it("reads only what the caller may see: provider-only people never call the Direct list, Direct-only people never call the provider read", async () => {
    auth.roles = [];
    render(<ClinicianDirectory locale="en" />);
    await screen.findByRole("list", { name: "Clinicians" });
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/admin/practitioners", expect.anything());
    expect(screen.queryByRole("link", { name: "Dr Omar Said" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Engagement")).not.toBeInTheDocument();
    cleanup(); vi.mocked(apiFetchAs).mockClear();
    auth.roles = ["CREDENTIALING_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/clinicians": providerRows, "/admin/practitioners": directRows }, []));
    render(<ClinicianDirectory locale="en" />);
    expect(await screen.findByRole("link", { name: "Dr Omar Said" })).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/admin/providers/clinicians", expect.anything());
    // Someone under provider credentialing is not presented as Direct to a Direct-only viewer either.
    expect(screen.queryByRole("link", { name: "Dr Salma Farouk" })).not.toBeInTheDocument();
  });

  it("says so when one source fails instead of showing an incomplete list as complete", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/clinicians": failure(503, "SERVICE_UNAVAILABLE"), "/admin/practitioners": directRows }, both));
    render(<ClinicianDirectory locale="en" />);
    expect(await screen.findByRole("link", { name: "Dr Omar Said" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByText(/Clinicians in provider organizations couldn't be loaded; the list below is incomplete/)).toBeVisible();
  });

  it("invites the first clinician when there are none", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/clinicians": [], "/admin/practitioners": [] }, both));
    render(<ClinicianDirectory locale="en" />);
    expect(await screen.findByText("No clinicians yet")).toBeVisible();
    expect(screen.getByText("Add your first clinician to begin setup.")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Add clinician" })[0]).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/new");
  });

  it("renders in Arabic with isolated mixed-script names and organization names", async () => {
    render(<ClinicianDirectory locale="ar" />);
    const list = await screen.findByRole("list", { name: "الأطباء" });
    expect(within(list).getByText("Dr Omar Said").tagName).toBe("BDI");
    expect(within(list).getAllByText("مباشرة مع رحلة شفاء").length).toBeGreaterThan(0);
    expect(within(list).getAllByText("من خلال جهة طبية").length).toBeGreaterThan(0);
    expect(within(list).getByText("Delta Hospital").tagName).toBe("BDI");
    expect(screen.getByLabelText("طريقة العمل")).toBeVisible();
  });
});

describe("Clinician model rules", () => {
  it("summarizes credentials by the most urgent state and never as 'complete'", () => {
    expect(credentialSummary({ credentialsRequired: 2, credentialStatuses: { VERIFIED: 1, REJECTED: 1 } }, "en")).toMatchObject({ label: "Rejected", detail: "1 of 2 verified" });
    expect(credentialSummary({ credentialsRequired: 2, credentialStatuses: { VERIFIED: 1, EXPIRED: 1 } }, "en").label).toBe("Expired");
    expect(credentialSummary({ credentialsRequired: 2, credentialStatuses: { MORE_INFORMATION_REQUIRED: 1, SUBMITTED: 1 } }, "en").label).toBe("More information required");
    expect(credentialSummary({ credentialsRequired: 2, credentialStatuses: { SUBMITTED: 2 } }, "en").label).toBe("Submitted");
    expect(credentialSummary({ credentialsRequired: 2, credentialStatuses: { VERIFIED: 1, MISSING: 1 } }, "en").label).toBe("Partly submitted");
    expect(credentialSummary({ credentialsRequired: 2, credentialStatuses: { MISSING: 2 } }, "en").label).toBe("Not submitted");
    expect(credentialSummary({ credentialsRequired: 2, credentialStatuses: { VERIFIED: 2 } }, "en").label).toBe("Verified");
    expect(credentialSummary({ credentialsRequired: null, credentialStatuses: {} }, "en").label).toBe("No requirements yet");
  });

  it("keeps case eligibility separate from credentials, per engagement model", () => {
    expect(providerCaseEligibility({ onboardingStatus: "VERIFIED", membershipStatus: "ACTIVE", providerCredentialing: true }, "en").label).toBe("Not ready for cases");
    expect(providerCaseEligibility({ onboardingStatus: "LEGACY_UNREVIEWED", membershipStatus: "ACTIVE", providerCredentialing: false }, "en").label).toBe("Uses Direct case approval");
    expect(directCaseEligibility({ id: "x", credentialingStatus: "VERIFIED", availabilityStatus: "UNAVAILABLE", careCategory: "cardiology" }, "en")).toMatchObject({ label: "Not taking cases", detail: "Approved, marked unavailable" });
    expect(directCaseEligibility({ id: "x", credentialingStatus: "VERIFIED", availabilityStatus: "AVAILABLE", careCategory: "cardiology", accountStatus: "DISABLED" }, "en").detail).toBe("Account access disabled");
    expect(directCaseEligibility({ id: "x", credentialingStatus: "UNDER_REVIEW" }, "en").detail).toBe("Waiting for case approval");
  });

  it("shows an unadopted legacy organization record on the Direct entry instead of as a second clinician", () => {
    const entries = buildDirectory([row({ practitionerId: "p-9", organizationName: "Omar Said Practice", providerCredentialing: false, onboardingStatus: "LEGACY_UNREVIEWED" })], [{ id: "p-9", displayName: "Dr Omar Said", credentialingStatus: "VERIFIED", availabilityStatus: "AVAILABLE", careCategory: "cardiology", accountStatus: "ACTIVE" }], "en");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ engagement: "direct", alsoLinked: [{ organizationName: "Omar Said Practice", href: "/en/portal/control-center/providers/clinicians/org-a/p-9" }] });
  });
});

describe("Clinicians directory — setup filter wiring", () => {
  it("counts filtered results for assistive technology", async () => {
    render(<ClinicianDirectory locale="en" initialEngagement="provider" />);
    await waitFor(() => expect(screen.getByText("3 of 4 clinicians")).toBeVisible());
  });
});
