import { describe, expect, it } from "vitest";
import { holds, leadsTeam, opensControlCenter, portalViews, reauthenticationAcr, satisfiesReauthenticationAcr, type Me } from "@/lib/access";

const me = (extra: Partial<Me>): Me => ({ subject: "s", roles: [], permissions: [], reauthenticate: [], workspaces: [], managedFunctions: [], platformAccountOwner: false, workforce: null, pendingActions: [], ...extra });

describe("access from /api/v1/me", () => {
  it("offers care-portal views only for the workspaces the backend reports, in a stable order", () => {
    expect(portalViews(me({ workspaces: ["FINANCE", "COORDINATION", "CONTROL_CENTER"] }))).toEqual(["coordinator", "finance"]);
    expect(portalViews(me({ workspaces: ["CONSULTANT", "CLINIC_DELEGATE"] }))).toEqual(["doctor"]);
    expect(portalViews(null)).toEqual([]);
  });

  it("opens the Control Center for its workspaces only", () => {
    expect(opensControlCenter(me({ workspaces: ["IDENTITY_REVIEW"] }))).toBe(true);
    expect(opensControlCenter(me({ workspaces: ["COORDINATION", "PATIENT"] }))).toBe(false);
  });

  it("reads permissions and team leadership as facts, fail-closed", () => {
    const lead = me({ permissions: ["ROUTING_READ"], workforce: { subject: "s", displayName: null, lifecycleStatus: "ACTIVE", mfaEnrolled: true, phishingResistantMfaEnrolled: false, functions: ["CARE_COORDINATION"], teams: [{ teamId: "t", function: "CARE_COORDINATION", name: "Desk", lead: true }] } });
    expect(holds(lead, "ROUTING_READ")).toBe(true);
    expect(holds(null, "ROUTING_READ")).toBe(false);
    expect(leadsTeam(lead, "CARE_COORDINATION")).toBe(true);
    expect(leadsTeam(lead, "FINANCE")).toBe(false);
  });

  it("requests MFA for workforce step-up and passkeys for administrators and the platform owner", () => {
    const worker = me({ roles: ["COORDINATOR"] });
    const administrator = me({ roles: ["SYSTEM_ADMINISTRATOR"] });
    const owner = me({ platformAccountOwner: true });

    expect(reauthenticationAcr(worker)).toBe("2");
    expect(reauthenticationAcr(administrator)).toBe("3");
    expect(reauthenticationAcr(owner)).toBe("3");
    expect(reauthenticationAcr(null)).toBe("3");
    expect(satisfiesReauthenticationAcr(worker, "pwd")).toBe(false);
    expect(satisfiesReauthenticationAcr(worker, "2")).toBe(true);
    expect(satisfiesReauthenticationAcr(administrator, "2")).toBe(false);
    expect(satisfiesReauthenticationAcr(administrator, 3)).toBe(true);
  });
});
