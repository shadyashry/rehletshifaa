/** Typed 1:1 off the backend records (coordination/domain/Routing.java) — nothing invented client-side. */

/** A care-coordination workforce team with its routing profile. `revision` is -1 until a profile is saved. */
export type Team = { id: string; name: string; active: boolean; careAreas: string[]; languages: string[]; fallbackTeam: string | null; revision: number };
export type TeamProfile = { careAreas: string[]; languages: string[]; fallbackTeam: string | null };
export type Capacity = { subject: string; maximum: number; onDuty: boolean; languages: string[]; careAreas: string[]; revision: number };
export type PolicyConfig = {
  capacityWeight: number; languageWeight: number; requireOnDuty: boolean; mandatoryLanguage: boolean;
  careAreaTeams: Record<string, string>; defaultTeam: string | null; fallbackTeam: string | null; queueHours: number;
};
export type Policy = { id: string; version: number; effectiveFrom: string; effectiveTo: string | null; configuration: PolicyConfig };
export type Preference = {
  id: string; consultantId: string; version: number; effectiveFrom: string; effectiveTo: string | null;
  coordinator: string | null; team: string | null; fallbackTeam: string | null;
};
/** `revision` is the number of routing decisions recorded for the case (the expected version for commands). */
export type CaseFacts = { id: string; consultantId: string | null; careArea: string | null; language: string | null; owner: string | null; revision: number; status: string };
export type Candidate = {
  subject: string; teams: string[]; maximum: number; workload: number; onDuty: boolean; languageMatch: boolean;
  lastAssignment: string | null; exclusions: string[];
};
export type Scored = { candidate: Candidate; capacityFactor: string; languageFactor: string; score: string };
export type Selection = { subject: string | null; team: string | null; path: string; scores: Scored[] };
export type CoordinationDecision = {
  id: string; caseId: string; policyId: string; policyVersion: number; preferenceId: string | null;
  previousOwner: string | null; selectedOwner: string | null; team: string | null; path: string; explanation: string;
  candidates: Candidate[]; scores: Scored[]; source: string; reason: string | null; evaluatedAt: string; revision: number; algorithm: string;
};
/** AUTO routes by policy; ASSIGN/REASSIGN pick an eligible Coordinator; QUEUE parks the case for the manager. */
export type RoutingAction = "AUTO" | "ASSIGN" | "REASSIGN" | "QUEUE";
export type QueueItem = { caseId: string; caseNumber: string; taskId: string; team: string | null; reason: string | null; queuedAt: string | null; dueAt: string | null; revision: number };
export type SimulationResult = { policyId: string; policyVersion: number; algorithm: string; candidates: Candidate[]; selection: Selection };

/** Read models (CoordinationReadService). Names and case numbers for people; subjects only for commands. */
export type CoordinationOverview = {
  routedCases: number; queue: number; policyVersion: number | null; policyEffectiveFrom: string | null; policyEffectiveTo: string | null;
};
export type PersonTeam = { team: string; lead: boolean; effectiveFrom: string; effectiveTo: string | null };
export type CoordinationPerson = {
  subject: string; name: string | null; account: "ACTIVE" | "DISABLED" | "NOT_A_COORDINATOR";
  teams: PersonTeam[]; capacity: Capacity | null; workload: number;
};
export type ConsultantRouting = { consultantId: string; name: string | null; current: Preference | null; latest: Preference | null };
export type DecisionEntry = {
  id: string; caseId: string; caseNumber: string; path: string; source: string | null; actorName: string | null;
  previousOwner: string | null; previousOwnerName: string | null; selectedOwner: string | null; selectedOwnerName: string | null;
  team: string | null; reason: string | null; evaluatedAt: string; policyVersion: number;
};
