import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, meWith } from "./test-support";
import { getDictionary } from "@/lib/dictionary";
import { FacilityCatalog } from "./FacilityCatalog";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", auth_time: Math.floor(Date.now() / 1000) } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; });

const h1 = () => screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent);
const trail = () => within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("listitem").map((li) => li.textContent);

const pendingPackage = { id: "p2", facilityId: "f1", facilityName: "Nile Heart Hospital", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 180000, maxEgp: 220000,
  inclusions: "Theatre, 2 ICU nights, 5 ward days", validFrom: "2026-10-01", version: 2, approvalStatus: "PENDING_FINANCE", proposedBy: "ops-subject" };
const facilities = [{
  id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", status: "ACTIVE", accreditationStatus: "CURRENT", contactEmail: "quality@nileheart.test", settlementTerms: "NET_30",
  accreditations: [{ id: "a1", body: "JCI", referenceNumber: "JCI-123", expiresOn: "2028-01-31", status: "CURRENT", recordedBy: "ops-subject" }],
  packages: [{ id: "p1", facilityId: "f1", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 150000, maxEgp: 200000, inclusions: "Theatre, ICU", validFrom: "2026-01-01", version: 1, approvalStatus: "APPROVED", proposedBy: "ops-subject", decidedBy: "finance-manager" }, pendingPackage],
}];
const data = {
  "/admin/facilities": facilities,
  "/admin/facilities/care-areas": [{ slug: "cardiology", nameEn: "Cardiology", nameAr: "أمراض القلب" }, { slug: "orthopaedics", nameEn: "Orthopaedics", nameAr: "العظام" }],
  "/admin/facilities/pending-packages": [pendingPackage],
};
const OPS = ["FACILITY_READ", "FACILITY_MANAGE", "COMMERCIAL_POLICY_READ"];
const FINANCE_MANAGER = ["FACILITY_READ", "FACILITY_PACKAGE_APPROVE", "COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE"];

