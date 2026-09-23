import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AccessGovernance } from "./AccessGovernance";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, providerDetail, organization } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner" } } as { access_token: string; profile: { sub: string } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const role = { id: "role-1", key: "PRACTICE_MANAGER", name: "Practice Manager", purpose: "Manage practice operations within assigned scope", description: "Practice operations", family: "PROVIDER", systemTemplate: true };
const permission = { key: "access.role.view", name: "View roles and capabilities", family: "access", risk: "LOW", scopes: ["PLATFORM"], actors: ["GOVERNANCE"], channels: ["ADMIN_WEB"], dependencies: [], conflicts: [], executable: true };
const capabilities = ["access.role.view", "access.role.create", "access.role.edit_draft", "access.role.publish", "access.role.simulate", "access.effective_access.view", "access.audit.view", "access.assignment.manage", "provider.view"];
const roleDetail = { role, versions: [{ version: { id: "v1", number: 1, status: "PUBLISHED", revision: 0, actorType: "PRACTICE_OPERATIONS", channel: "STAFF_WEB", createdBy: "maker" }, grants: [{ permission: "access.role.view", scope: "PLATFORM", relationship: null }] }] };
const denied = { subject: "kc-manager", organizationId: "org-a", sources: [], relationships: [], decisions: [{ permission: "access.role.view", allowed: false, reason: "INACTIVE_MEMBERSHIP", roleVersionId: null, scope: null, relationship: null }] };
const routes = {
  "/admin/access/roles?offset=0": [role], "/admin/access/permissions": [permission], "/admin/access/roles/role-1": roleDetail,
  "/admin/providers": [organization], "/admin/providers/org-a": providerDetail,
  "/admin/access/effective-access?subject=kc-manager&organization=org-a": denied,
};
beforeEach(() => { auth.user = { access_token: "test", profile: { sub: "owner" } }; vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes, capabilities)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Access & governance", () => {
  it("renders business roles and keeps capability keys in advanced details", async () => {
    render(<AccessGovernance locale="en" view="roles" />);
    expect(await screen.findByRole("button", { name: /Practice Manager/ })).toBeVisible();
    expect(screen.queryByText("PRACTICE_MANAGER")).not.toBeInTheDocument();
    cleanup();
    render(<AccessGovernance locale="en" view="permissions" />);
    expect(await screen.findByText("View roles and capabilities")).toBeVisible();
    expect(screen.getByText("access.role.view").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/Keycloak|JWT|Spring Security/)).not.toBeInTheDocument();
  });

  it("groups role creation into five labelled steps with Arabic RTL controls", async () => {
    const { container } = render(<AccessGovernance locale="ar" view="roles" />);
    await screen.findByRole("button", { name: /مدير العيادة/ });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    fireEvent.click(screen.getByRole("button", { name: /إنشاء دور/ }));
    expect(screen.getByRole("list", { name: "إنشاء دور" }).querySelectorAll("button")).toHaveLength(5);
    expect(screen.getByLabelText("اسم الدور")).toBeVisible();
    expect(screen.getByRole("button", { name: "حفظ المسودة" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "3. النطاق" }));
    expect(screen.getByRole("button", { name: "3. النطاق" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("متقدم: المشاركة في الرحلة وقناة الوصول").closest("details")).not.toHaveAttribute("open");
  });

  it("explains a denial in business words, found by person name rather than account identifier", async () => {
    render(<AccessGovernance locale="en" view="effective" />);
    fireEvent.change(await screen.findByLabelText(/Find a person/), { target: { value: "Mona" } });
    fireEvent.click(within(await screen.findByRole("list", { name: "Results" })).getByRole("button", { name: "Select" }));
    expect(await screen.findByRole("heading", { name: "Mona Adel" })).toBeVisible();
    expect(screen.getAllByText("Not allowed").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Why can't they?"));
    expect(screen.getByText("No active membership in this organization")).toBeVisible();
  });

  it("shows the real backend effective-from and expiry dates for each source", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/effective-access?subject=kc-manager&organization=org-a": { ...denied, sources: [
      { assignment: { id: "a1", subject: "kc-manager", organizationId: "org-a", status: "ACTIVE", scope: "PLATFORM", source: "ADMINISTRATIVE", revision: 0, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null }, roleName: "Practice Manager", version: { id: "v1", number: 1 }, grants: [] },
      { assignment: { id: "a2", subject: "kc-manager", organizationId: "org-a", status: "ACTIVE", scope: "ORGANIZATION", source: "ADMINISTRATIVE", revision: 0, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: "2027-01-01T00:00:00Z" }, roleName: "Practice Manager", version: { id: "v1", number: 1 }, grants: [] },
    ] } }, capabilities));
    render(<AccessGovernance locale="en" view="users" initialSubject="kc-manager" initialOrganization="org-a" />);
    expect(await screen.findByText(/No expiry/)).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Mona Adel" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "kc-manager" })).not.toBeInTheDocument();
    expect(screen.getByText(/^Expires at/)).toBeVisible();
    expect(screen.getAllByText(/^Starts at/).length).toBe(2);
  });

  it("gives access person-first: role, scope, validity, then review and confirm", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "POST /admin/access/assignments": { status: "PENDING" } }, capabilities));
    render(<AccessGovernance locale="en" view="users" initialSubject="kc-manager" initialOrganization="org-a" />);
    fireEvent.click(await screen.findByRole("button", { name: /Give access/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Practice Manager/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("radio", { name: "Platform governance" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const confirm = screen.getByRole("button", { name: "Confirm access" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason for giving access/), { target: { value: "Covers the Nile Care practice" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/access/assignments", expect.objectContaining({ method: "POST", body: expect.stringContaining("\"versionId\":\"v1\"") })));
    expect(await screen.findByText("Access saved: Pending verification")).toBeVisible();
  });

  it("fails closed on a denied page", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    render(<AccessGovernance locale="en" view="roles" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Create role/ })).not.toBeInTheDocument();
  });

  it("renders a recoverable error without stale role data", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/access/roles?offset=0": new Response("{}", { status: 500 }) }, capabilities));
    render(<AccessGovernance locale="en" view="roles" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("loads the audit view's own data", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/audit": [{ actor: "owner", entity: "role-1", action: "ROLE_PUBLISHED", outcome: "SUCCESS", reason: "Initial publication", occurredAt: "2026-01-01T00:00:00Z" }] }, capabilities));
    render(<AccessGovernance locale="en" view="audit" />);
    expect(await screen.findByText("role published")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Audit" })).toBeVisible();
  });

  it("keeps an open panel when the access token silently renews (same subject, new object)", async () => {
    const { rerender } = render(<AccessGovernance locale="en" view="users" initialSubject="kc-manager" initialOrganization="org-a" />);
    expect(await screen.findByText("No RehletShifaa business roles assigned")).toBeVisible();
    vi.mocked(apiFetchAs).mockClear();
    auth.user = { access_token: "renewed", profile: { sub: "owner" } };
    rerender(<AccessGovernance locale="en" view="users" initialSubject="kc-manager" initialOrganization="org-a" />);
    expect(screen.getByText("No RehletShifaa business roles assigned")).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalled();
  });
});

