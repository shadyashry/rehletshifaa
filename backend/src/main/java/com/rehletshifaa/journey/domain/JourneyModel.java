package com.rehletshifaa.journey.domain;

import java.time.Instant;
import java.util.*;

/** Configuration only. These records confer no authority to execute clinical or commercial work. */
public final class JourneyModel {
    private JourneyModel() {}
    public enum ActorType { PATIENT, REPRESENTATIVE, COORDINATOR, CONSULTANT, ASSOCIATE_DOCTOR, PRACTICE_STAFF, OPERATIONS, FINANCE, PLATFORM_STAFF, SYSTEM }
    public enum StageType { START, STAFF_TASK, PATIENT_ACTION, DECISION, SYSTEM_ACTION, WAIT, TIMER, NOTIFICATION, END }
    public enum Status { DRAFT, VALIDATED, SIMULATED, PENDING_APPROVAL, PUBLISHED, RETIRED }
    public enum Fact { PROPOSAL_ACCEPTED, DEPOSIT_SATISFIED, PROFILE_COMPLETE, INFORMATION_COMPLETE }
    public record Condition(String fact, Boolean equalsValue) {}
    public record Sla(Long dueMinutes, Long reminderMinutes, Long escalationMinutes) {}
    public record Node(String key, String label, StageType type, String actorType, String action,
                       Condition entry, Condition exit, Sla sla, Long timerMinutes, boolean blocking) {}
    public record Edge(String key, String from, String to, Condition condition) {}
    public record Graph(List<Node> nodes, List<Edge> edges) {
        public Graph { nodes=nodes==null?List.of():List.copyOf(nodes); edges=edges==null?List.of():List.copyOf(edges); }
    }
    public record Definition(UUID id, String key, String name, Instant createdAt) {}
    public record Version(UUID id, UUID definitionId, int number, Status status, long revision, String createdBy,
                          Graph graph, String graphHash, String validationSummary, String simulationSummary,
                          Instant publishedAt, Instant retiredAt, String runtimeDeployment) {}
    public record Issue(String code, String nodeKey, String message) {}
    public record Validation(List<Issue> errors, List<Issue> warnings) { public boolean valid() { return errors.isEmpty(); } }
    /** Future runtime-to-assignment contract; deliberately contains no individual or organization identifier. */
    public record WorkRequirement(UUID journeyVersionId, String nodeKey, ActorType actorType, String action,
                                  boolean blocking, Sla sla) {}
    public record Step(String nodeKey, String label, String actorType, String action, String state) {}
    public record Simulation(String outcome, List<Step> steps, Validation validation) {}
}