describe("Commercial › Facilities & Packages", () => {
  it("Consultant Operations sees the facilities, opens one and proposes a package version", async () => {
    auth.me = meWith(OPS);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(data));
    render(<FacilityCatalog locale="en" suspensionCopy={getDictionary("en").portalWork.compliance.suspension} />);
    expect(await screen.findByText("Nile Heart Hospital", { selector: "strong" })).toBeVisible();
    expect(h1()).toEqual(["Facilities & Packages"]);
    expect(trail()).toEqual(["Control Center", "Commercial", "Facilities & Packages"]);
    expect(screen.getByText("Accredited")).toBeVisible();
    // Consultant Operations does not approve prices: no Finance queue, no Approve button anywhere.
    expect(screen.queryByText("Waiting for Finance")).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "New facility" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open Nile Heart Hospital" }));
    expect(screen.getByRole("heading", { level: 2, name: "Nile Heart Hospital" })).toBeVisible();
    expect(screen.getByText("JCI")).toBeVisible();
    expect(screen.getByText("Approved")).toBeVisible();
    expect(screen.getByText("Awaiting Finance")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retire" })).toHaveLength(2);
    const form = screen.getByRole("form", { name: "New package version" });
    fireEvent.change(within(form).getByLabelText(/Procedure code/), { target: { value: "tkr" } });
    fireEvent.change(within(form).getByLabelText(/Package name/), { target: { value: "Total knee replacement" } });
    fireEvent.change(within(form).getByLabelText(/Care area/), { target: { value: "orthopaedics" } });
    fireEvent.change(within(form).getByLabelText(/Minimum \(EGP\)/), { target: { value: "90000" } });
    fireEvent.change(within(form).getByLabelText(/Maximum \(EGP\)/), { target: { value: "120000" } });
    fireEvent.change(within(form).getByLabelText(/Included/), { target: { value: "Implant, theatre, 3 ward days" } });
    fireEvent.change(within(form).getByLabelText(/Valid from/), { target: { value: "2026-11-01" } });
    fireEvent.click(within(form).getByRole("button", { name: "Propose package" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/facilities/f1/packages", expect.objectContaining({ method: "POST" })));
    const call = vi.mocked(apiFetchAs).mock.calls.find((c) => c[1] === "/admin/facilities/f1/packages")!;
    expect(JSON.parse(String(call[2]!.body))).toEqual({ procedureCode: "tkr", name: "Total knee replacement", careCategory: "orthopaedics", minEgp: 90000, maxEgp: 120000,
      inclusions: "Implant, theatre, 3 ward days", exclusions: null, validFrom: "2026-11-01", validTo: null });
    expect(await screen.findByText("Package version sent to Finance.")).toBeVisible();
  });

  it("a Finance Manager approves a waiting package only after confirming its consequence, and cannot edit facilities", async () => {
    auth.me = meWith(FINANCE_MANAGER);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(data));
    render(<FacilityCatalog locale="en" suspensionCopy={getDictionary("en").portalWork.compliance.suspension} />);
    expect(await screen.findByText("Waiting for Finance")).toBeVisible();
    expect(screen.queryByRole("form", { name: "New facility" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retire" })).not.toBeInTheDocument();
    const queue = screen.getByRole("group", { name: "Actions: CABG" });
    fireEvent.click(within(queue).getByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog", { name: "Approve this package price?" });
    expect(dialog).toHaveTextContent("Proposal lines drawn from it will release without a Finance work item.");
    expect(dialog).toHaveTextContent("You may be asked to sign in again to confirm.");
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/admin/facilities/f1/packages/p2/approve", expect.anything());
    fireEvent.change(within(dialog).getByLabelText(/Note/), { target: { value: "Within the 2026 agreement" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/facilities/f1/packages/p2/approve", expect.objectContaining({ method: "POST", body: JSON.stringify({ note: "Within the 2026 agreement" }) })));
    expect(await screen.findByText("Package approved.")).toBeVisible();
  });

  it("rejecting needs a reason", async () => {
    auth.me = meWith(FINANCE_MANAGER);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(data));
    render(<FacilityCatalog locale="en" suspensionCopy={getDictionary("en").portalWork.compliance.suspension} />);
    await screen.findByText("Waiting for Finance");
    fireEvent.click(within(screen.getByRole("group", { name: "Actions: CABG" })).getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", { name: "Reject this package price?" });
    expect(within(dialog).getByLabelText(/Reason/)).toBeRequired();
  });

  it("is read-only for Finance staff who may read but not approve", async () => {
    auth.me = meWith(["FACILITY_READ", "COMMERCIAL_POLICY_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(data));
    render(<FacilityCatalog locale="en" suspensionCopy={getDictionary("en").portalWork.compliance.suspension} />);
    expect(await screen.findByText("Nile Heart Hospital", { selector: "strong" })).toBeVisible();
    expect(screen.queryByText("Waiting for Finance")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Nile Heart Hospital" }));
    expect(screen.queryByRole("button", { name: /Approve|Reject|Retire|Withdraw|Suspend|Edit facility/ })).not.toBeInTheDocument();
  });

  it("is not offered without facility access", async () => {
    auth.me = meWith(["JOURNEY_READ"]);
    render(<FacilityCatalog locale="en" suspensionCopy={getDictionary("en").portalWork.compliance.suspension} />);
    expect(await screen.findByText("You don't have access to facilities")).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalled();
  });

  it("speaks Arabic", async () => {
    auth.me = meWith(OPS);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(data));
    render(<FacilityCatalog locale="ar" suspensionCopy={getDictionary("ar").portalWork.compliance.suspension} />);
    expect(await screen.findByText("Nile Heart Hospital", { selector: "strong" })).toBeVisible();
    expect(h1()).toEqual(["المنشآت والباقات"]);
    expect(screen.getByText("معتمدة")).toBeVisible();
  });

  it("P1-19: shows a package suspension and lets a Finance Manager lift it with a required note", async () => {
    auth.me = meWith(FINANCE_MANAGER);
    const suspension = { id: "s1", reason: "REPEATED_UNAPPROVED_EXTRAS", quarter: "2026-Q4", occurrences: 2, triggerCaseId: "c9", suspendedAt: "2026-10-12T09:00:00Z" };
    const lifted = { ...suspension, liftedBy: "fm", liftedAt: "2026-10-14T09:00:00Z", liftNote: "Hospital credited both extras" };
    let open = true;
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...data,
      "/admin/facilities": () => facilities.map((f) => ({ ...f, packageSuspension: open ? suspension : null })),
      "/admin/facilities/f1": () => ({ ...facilities[0], packageSuspension: open ? suspension : null, suspensions: [open ? suspension : lifted] }),
      "POST /admin/facilities/f1/package-suspension/lift": () => { open = false; return { ...facilities[0], packageSuspension: null, suspensions: [lifted] }; } }));
    render(<FacilityCatalog locale="en" suspensionCopy={getDictionary("en").portalWork.compliance.suspension} />);
    expect(await screen.findByText("Packages suspended")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open Nile Heart Hospital" }));
    expect(await screen.findByText(/2 settled hospital bills in .*2026-Q4.* carried an extra nobody approved/)).toBeVisible();
    expect(screen.getByText(/Care already reserved goes on/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Lift suspension" }));
    const dialog = screen.getByRole("dialog", { name: "Lift the package suspension?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lift suspension" }));
    expect(within(dialog).getByText("Write what was reviewed and agreed.")).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/admin/facilities/f1/package-suspension/lift", expect.anything());
    fireEvent.change(within(dialog).getByLabelText(/What was reviewed and agreed/), { target: { value: "Hospital credited both extras" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lift suspension" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/facilities/f1/package-suspension/lift", expect.objectContaining({ method: "POST", body: JSON.stringify({ note: "Hospital credited both extras" }) })));
    expect(await screen.findByText("The suspension is lifted.")).toBeVisible();
    expect(await screen.findByText(/Lifted .*: Hospital credited both extras/)).toBeInTheDocument();
  });

  it("P1-19: Consultant Operations read the suspension but cannot lift it", async () => {
    auth.me = meWith(OPS);
    const suspension = { id: "s1", reason: "REPEATED_UNAPPROVED_EXTRAS", quarter: "2026-Q4", occurrences: 2, suspendedAt: "2026-10-12T09:00:00Z" };
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...data, "/admin/facilities/f1": { ...facilities[0], packageSuspension: suspension, suspensions: [suspension] } }));
    render(<FacilityCatalog locale="en" suspensionCopy={getDictionary("en").portalWork.compliance.suspension} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Nile Heart Hospital" }));
    expect(await screen.findByText("A Finance Manager lifts the suspension after the review.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Lift suspension" })).not.toBeInTheDocument();
  });
});
