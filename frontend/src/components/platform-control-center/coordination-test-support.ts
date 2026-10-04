/** Fixtures for the Coordination Setup tests: named people, one care-coordination team, one consultant, one rules version. */
import type { ConsultantRouting, CoordinationOverview, CoordinationPerson, DecisionEntry, Policy, QueueItem, SimulationResult, Team } from "./coordination-types";

export const coordBase = "/admin/coordination";
const past = "2026-01-01T00:00:00Z", future = "2027-06-01T00:00:00Z";

export const coordTeam: Team = { id: "team-1", name: "Cardiology Desk", active: true, careAreas: ["cardiology"], languages: ["en"], fallbackTeam: null, revision: 2 };
export const sara: CoordinationPerson = { subject: "kc-sara", name: "Sara Ahmed", account: "ACTIVE", workload: 3,
  teams: [{ team: "team-1", lead: true, effectiveFrom: past, effectiveTo: null }],
  capacity: { subject: "kc-sara", maximum: 12, onDuty: true, languages: ["en", "ar"], careAreas: [], revision: 1 } };
export const omar: CoordinationPerson = { subject: "kc-omar", name: "Omar Nabil", account: "ACTIVE", workload: 0, teams: [], capacity: null };
export const formerCoordinator: CoordinationPerson = { subject: "kc-hala", name: "Hala Former", account: "NOT_A_COORDINATOR", workload: 0, teams: [], capacity: null };
export const coordPeople = [sara, omar, formerCoordinator];

export const routingOverview: CoordinationOverview = { routedCases: 4, queue: 1, policyVersion: 2, policyEffectiveFrom: past, policyEffectiveTo: future };
export const coordPolicy: Policy = { id: "policy-2", version: 2, effectiveFrom: past, effectiveTo: future,
  configuration: { capacityWeight: 80, languageWeight: 20, requireOnDuty: true, mandatoryLanguage: false, careAreaTeams: { cardiology: "team-1" }, defaultTeam: null, fallbackTeam: null, queueHours: 24 } };
export const coordConsultant: ConsultantRouting = { consultantId: "prac-1", name: "Dr Salma Farouk",
  current: { id: "pref-1", consultantId: "prac-1", version: 1, effectiveFrom: past, effectiveTo: future, coordinator: "kc-sara", team: null, fallbackTeam: null },
  latest: { id: "pref-1", consultantId: "prac-1", version: 1, effectiveFrom: past, effectiveTo: future, coordinator: "kc-sara", team: null, fallbackTeam: null } };
export const automaticEntry: DecisionEntry = { id: "d-1", caseId: "case-1", caseNumber: "RS-2026-0042", path: "PREFERRED_COORDINATOR", source: "JOURNEY_WORK", actorName: null,
  previousOwner: null, previousOwnerName: null, selectedOwner: "kc-sara", selectedOwnerName: "Sara Ahmed", team: "team-1", reason: null, evaluatedAt: "2026-09-24T10:42:00Z", policyVersion: 2 };
export const manualEntry: DecisionEntry = { ...automaticEntry, id: "d-2", path: "MANUAL_REASSIGN", actorName: "Mohamed Ali", previousOwner: "kc-sara", previousOwnerName: "Sara Ahmed", selectedOwner: "kc-omar", selectedOwnerName: "Omar Nabil", reason: "Coverage change" };
export const queued: QueueItem = { caseId: "case-9", caseNumber: "RS-2026-0099", taskId: "task-9", team: "team-1", reason: "NO_ELIGIBLE_COORDINATOR", queuedAt: past, dueAt: future, revision: 1 };
export const simulation: SimulationResult = { policyId: "policy-2", policyVersion: 2, algorithm: "coordination-v1",
  candidates: [
    { subject: "kc-sara", teams: ["team-1"], maximum: 12, workload: 3, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] },
    { subject: "kc-omar", teams: [], maximum: 0, workload: 0, onDuty: false, languageMatch: false, lastAssignment: null, exclusions: ["NO_ACTIVE_TEAM", "OFF_DUTY"] },
  ],
  selection: { subject: "kc-sara", team: "team-1", path: "CARE_AREA_TEAM", scores: [{ candidate: { subject: "kc-sara", teams: ["team-1"], maximum: 12, workload: 3, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] }, capacityFactor: "0.75", languageFactor: "1", score: "80" }] },
};
