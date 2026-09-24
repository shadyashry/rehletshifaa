import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AccessGovernance } from "./AccessGovernance";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, providerDetail, organization } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner" } } as { access_token: string; profile: { sub: string } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const role = { id: "role-1", key: "PRACTICE_MANAGER", name: "Practice Manager", purpose: "Manage practice operations within assigned scope", description: "Practice operations", family: "PROVIDER", systemTemplate: true, status: "ACTIVE", currentVersion: 3, currentSince: "2026-09-14T00:00:00Z", draftStatus: null };
const drafting = { ...role, id: "role-2", key: "CONSULTANT", name: "Consultant", purpose: "Provider consultant", currentVersion: 5, draftStatus: "DRAFT" };
const permissions = [
  { key: "access.role.view", name: "View roles and capabilities", family: "access", risk: "LOW", scopes: ["PLATFORM"], actors: ["GOVERNANCE"], channels: ["ADMIN_WEB"], dependencies: [], conflicts: [], executable: true, recentAuthentication: false },
  { key: "price_list.manage", name: "Manage price list", family: "price_list", risk: "HIGH", scopes: ["MANAGED_CLINICIANS", "ORGANIZATION"], actors: ["PRACTICE_OPERATIONS"], channels: ["CONSULTANT_WEB"], dependencies: [], conflicts: [], executable: true, recentAuthentication: false },
];
const capabilities = ["access.role.view", "access.role.create", "access.role.edit_draft", "access.role.publish", "access.role.retire", "access.role.simulate", "access.effective_access.view", "access.audit.view", "access.assignment.manage", "provider.view"];
const version = (id: string, number: number, status: string, createdBy = "maker") => ({ id, number, status, revision: 2, actorType: "PRACTICE_OPERATIONS", channel: "CONSULTANT_WEB", effectiveFrom: status === "PUBLISHED" ? "2026-09-14T00:00:00Z" : null, createdBy });
const roleDetail = { role, versions: [{ version: version("v3", 3, "PUBLISHED"), grants: [{ permission: "price_list.manage", scope: "MANAGED_CLINICIANS", relationship: "MANAGES" }, { permission: "access.role.view", scope: "PLATFORM", relationship: null }] }] };
const assignment = (id: string, scope: string, extra: Record<string, unknown> = {}) => ({ id, roleId: "role-1", roleKey: "PRACTICE_MANAGER", roleName: "Practice Manager", versionId: "v3", versionNumber: 3, versionStatus: "PUBLISHED", scope, targetType: null, targetId: null, status: "ACTIVE", state: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, source: "PROVIDER_ONBOARDING", revision: 1, ...extra });
const personAccess = { subject: "kc-manager", truncated: false, organizations: [{ organizationId: "org-a", platform: false, organizationName: "Nile Care Clinic", membership: { organizationId: "org-a", status: "ACTIVE", accountActive: true, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null },
  assignments: [assignment("a1", "ORGANIZATION"), assignment("a2", "MANAGED_CLINICIANS")],
  relationships: [{ id: "r1", type: "MANAGES", targetType: "CLINICIAN", targetId: "prac-1", targetName: "Dr Salma Farouk", status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null }] }] };
