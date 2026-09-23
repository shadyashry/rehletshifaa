/**
 * Test helper: a fake `apiFetchAs` answering by path. Keys are either a path ("/admin/providers") or
 * "METHOD path" ("POST /admin/providers/org/members/invite"); values are the JSON body, a Response, or a
 * function of the request. `/admin/access/me` answers from `capabilities`. Unknown paths answer `{}`.
 */
type Handler = unknown | Response | ((init?: RequestInit) => unknown | Response);
export function fakeApi(map: Record<string, Handler>, capabilities: string[] = []) {
  return async (_token: string, path: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (path.endsWith("/admin/access/me")) return json(capabilities.map((permission) => ({ permission, allowed: true, reason: "ALLOWED" })));
    const handler = map[`${method} ${path}`] ?? (method === "GET" ? map[path] : undefined);
    if (handler === undefined) return json({});
    const value = typeof handler === "function" ? (handler as (i?: RequestInit) => unknown)(init) : handler;
    return value instanceof Response ? value : json(value);
  };
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
export const failure = (status: number, code: string, message = code) => json({ code, message }, status);

export const organization = { id: "org-a", legalName: "Nile Care LLC", businessName: "Nile Care", displayName: "Nile Care Clinic", type: "CLINIC", status: "ONBOARDING", countryCode: "EG", timeZone: "Africa/Cairo", defaultCurrency: "EGP", legacyMappingStatus: null, version: 3 };
export const consultantMember = { subject: "kc-consultant", kind: "CLINICIAN", practitionerId: "prac-1", status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 2, roles: ["CONSULTANT"], displayName: "Dr Salma Farouk" };
export const managerMember = { subject: "kc-manager", kind: "PRACTICE_STAFF", practitionerId: null, status: "PENDING", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "INVITED", revision: 0, roles: ["PRACTICE_MANAGER"], displayName: "Mona Adel" };
export const ownerMember = { subject: "kc-owner", kind: "PRACTICE_STAFF", practitionerId: null, status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 0, roles: ["ORGANIZATION_OWNER"], displayName: "Hany Nabil" };
export const providerDetail = { organization, members: [ownerMember, consultantMember, managerMember], relationships: [] as unknown[] };
export const onboarding = { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "PROFILE_INCOMPLETE", jurisdiction: "EG", version: 4, ownerSubject: "kc-consultant" };
export const readiness = (overrides: Record<string, unknown> = {}) => ({
  identityProvisioned: true, organizationMembershipActive: true, providerProfileComplete: true, clinicianProfileComplete: false,
  requiredCredentialsSubmitted: false, requiredCredentialsVerified: false, mandatoryCredentialsUnexpired: false, requiredRelationshipsComplete: true,
  pricingSetupRequired: true, pricingSetupComplete: false, availabilitySetupRequired: true, availabilitySetupComplete: false, credentialReady: false,
  blockers: [{ code: "CLINICIAN_PROFILE_INCOMPLETE", message: "Clinician profile information is incomplete." }, { code: "CREDENTIAL_MISSING", message: "Medical licence has not been submitted." }, { code: "SERVICES_PRICING_INCOMPLETE", message: "At least one active price is required for the clinician's enabled services." }],
  readyForActivation: false, evaluatedAt: "2026-09-23T00:00:00Z", ...overrides,
});
