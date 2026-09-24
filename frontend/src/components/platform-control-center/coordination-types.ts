/** Typed 1:1 off the real backend records (coordination/domain/Routing.java) — nothing invented client-side. */

export type TeamConfig = {
  active: boolean; purpose: string; careAreas: string[]; languages: string[]; timeZone: string; fallbackTeam: string | null;
};
export type Team = { id: string; organizationId: string; name: string; configuration: TeamConfig; revision: number };
export type Member = { subject: string; effectiveFrom: string; effectiveTo: string | null; active: boolean; lead: boolean; revision: number };
export type Capacity = { subject: string; maximum: number; onDuty: boolean; languages: string[]; careAreas: string[]; revision: number };
export type PolicyConfig = {
  capacityWeight: number; languageWeight: number; requireOnDuty: boolean; mandatoryLanguage: boolean;
  providerTeam: string | null; careAreaTeams: Record<string, string>; defaultTeam: string | null; fallbackTeam: string | null; queueHours: number;
};
export type Policy = { id: string; organizationId: string; version: number; effectiveFrom: string; effectiveTo: string | null; configuration: PolicyConfig };
export type Preference = {
  id: string; organizationId: string; consultantId: string; version: number; effectiveFrom: string; effectiveTo: string | null;
  coordinator: string | null; team: string | null; fallbackTeam: string | null;
};
export type CaseFacts = {
  id: string; organizationId: string; consultantId: string; careArea: string | null; language: string | null;
  owner: string | null; mode: "SHADOW" | "LIVE"; revision: number; status: string;
};
export type Candidate = {
  subject: string; teams: string[]; maximum: number; workload: number; onDuty: boolean; languageMatch: boolean;
  lastAssignment: string | null; exclusions: string[];
};
export type Scored = { candidate: Candidate; capacityFactor: string; languageFactor: string; score: string };
export type Selection = { subject: string | null; team: string | null; path: string; scores: Scored[] };
export type CoordinationDecision = {
  id: string; caseId: string; mode: "SHADOW" | "LIVE"; policyId: string; policyVersion: number; preferenceId: string | null;
  previousOwner: string | null; selectedOwner: string | null; team: string | null; path: string; explanation: string;
  candidates: Candidate[]; scores: Scored[]; source: string; reason: string | null; evaluatedAt: string; revision: number;
  legacyMatches: boolean; algorithm: string;
};
export type QueueItem = { caseId: string; caseNumber: string; taskId: string; team: string | null; reason: string | null; queuedAt: string | null; dueAt: string | null; revision: number };
export type SimulationResult = { policyId: string; policyVersion: number; algorithm: string; candidates: Candidate[]; selection: Selection };

/** UX-7 read models (CoordinationReadService). Names and case numbers for people; subjects only for commands. */
export type CoordinationOverview = {
  liveCases: number; evaluatedCases: number; liveQueue: number | null;
  policyVersion: number | null; policyEffectiveFrom: string | null; policyEffectiveTo: string | null;
};
export type PersonTeam = { team: string; active: boolean; lead: boolean; effectiveFrom: string; effectiveTo: string | null; revision: number };
export type CoordinationPerson = {
  subject: string; name: string | null; account: "ACTIVE" | "DISABLED" | "NONE"; member: boolean;
  teams: PersonTeam[]; capacity: Capacity | null; workload: number;
};
export type ConsultantRouting = { consultantId: string; name: string | null; current: Preference | null; latest: Preference | null };
export type DecisionEntry = {
  id: string; caseId: string; caseNumber: string; mode: "SHADOW" | "LIVE"; path: string; source: string | null; actorName: string | null;
  previousOwner: string | null; previousOwnerName: string | null; selectedOwner: string | null; selectedOwnerName: string | null;
  team: string | null; reason: string | null; evaluatedAt: string; legacyMatches: boolean; policyVersion: number;
};

export type Decision = { permission: string; allowed: boolean };