const workspaces = (roles: string[], extra: Record<string, unknown> = {}) => ({ subject: "kc-manager", source: "IDENTITY_SYSTEM", available: true, accountStatus: "ACTIVE", roles, ...extra });
const routes: Record<string, unknown> = {
  "/admin/access/roles?offset=0": [role, drafting], "/admin/access/permissions": permissions, "/admin/access/roles/role-1": roleDetail,
  "/admin/providers": [organization], "/admin/providers/org-a": providerDetail,
  "/admin/access/people/access?subject=kc-manager": personAccess, "/admin/access/workspace-roles?subject=kc-manager": workspaces(["PATIENT"]),
};
const person = { initialSubject: "kc-manager" };
beforeEach(() => { auth.user = { access_token: "test", profile: { sub: "owner" } }; vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes, capabilities)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const calls = (method: string) => vi.mocked(apiFetchAs).mock.calls.filter(([, , init]) => (init?.method ?? "GET") === method).map(([, path, init]) => ({ path: String(path), body: String(init?.body ?? "") }));

describe("People — who, where, what, why", () => {
  it("finds a person by name and answers the four questions on one page", async () => {
    render(<AccessGovernance locale="en" view="users" />);
    fireEvent.change(await screen.findByLabelText(/Find a person/), { target: { value: "Mona" } });
    fireEvent.click(await within(await screen.findByRole("list", { name: "Results" })).findByRole("button", { name: "Select Mona Adel" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Mona Adel" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Account & workspaces" })).toBeVisible();
    expect(await screen.findByRole("region", { name: "Business access" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Access Summary" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Changing or ending access" })).toBeVisible();
    // Never an account identifier as the primary text.
    expect(screen.queryByRole("heading", { name: "kc-manager" })).not.toBeInTheDocument();
  });

  it("keeps identity-system workspaces read-only and separate from business access", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/workspace-roles?subject=kc-manager": workspaces(["COORDINATOR", "PATIENT"]) }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    const region = await screen.findByRole("region", { name: "Account & workspaces" });
    expect(await within(region).findByText("Staff Portal")).toBeVisible();
    expect(within(region).getByText("Coordinator")).toBeVisible();
    expect(within(region).getAllByText("Managed by Identity System").length).toBeGreaterThan(0);
    // The default PATIENT role is explained, not presented as "this person is a patient".
    expect(within(region).getByText(/Every sign-in account gets this automatically/)).toBeVisible();
    // Provider membership opens My Practice and is labelled by its source.
    expect(await within(region).findByText("My Practice")).toBeVisible();
    expect(within(region).getByText("Provider membership")).toBeVisible();
    expect(within(region).queryAllByRole("button")).toHaveLength(0);
    expect(within(region).getByRole("link", { name: /Manage membership in Nile Care Clinic/ })).toHaveAttribute("href", "/en/portal/control-center/providers/org-a?tab=people");
    expect(calls("PUT").concat(calls("POST")).filter((c) => c.path.includes("workspace-roles"))).toHaveLength(0);
  });

  it("never claims an account has no workspaces when the identity system could not be asked", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/workspace-roles?subject=kc-manager": workspaces([], { available: false, accountStatus: null }) }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    expect(await screen.findByText(/couldn't be asked right now.*doesn't mean the person has none/)).toBeVisible();
    expect(screen.queryByText(/has no portal workspace/)).not.toBeInTheDocument();
  });

  it("shows one card per role: where it applies, validity, status and source — keys only under technical details", async () => {
    render(<AccessGovernance locale="en" view="users" {...person} />);
    const region = await screen.findByRole("region", { name: "Business access" });
    const cards = within(region).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("Practice Manager")).toBeVisible();
    expect(within(cards[0]).getByText("The whole organization · Clinicians they manage")).toBeVisible();
    expect(within(cards[0]).getByText("No end date")).toBeVisible();
    expect(within(cards[0]).getByText("Active")).toBeVisible();
    expect(within(cards[0]).getByText("Provider membership")).toBeVisible();
    expect(within(cards[0]).getByText(/Manages:/)).toHaveTextContent("Manages: Dr Salma Farouk");
    for (const key of within(cards[0]).getAllByText(/PRACTICE_MANAGER v3/)) expect(key.closest("details")).not.toHaveAttribute("open");
  });

  it("states temporal validity and an ended role truthfully, and a person without roles is not 'no access'", async () => {
    const ended = { ...personAccess, organizations: [{ ...personAccess.organizations[0], assignments: [assignment("a1", "ORGANIZATION", { state: "ENDED", effectiveTo: "2026-06-30T00:00:00Z" })] }] };
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/people/access?subject=kc-manager": ended }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    const region = await screen.findByRole("region", { name: "Business access" });
    expect(within(region).getByText("Ended")).toBeVisible();
    expect(within(region).getByText(/^Until 30 Jun 2026/)).toBeVisible();
    cleanup();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/people/access?subject=kc-manager": { subject: "kc-manager", organizations: [], truncated: false }, "/admin/access/workspace-roles?subject=kc-manager": workspaces(["COORDINATOR"]) }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    expect(await screen.findByText("No RehletShifaa business roles assigned")).toBeVisible();
    expect(await screen.findByText("Coordinator")).toBeVisible();
    expect(screen.queryByText(/no access/i)).not.toBeInTheDocument();
  });

  it("gives access in three steps: role, where it applies, review — reason required, backend validates", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "POST /admin/access/assignments": { status: "ACTIVE" } }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    fireEvent.click(await screen.findByRole("button", { name: /Give access/ }));
    expect(screen.getByRole("list", { name: "Setup steps" }).querySelectorAll("li")).toHaveLength(3);
    fireEvent.click(await screen.findByRole("radio", { name: /Practice Manager/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Clinicians they manage" }));
    expect(screen.getByText(/Applies only to clinicians this person actually manages/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Organization/), { target: { value: "org-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Clinicians they manage · Nile Care Clinic")).toBeVisible();
    expect(screen.getByText(/Set a start or end date/).closest("details")).not.toHaveAttribute("open");
    const confirm = screen.getByRole("button", { name: "Confirm access" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason for giving access/), { target: { value: "Runs the Nile Care practice" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(calls("POST").find((c) => c.path === "/admin/access/assignments")?.body).toContain("\"scope\":\"MANAGED_CLINICIANS\""));
    const body = JSON.parse(calls("POST").find((c) => c.path === "/admin/access/assignments")!.body);
    expect(body).toMatchObject({ subject: "kc-manager", organizationId: "org-a", versionId: "v3", reason: "Runs the Nile Care practice", effectiveTo: null });
    expect(await screen.findByText("Access saved.")).toBeVisible();
  });

  it("explains what removing a role does, asks for the reason, and revokes only that role's assignments", async () => {
    render(<AccessGovernance locale="en" view="users" {...person} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove access: Practice Manager — Nile Care Clinic" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Practice Manager access?" });
    expect(within(dialog).getByText(/will no longer be able to do what Practice Manager allows in/)).toHaveTextContent("Other workspace access and unrelated roles will not be changed.");
    expect(within(dialog).getByText(/They stay a member of the organization/)).toBeVisible();
    const remove = within(dialog).getByRole("button", { name: "Remove access" });
    expect(remove).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason for removing access/), { target: { value: "Left the practice" } });
    fireEvent.click(remove);
    await waitFor(() => expect(calls("POST").map((c) => c.path)).toEqual(["/admin/access/assignments/a1/revoke?organization=org-a", "/admin/access/assignments/a2/revoke?organization=org-a"]));
    expect(await screen.findByText("Practice Manager access removed.")).toBeVisible();
    // Never an account, membership, relationship or identity-system change.
    expect(calls("POST").concat(calls("PUT"), calls("DELETE")).filter((c) => /members|relationships|workspace-roles|staff/.test(c.path))).toHaveLength(0);
  });

  it("answers 'Can this person…?' with the backend decision, its role, place, reason and validity", async () => {
    const path = "/admin/access/check?subject=kc-manager&permission=price_list.manage&organization=org-a&clinician=prac-1";
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, [path]: { allowed: true, reason: "ALLOWED", permission: "price_list.manage", organizationId: "org-a", organizationName: "Nile Care Clinic", clinicianId: "prac-1", clinicianName: "Dr Salma Farouk", roleName: "Practice Manager", scope: "MANAGED_CLINICIANS", relationship: "MANAGES", validUntil: "2026-12-31T00:00:00Z", recentAuthentication: false, heldScopes: ["MANAGED_CLINICIANS"] } }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    const summary = await screen.findByRole("region", { name: "Access Summary" });
    fireEvent.change(within(summary).getByLabelText(/Can Mona Adel/), { target: { value: "price_list.manage" } });
    fireEvent.change(await within(summary).findByLabelText(/For a clinician/), { target: { value: "prac-1" } });
    fireEvent.click(within(summary).getByRole("button", { name: "Check" }));
    const result = await within(summary).findByRole("status");
    expect(await within(result).findByText("Allowed")).toBeVisible();
    expect(within(result).getByText("They manage Dr Salma Farouk")).toBeVisible();
    expect(within(result).getByText("Practice Manager")).toBeVisible();
    expect(within(result).getByText(/^Until 31 Dec 2026/)).toBeVisible();
    expect(within(result).getByText("price_list.manage").closest("details")).not.toHaveAttribute("open");
    expect(calls("GET").some((c) => c.path === path)).toBe(true);
  });

  it("explains a denial from the backend's reason, without reconstructing the decision", async () => {
    const path = "/admin/access/check?subject=kc-manager&permission=price_list.manage&organization=org-a";
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, [path]: { allowed: false, reason: "SCOPE_MISMATCH", permission: "price_list.manage", organizationId: "org-a", organizationName: "Nile Care Clinic", clinicianId: null, clinicianName: null, roleName: null, scope: null, relationship: null, validUntil: null, recentAuthentication: false, heldScopes: ["MANAGED_CLINICIANS"] } }, capabilities));
    render(<AccessGovernance locale="en" view="users" {...person} />);
    const summary = await screen.findByRole("region", { name: "Access Summary" });
    fireEvent.change(within(summary).getByLabelText(/Can Mona Adel/), { target: { value: "price_list.manage" } });
    fireEvent.click(within(summary).getByRole("button", { name: "Check" }));
    expect(await within(summary).findByText("Not allowed")).toBeVisible();
    expect(within(summary).getByText("Their role allows this only for clinicians they manage.")).toBeVisible();
  });

  it("offers only lifecycle actions that exist, and no single 'delete person'", async () => {
    render(<AccessGovernance locale="en" view="users" {...person} />);
    const region = await screen.findByRole("region", { name: "Changing or ending access" });
    expect(within(region).getByText(/There is no single "delete person" action/)).toBeVisible();
    expect(within(region).getByText("End an organization membership")).toBeVisible();
    expect(within(region).getByText(/no command yet to disable a provider member's sign-in account/)).toBeVisible();
    expect(within(region).getByText(/Not automatic/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("renders the person page right-to-left in Arabic with isolated names", async () => {
    const { container } = render(<AccessGovernance locale="ar" view="users" {...person} />);
    expect(await screen.findByRole("region", { name: "الوصول إلى أعمال رحلة شفاء" })).toBeVisible();
    expect(container.querySelector(".ag")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("region", { name: "ملخص الصلاحيات" })).toBeVisible();
    expect(container.querySelector("h2 bdi")).not.toBeNull();
  });

  it("keeps an open panel when the access token silently renews (same subject, new object)", async () => {
    const { rerender } = render(<AccessGovernance locale="en" view="users" {...person} />);
    expect(await screen.findByRole("region", { name: "Business access" })).toBeVisible();
    await waitFor(() => expect(screen.queryAllByRole("status").filter((el) => /Loading|Checking/.test(el.textContent ?? ""))).toHaveLength(0));
    await new Promise((r) => setTimeout(r, 50));
    vi.mocked(apiFetchAs).mockClear();
    auth.user = { access_token: "renewed", profile: { sub: "owner" } };
    rerender(<AccessGovernance locale="en" view="users" {...person} />);
    expect(screen.getByRole("region", { name: "Business access" })).toBeVisible();
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(apiFetchAs).mock.calls.map(([, path]) => path)).toEqual([]);
  });
});

describe("Roles — first-class governance", () => {
  it("lists what each role is for and whether it is in use or being changed, without raw keys", async () => {
    render(<AccessGovernance locale="en" view="roles" />);
    const pm = await screen.findByRole("button", { name: /Practice Manager/ });
    expect(within(pm).getByText("In use")).toBeVisible();
    expect(within(screen.getByRole("button", { name: /Consultant/ })).getByText("Change in progress")).toBeVisible();
    expect(screen.queryByText("PRACTICE_MANAGER")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Permission reference" })).toHaveAttribute("href", "/en/portal/control-center/access/permissions");
  });

  it("shows a role's purpose, what it allows, where, restrictions and versions — and edits a copy, never the published version", async () => {
    const copy = { role, versions: [{ version: version("v4", 4, "DRAFT", "owner"), grants: roleDetail.versions[0].grants }, ...roleDetail.versions] };
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "POST /admin/access/roles/role-1/drafts": copy }, capabilities));
    render(<AccessGovernance locale="en" view="roles" />);
    fireEvent.click(await screen.findByRole("button", { name: /Practice Manager/ }));
    for (const name of ["Overview", "What this role allows", "Where it can apply", "Restrictions & conflicts", "Versions & history"]) expect(await screen.findByRole("region", { name })).toBeVisible();
    expect(screen.getAllByText(/Clinicians they manage/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Published versions never change/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit a copy" }));
    await waitFor(() => expect(calls("POST").find((c) => c.path === "/admin/access/roles/role-1/drafts")?.body).toContain("\"baseVersionId\":\"v3\""));
    expect(calls("PUT")).toHaveLength(0);
    // The wizard opens on the copy: five steps; the maker is told an independent reviewer publishes.
    expect(await screen.findByRole("list", { name: "Role change steps" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "5. Review & publish" }));
    expect(screen.getByText("You prepared this draft, so another authorized reviewer must publish it.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Publish version" })).not.toBeInTheDocument();
  });

  it("saves drafts with a prefilled change note and asks for the governance reason only when publishing", async () => {
    const draft = { role, versions: [{ version: { ...version("v4", 4, "VALIDATED", "someone-else") }, grants: roleDetail.versions[0].grants }, ...roleDetail.versions] };
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/access/roles/role-1": draft, "PUT /admin/access/roles/role-1/versions/v4": draft.versions[0], "POST /admin/access/roles/role-1/versions/v4/publish": draft.versions[0] }, capabilities));
    render(<AccessGovernance locale="en" view="roles" />);
    fireEvent.click(await screen.findByRole("button", { name: /Practice Manager/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue the prepared change" }));
    // Saving never publishes and needs no typed reason.
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect(JSON.parse(calls("PUT")[0].body).reason).toBe("Role draft updated");
    expect(calls("POST").filter((c) => c.path.endsWith("/publish"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "5. Review & publish" }));
    const publish = screen.getByRole("button", { name: "Publish version" });
    fireEvent.change(screen.getByLabelText(/Effective from/), { target: { value: "2026-10-01T09:00" } });
    expect(publish).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason for publishing/), { target: { value: "Quarterly access review" } });
    fireEvent.click(publish);
    await waitFor(() => expect(calls("POST").find((c) => c.path.endsWith("/publish"))?.body).toContain("Quarterly access review"));
  });

  it("states that retiring a version removes that access immediately", async () => {
    render(<AccessGovernance locale="en" view="roles" />);
    fireEvent.click(await screen.findByRole("button", { name: /Practice Manager/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Retire version/ }));
    const dialog = await screen.findByRole("dialog", { name: "Retire version 3 of Practice Manager?" });
    expect(within(dialog).getByText(/loses what it allows immediately/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Retire version" })).toBeDisabled();
  });

  it("groups role creation into five labelled steps with Arabic RTL controls", async () => {
    const { container } = render(<AccessGovernance locale="ar" view="roles" />);
    await screen.findByRole("button", { name: /مدير العيادة/ });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    fireEvent.click(screen.getByRole("button", { name: /إنشاء دور/ }));
    expect(screen.getByRole("list", { name: "إنشاء دور" }).querySelectorAll("button")).toHaveLength(5);
    expect(screen.getByLabelText("اسم الدور")).toBeVisible();
    expect(screen.getByRole("button", { name: "حفظ المسودة" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "3. أين ينطبق" }));
    expect(screen.getByRole("button", { name: "3. أين ينطبق" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("متقدم: المشاركة في الرحلة وقناة الوصول").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps the permission reference readable, with keys only under advanced details", async () => {
    render(<AccessGovernance locale="en" view="permissions" />);
    expect(await screen.findByText("View roles and capabilities")).toBeVisible();
    expect(screen.getByText("access.role.view").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/New permissions can't be added here/)).toBeVisible();
    expect(screen.queryByText(/Keycloak|JWT|Spring Security/)).not.toBeInTheDocument();
  });

  it("fails closed on a denied page and renders a recoverable error", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    render(<AccessGovernance locale="en" view="roles" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Create role/ })).not.toBeInTheDocument();
    cleanup();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/access/roles?offset=0": new Response("{}", { status: 500 }) }, capabilities));
    render(<AccessGovernance locale="en" view="roles" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});

describe("Audit", () => {
  it("shows readable, append-only history and filters by action and date", async () => {
    const entry = { actor: "kc-manager", entity: "role-1", action: "ROLE_PUBLISHED", outcome: "SUCCESS", reason: "Initial publication", occurredAt: "2026-01-01T00:00:00Z" };
    vi.mocked(apiFetchAs).mockImplementation((token, path, init) => fakeApi({ ...routes, [String(path)]: String(path).startsWith("/admin/access/audit") ? [entry] : routes[String(path)] }, capabilities)(token, path, init));
    render(<AccessGovernance locale="en" view="audit" />);
    expect(await screen.findByText("Role version published")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Audit" })).toBeVisible();
    expect(await screen.findByText("Mona Adel")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "ASSIGNMENT_REVOKED" } });
    await waitFor(() => expect(calls("GET").some((c) => c.path === "/admin/access/audit?action=ASSIGNMENT_REVOKED")).toBe(true));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    await waitFor(() => expect(calls("GET").some((c) => c.path.startsWith("/admin/access/audit?action=ASSIGNMENT_REVOKED&from="))).toBe(true));
    expect(screen.getByText(/append-only/)).toBeVisible();
  });
});
