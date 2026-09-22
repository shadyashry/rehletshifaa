import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RoleManagement } from "./RoleManagement";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const organization = { id: "org-a", displayName: "Nile Care Clinic", type: "CLINIC", status: "ACTIVE", countryCode: "EG", timeZone: "Africa/Cairo", defaultCurrency: "EGP", legacyMappingStatus: "REVIEWED", version: 0 };
const consultant = { subject: "dr-consultant", kind: "CLINICIAN" as const, practitionerId: "prac-consultant", status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 0, roles: ["CONSULTANT"] };
const associate = { subject: "dr-associate", kind: "CLINICIAN" as const, practitionerId: "prac-associate", status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 0, roles: ["ASSOCIATE_DOCTOR"] };
const detail = { organization, members: [consultant, associate], relationships: [] };

function mockApi(capabilities: string[]) {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path, init) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
    if (path === "/admin/providers/org-a" && (!init || init.method === undefined || init.method === "GET")) return new Response(JSON.stringify(detail), { status: 200 });
    if (path === "/admin/providers/org-a/relationships" && init?.method === "POST") return new Response(JSON.stringify({ id: "rel-1", subject: "dr-consultant", type: "SUPERVISES", targetPractitionerId: "prac-associate", status: "ACTIVE", revision: 0 }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Associate Doctor management", () => {
  it("lets an authorized user assign a Consultant supervisor through the registered SUPERVISES relationship", async () => {
    mockApi(["provider.view", "provider.relationship.manage"]);
    render(<RoleManagement locale="en" organizationId="org-a" role="ASSOCIATE_DOCTOR" />);
    fireEvent.click(await screen.findByRole("button", { name: /Assign Consultant supervisor/ }));
    fireEvent.change(screen.getByLabelText("Choose a Consultant"), { target: { value: "dr-consultant" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Assigning supervision" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/relationships", expect.objectContaining({ method: "POST" })));
  });

  it("focuses the dialog's first field on open and closes it on Escape, restoring focus to the trigger", async () => {
    mockApi(["provider.view", "provider.relationship.manage"]);
    render(<RoleManagement locale="en" organizationId="org-a" role="ASSOCIATE_DOCTOR" />);
    const trigger = await screen.findByRole("button", { name: /Assign Consultant supervisor/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: /Assign Consultant supervisor/ });
    expect(dialog).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("Choose a Consultant")).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("hides the relationship assignment action without provider.relationship.manage", async () => {
    mockApi(["provider.view"]);
    render(<RoleManagement locale="en" organizationId="org-a" role="ASSOCIATE_DOCTOR" />);
    await screen.findByText("dr-associate");
    expect(screen.queryByRole("button", { name: /Assign Consultant supervisor/ })).not.toBeInTheDocument();
  });

  it("fails closed without provider.view", async () => {
    mockApi([]);
    render(<RoleManagement locale="en" organizationId="org-a" role="CONSULTANT" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
  });
});
