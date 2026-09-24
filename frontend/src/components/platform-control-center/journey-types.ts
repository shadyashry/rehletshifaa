// Exact mirror of backend com.rehletshifaa.journey.domain.JourneyModel / JourneyDefinitionService /
// JourneyGraphValidator / JourneyStageRegistry / JourneyRuntimeController contracts. The frontend never
// invents a field or a validation/lifecycle rule — everything here is read directly off those backend types.

export type ActorType =
  | "PATIENT" | "REPRESENTATIVE" | "COORDINATOR" | "CONSULTANT" | "ASSOCIATE_DOCTOR"
  | "PRACTICE_STAFF" | "OPERATIONS" | "FINANCE" | "PLATFORM_STAFF" | "SYSTEM";

export type StageType = "START" | "STAFF_TASK" | "PATIENT_ACTION" | "DECISION" | "SYSTEM_ACTION" | "WAIT" | "TIMER" | "NOTIFICATION" | "END";

export type JourneyStatus = "DRAFT" | "VALIDATED" | "SIMULATED" | "PENDING_APPROVAL" | "PUBLISHED" | "RETIRED";

export type Fact =
  | "PROPOSAL_ACCEPTED" | "DEPOSIT_SATISFIED" | "PROFILE_COMPLETE" | "INFORMATION_COMPLETE"
  | "CONSULTANT_ACCEPTED" | "CLINICAL_ACCEPTED" | "PROPOSAL_NEEDS_REWORK";

export type Condition = { fact: string; equalsValue: boolean | null };
export type Sla = { dueMinutes: number | null; reminderMinutes: number | null; escalationMinutes: number | null };

export type JourneyNode = {
  key: string;
  label: string;
  type: StageType;
  actorType: string | null;
  action: string | null;
  entry: Condition | null;
  exit: Condition | null;
  sla: Sla | null;
  timerMinutes: number | null;
  blocking: boolean;
};

export type JourneyEdge = { key: string; from: string; to: string; condition: Condition | null };
export type JourneyGraph = { nodes: JourneyNode[]; edges: JourneyEdge[] };

export type JourneyDefinition = { id: string; key: string; name: string; createdAt: string };

export type JourneyVersion = {
  id: string;
  definitionId: string;
  number: number;
  status: JourneyStatus;
  revision: number;
  createdBy: string;
  graph: JourneyGraph;
  graphHash: string | null;
  validationSummary: string | null;
  simulationSummary: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
  runtimeDeployment: string | null;
};

export type JourneyIssue = { code: string; nodeKey: string | null; message: string };
export type JourneyValidation = { errors: JourneyIssue[]; warnings: JourneyIssue[] };

export type JourneyStep = { nodeKey: string; label: string; actorType: string; action: string | null; state: string };
export type JourneySimulation = { outcome: string; steps: JourneyStep[]; validation: JourneyValidation };

export type JourneyDetail = { definition: JourneyDefinition; versions: JourneyVersion[] };
export type JourneyValidationResult = { version: JourneyVersion; result: JourneyValidation };
export type JourneySimulationResult = { version: JourneyVersion; result: JourneySimulation };

/** `reason` is the technical detail the system recorded (Advanced only); `changeReason` is what the person said (J-1), null when none was recorded. */
export type JourneyHistoryEntry = { actor: string; entity: string; action: string; outcome: string; reason: string | null; changeReason: string | null; occurredAt: string };

export type JourneyCapability = {
  key: string;
  label: string;
  actors: ActorType[];
  stage: StageType;
  sourceContract: string;
  permissionReferences: string[];
};

export type JourneyRegistryMetadata = {
  actorTypes: ActorType[];
  stageTypes: StageType[];
  conditionFacts: Fact[];
  maxNodes: number;
  maxEdges: number;
  cyclePolicy: string;
  runtimeDeployment: string;
};

export type JourneyChange = { revision: number; reason: string };
export type JourneyEdit = { revision: number; reason: string; graph: JourneyGraph };
export type JourneySimulate = { revision: number; reason: string; facts: Record<string, boolean> };

export type JourneyReadiness = { journeyVersionId: string; status: "DEPLOYED" | "NOT_DEPLOYED"; compilerVersion: string | null; artifactHash: string | null };

export type Decision = { permission: string; allowed: boolean; reason?: string };

export const CONTROL_STAGE_TYPES: readonly StageType[] = ["START", "END", "DECISION", "WAIT", "TIMER"];

export function isControlStage(type: StageType): boolean {
  return (CONTROL_STAGE_TYPES as StageType[]).includes(type);
}

/** `GET /admin/journeys/summaries` (UX-8): one bounded list read — what is published, what is changing, last activity. */
export type JourneySummary = {
  id: string; key: string; name: string; createdAt: string;
  liveVersion: number | null; livePublishedAt: string | null; publishedVersions: number;
  draftVersion: number | null; draftStatus: JourneyStatus | null; versions: number; lastActivityAt: string | null;
};

/** The only field the Care Journeys pages read from `GET /admin/journey-cutover` (read-only, journey.view). */
export type JourneyCutoverStatus = { productionIntakeEnabled: boolean };
