import { describe, expect, it } from "vitest";
import { credentialDisplayStatus, credentialIsExpired } from "./admin-labels";
import { EXPIRING_SOON_DAYS, credentialValidity, requirementState, validityText, type Revision } from "./credential-lifecycle";

const NOW = new Date(2026, 8, 24, 9, 30).getTime(); // 24 Sep 2026, 09:30 local
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();
const rev = (overrides: Partial<Revision>): Revision => ({ id: "r", organizationId: "o", practitionerId: "p", ownerSubject: "s", credentialType: "MEDICAL_LICENSE", revisionNumber: 1, status: "SUBMITTED", dossierStatus: "OPEN", expiresAt: null, submittedBy: "s", submittedAt: "2026-01-01T00:00:00Z", version: 0, evidenceIds: [], ...overrides });

describe("credential validity (one rule, the backend's)", () => {
  it("never expires without an expiry date", () => {
    expect(credentialValidity(null, NOW)).toEqual({ kind: "none" });
    expect(validityText(credentialValidity(undefined, NOW), "en")).toBeNull();
  });
  it("a future date is valid, then expiring within the one threshold", () => {
    expect(credentialValidity(at(2027, 0, 10), NOW).kind).toBe("valid");
    const soon = credentialValidity(at(2026, 9, 15), NOW);
    expect(soon).toMatchObject({ kind: "expiring", days: 21 });
    expect(validityText(soon, "en")).toMatchObject({ label: "Expires in 21 days", soon: true });
    expect(credentialValidity(at(2026, 8, 24 + EXPIRING_SOON_DAYS), NOW).kind).toBe("expiring");
    expect(credentialValidity(at(2026, 8, 25 + EXPIRING_SOON_DAYS), NOW).kind).toBe("valid");
  });
  it("expiry today counts from the expiry instant, without an off-by-one day", () => {
    const today = credentialValidity(at(2026, 8, 24, 12), NOW);
    expect(today).toMatchObject({ kind: "expiring", days: 0 });
    expect(validityText(today, "en")!.label).toBe("Expires today");
    const later = credentialValidity(at(2026, 8, 24, 12), new Date(2026, 8, 24, 13).getTime());
    expect(later.kind).toBe("expired");
    expect(validityText(later, "en")!.label).toBe("Expired today");
    expect(validityText(credentialValidity(at(2026, 8, 25), NOW), "en")!.label).toBe("Expires tomorrow");
  });
  it("a past date is expired, and a verified credential past it is never shown as Verified", () => {
    const past = at(2026, 8, 14);
    expect(credentialValidity(past, NOW).kind).toBe("expired");
    expect(validityText(credentialValidity(past, NOW), "en")!.label).toMatch(/^Expired 14 Sept? 2026$/);
    expect(credentialIsExpired("VERIFIED", past, NOW)).toBe(true);
    expect(credentialDisplayStatus("VERIFIED", past, "en", NOW).label).toBe("Expired");
    expect(credentialDisplayStatus("VERIFIED", at(2027, 0, 1), "en", NOW).label).toBe("Verified");
  });
});

describe("requirement state precedence (mirrors backend readiness and the directory)", () => {
  it("not submitted", () => expect(requirementState([], NOW).key).toBe("NOT_SUBMITTED"));
  it.each([["SUBMITTED"], ["UNDER_REVIEW"], ["MORE_INFORMATION_REQUIRED"], ["REJECTED"]])("shows the latest version's %s", (status) => {
    expect(requirementState([rev({ status })], NOW).key).toBe(status);
  });
  it("a newer version under review does not hide an effective verified one", () => {
    const s = requirementState([rev({ id: "a", status: "VERIFIED", dossierStatus: "VERIFIED", expiresAt: at(2027, 0, 1) }), rev({ id: "b", revisionNumber: 2, status: "UNDER_REVIEW", dossierStatus: "VERIFIED" })], NOW);
    expect(s.key).toBe("VERIFIED");
    expect(s.newer?.id).toBe("b");
  });
  it("verified but expired is Expired; a later replacement is reported alongside", () => {
    const s = requirementState([rev({ id: "a", status: "VERIFIED", dossierStatus: "VERIFIED", expiresAt: at(2026, 8, 1) }), rev({ id: "b", revisionNumber: 2, status: "SUBMITTED", dossierStatus: "VERIFIED" })], NOW);
    expect(s.key).toBe("EXPIRED");
    expect(s.newer?.status).toBe("SUBMITTED");
  });
  it("an explicit suspension takes precedence over everything", () => {
    expect(requirementState([rev({ id: "a", status: "SUSPENDED", dossierStatus: "SUSPENDED" }), rev({ id: "b", revisionNumber: 2, status: "SUBMITTED", dossierStatus: "SUSPENDED" })], NOW).key).toBe("SUSPENDED");
  });
});
