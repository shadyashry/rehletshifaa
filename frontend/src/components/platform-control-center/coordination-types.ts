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
export type RoutingCommand = { key: string; revision: number; action: "SHADOW" | "ACTIVATE" | "AUTO" | "ASSIGN" | "REASSIGN" | "QUEUE"; target: string | null; team: string | null; reason: string | null; source: string };
export type QueueItem = { caseId: string; taskId: string; team: string | null; reason: string | null; queuedAt: string | null; dueAt: string | null; revision: number };
export type SimulationResult = { policyId: string; policyVersion: number; algorithm: string; candidates: Candidate[]; selection: Selection };

export type CandidateExclusionCode =
  | "ACCESS_OR_MEMBERSHIP_DENIED" | "STAFF_DISABLED" | "NO_ACTIVE_TEAM" | "CARE_AREA_MISMATCH" | "LANGUAGE_MISMATCH" | "OFF_DUTY" | "AT_CAPACITY";

export type Decision = { permission: string; allowed: boolean };
/**
 * Shared authenticated-fetch shape every Care Coordination tab receives from the workspace shell.
 * Deliberately not generic (`Promise<unknown>`, cast at each call site with `as T`) — a truly generic
 * call signature cannot be satisfied by a plain `vi.fn()` test double, which only ever returns one
 * concrete fixture type per test, not an arbitrary T.
 */
export type CoordinationApi = (path: string, method?: string, body?: unknown) => Promise<unknown>;

export type SelectionPath =
  | "CONTINUITY" | "PREFERRED_COORDINATOR" | "PREFERRED_TEAM" | "PROVIDER_TEAM" | "CARE_AREA_TEAM" | "DEFAULT_TEAM"
  | "CONSULTANT_FALLBACK_TEAM" | "FALLBACK_TEAM" | "TEAM_FALLBACK" | "SCORED_POOL" | "NO_ELIGIBLE_COORDINATOR"
  | "MANUAL_ASSIGN" | "MANUAL_REASSIGN" | "MANUAL_QUEUE";
