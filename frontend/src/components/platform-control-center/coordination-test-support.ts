/** Fixtures for the Coordination Setup tests: named people, one team, one consultant, one rules version. */
import type { ConsultantRouting, CoordinationOverview, CoordinationPerson, DecisionEntry, Policy, SimulationResult, Team } from "./coordination-types";

export const coordOrg = { id: "org-1", displayName: "Nile Care Clinic", type: "CLINIC", status: "ACTIVE" };
export const coordBase = "/admin/coordination/org-1";
const past = "2026-01-01T00:00:00Z", future = "2027-06-01T00:00:00Z";

export const coordTeam: Team = { id: "team-1", organizationId: "org-1", name: "Cardiology Desk", configuration: { active: true, purpose: "Cardiology intake", careAreas: ["cardiology"], languages: ["en"], timeZone: "Asia/Dubai", fallbackTeam: null }, revision: 2 };
export const sara: CoordinationPerson = { subject: "kc-sara", name: "Sara Ahmed", account: "ACTIVE", member: true, workload: 3,
  teams: [{ team: "team-1", active: true, lead: true, effectiveFrom: past, effectiveTo: null, revision: 4 }],
  capacity: { subject: "kc-sara", maximum: 12, onDuty: true, languages: ["en", "ar"], careAreas: [], revision: 1 } };
export const omar: CoordinationPerson = { subject: "kc-omar", name: "Omar Nabil", account: "ACTIVE", member: true, workload: 0, teams: [], capacity: null };
export const disabledPerson: CoordinationPerson = { subject: "kc-hala", name: "Hala Disabled", account: "DISABLED", member: true, workload: 0, teams: [], capacity: null };
export const coordPeople = [sara, omar, disabledPerson];

export const evaluationOverview: CoordinationOverview = { liveCases: 0, evaluatedCases: 4, liveQueue: 0, policyVersion: 2, policyEffectiveFrom: past, policyEffectiveTo: future };
export const coordPolicy: Policy = { id: "policy-2", organizationId: "org-1", version: 2, effectiveFrom: past, effectiveTo: future,
  configuration: { capacityWeight: 80, languageWeight: 20, requireOnDuty: true, mandatoryLanguage: false, providerTeam: "team-1", careAreaTeams: { cardiology: "team-1" }, defaultTeam: null, fallbackTeam: null, queueHours: 24 } };
export const coordConsultant: ConsultantRouting = { consultantId: "prac-1", name: "Dr Salma Farouk",
  current: { id: "pref-1", organizationId: "org-1", consultantId: "prac-1", version: 1, effectiveFrom: past, effectiveTo: future, coordinator: "kc-sara", team: null, fallbackTeam: null },
  latest: { id: "pref-1", organizationId: "org-1", consultantId: "prac-1", version: 1, effectiveFrom: past, effectiveTo: future, coordinator: "kc-sara", team: null, fallbackTeam: null } };
export const shadowEntry: DecisionEntry = { id: "d-1", caseId: "case-1", caseNumber: "RS-2026-0042", mode: "SHADOW", path: "PREFERRED_COORDINATOR", source: "LEGACY_ASSIGNMENT", actorName: null,
  previousOwner: "kc-omar", previousOwnerName: "Omar Nabil", selectedOwner: "kc-sara", selectedOwnerName: "Sara Ahmed", team: "team-1", reason: null, evaluatedAt: "2026-09-24T10:42:00Z", legacyMatches: false, policyVersion: 2 };
export const liveEntry: DecisionEntry = { ...shadowEntry, id: "d-2", mode: "LIVE", path: "MANUAL_REASSIGN", actorName: "Mohamed Ali", reason: "Coverage change" };
export const simulation: SimulationResult = { policyId: "policy-2", policyVersion: 2, algorithm: "coordination-v1",
  candidates: [
    { subject: "kc-sara", teams: ["team-1"], maximum: 12, workload: 3, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] },
    { subject: "kc-omar", teams: [], maximum: 0, workload: 0, onDuty: false, languageMatch: false, lastAssignment: null, exclusions: ["NO_ACTIVE_TEAM", "OFF_DUTY"] },
  ],
  selection: { subject: "kc-sara", team: "team-1", path: "PROVIDER_TEAM", scores: [{ candidate: { subject: "kc-sara", teams: ["team-1"], maximum: 12, workload: 3, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] }, capacityFactor: "0.75", languageFactor: "1", score: "80" }] } };
