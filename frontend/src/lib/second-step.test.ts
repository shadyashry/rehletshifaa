import { describe, expect, it } from "vitest";
import { guardsSecondStep, secondStepPlan } from "./second-step";
import type { Me } from "./access";

const me = (patch: Partial<Me>): Me => ({ subject: "s", roles: [], permissions: [], reauthenticate: [], workspaces: [], managedFunctions: [],
  platformAccountOwner: false, workforce: null, pendingActions: [], ...patch });

/** D1: a staff session without its second factor finishes the sign-in once, then explains — never a redirect loop. */
describe("second step", () => {
  it("finishes the sign-in once, then explains", () => {
    const staff = me({ roles: ["COORDINATOR"], signInAcr: "2", secondFactorRequired: true });
    expect(secondStepPlan(staff, null, 1_000_000)).toBe("redirect");
    expect(secondStepPlan(staff, 1_000_000 - 60_000, 1_000_000)).toBe("gate");
    expect(secondStepPlan(staff, 1_000_000 - 4 * 60_000, 1_000_000)).toBe("redirect");
  });

  it("leaves patients and completed sessions alone", () => {
    expect(secondStepPlan(me({ roles: ["PATIENT"], signInAcr: null, secondFactorRequired: false }), null)).toBe("none");
    expect(secondStepPlan(me({ roles: ["FINANCE"], signInAcr: "3", secondFactorRequired: false }), null)).toBe("none");
    expect(secondStepPlan(null, null)).toBe("none");
  });

  it("guards only the staff surfaces", () => {
    expect(guardsSecondStep("/en/portal")).toBe(true);
    expect(guardsSecondStep("/ar/control-center/people")).toBe(true);
    expect(guardsSecondStep("/en/care-areas")).toBe(false);
    expect(guardsSecondStep("/en/portalish")).toBe(false);
  });
});