describe("Access picture across authority sources", () => {
  const person = { initialSubject: "kc-manager", initialOrganization: "org-a" };
  it("shows identity-system workspaces read-only and separately from RehletShifaa business access", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/workspace-roles?subject=kc-manager": { subject: "kc-manager", source: "IDENTITY_SYSTEM", available: true, accountStatus: "ACTIVE", roles: ["COORDINATOR"] } }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    const workspaces = await screen.findByRole("region", { name: "Account & workspaces" });
    expect(await within(workspaces).findByText("Coordinator")).toBeVisible();
    expect(within(workspaces).getByText("Staff Portal")).toBeVisible();
    expect(within(workspaces).getByText(/Managed by the identity system · read-only/)).toBeVisible();
    expect(within(workspaces).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Business access" })).toBeVisible();
    expect(screen.getByText(/Managed by RehletShifaa/)).toBeVisible();
    // A person with a working workspace but no business role is not described as having "no access".
    expect(screen.getByText("No RehletShifaa business roles assigned")).toBeVisible();
    expect(screen.queryByText("No matching access assignment.")).not.toBeInTheDocument();
    // The read surface is GET-only: nothing on this screen writes to the identity system.
    expect(vi.mocked(apiFetchAs).mock.calls.filter(([, path, init]) => String(path).includes("workspace-roles") && (init?.method ?? "GET") !== "GET")).toHaveLength(0);
  });

  it("never claims an account has no workspaces when the identity system could not be asked", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/workspace-roles?subject=kc-manager": { subject: "kc-manager", source: "IDENTITY_SYSTEM", available: false, accountStatus: null, roles: [] } }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    expect(await screen.findByText(/couldn't be asked right now.*doesn't mean the person has none/)).toBeVisible();
    expect(screen.queryByText(/has no portal workspace role/)).not.toBeInTheDocument();
  });
});
