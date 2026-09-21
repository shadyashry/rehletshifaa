package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.application.JourneyRuntimePort;
import com.rehletshifaa.journey.domain.JourneyModel.Fact;
import com.rehletshifaa.shared.api.ApiException;
import org.flowable.engine.ProcessEngine;
import org.flowable.bpmn.model.ReceiveTask;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Component
@ConditionalOnProperty(name = "app.journey.runtime.enabled", havingValue = "true")
@Transactional
public class FlowableJourneyRuntimeAdapter implements JourneyRuntimePort {
    private final ProcessEngine engine;
    public FlowableJourneyRuntimeAdapter(ProcessEngine engine) { this.engine = engine; }

    @Override public Deployment deploy(Artifact artifact) {
        var deployment = engine.getRepositoryService().createDeployment().name("Journey " + artifact.versionId())
                .key(artifact.versionId().toString()).addString(artifact.processKey() + ".bpmn20.xml", artifact.bpmn()).deploy();
        var definition = engine.getRepositoryService().createProcessDefinitionQuery().deploymentId(deployment.getId()).singleResult();
        return new Deployment(deployment.getId(), definition.getId());
    }
    @Override public Instance start(Deployment deployment, String businessKey, Map<String, Boolean> facts) {
        var instance = engine.getRuntimeService().startProcessInstanceById(deployment.definitionReference(), businessKey, variables(facts));
        advanceSatisfiedWaits(instance.getId());
        return inspect(instance.getId());
    }
    @Override public Instance inspect(String reference) {
        var instance = engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(reference).singleResult();
        if (instance == null) {
            var history = engine.getHistoryService().createHistoricProcessInstanceQuery().processInstanceId(reference).singleResult();
            if (history == null) throw missing();
            if (history.getEndTime() == null || history.getDeleteReason() != null) throw conflict("Runtime instance is unavailable.");
            return new Instance(reference, true, List.of());
        }
        var tasks = engine.getTaskService().createTaskQuery().processInstanceId(reference).list();
        var activities = engine.getRuntimeService().createExecutionQuery().processInstanceId(reference).list().stream()
                .filter(e -> e.getActivityId() != null)
                .map(e -> new Activity(e.getActivityId(), e.getId(), tasks.stream().filter(t -> e.getId().equals(t.getExecutionId()))
                        .map(org.flowable.task.api.Task::getId).findFirst().orElse(null)))
                .sorted(Comparator.comparing(Activity::nodeKey)).toList();
        return new Instance(reference, false, activities);
    }
    @Override public Instance complete(String reference, String nodeKey, Map<String, Boolean> facts) {
        inspect(reference);
        var task = engine.getTaskService().createTaskQuery().processInstanceId(reference).taskDefinitionKey("n_" + nodeKey).singleResult();
        if (task == null) throw conflict("The journey action is not currently available.");
        engine.getTaskService().complete(task.getId(), variables(facts));
        advanceSatisfiedWaits(reference);
        return inspect(reference);
    }
    @Override public Instance signal(String reference, String nodeKey, Map<String, Boolean> facts) {
        var state = inspect(reference);
        if (state.completed() || state.activities().stream().noneMatch(a -> a.nodeKey().equals("n_" + nodeKey)
                || a.nodeKey().equals("entry_" + nodeKey) || a.nodeKey().equals("exit_" + nodeKey)))
            throw conflict("The journey wait is not currently available.");
        engine.getRuntimeService().setVariables(reference, variables(facts));
        advanceSatisfiedWaits(reference);
        return inspect(reference);
    }
    private void advanceSatisfiedWaits(String reference) {
        // Bounded per call: validated graphs are capped at 200 stages, guards add at most two waits per
        // stage, and this only cascades through WAITs already satisfied at the moment of one complete/
        // signal call — it does not grow with how many times a bounded recovery loop (technical-decisions.md
        // §22) revisits a node over a case's lifetime, since each loop pass calls complete/signal separately.
        for (int guard = 0; guard < 601; guard++) {
            var instance = engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(reference).singleResult();
            if (instance == null) return;
            var model = engine.getRepositoryService().getBpmnModel(instance.getProcessDefinitionId());
            boolean advanced = false;
            for (var execution : engine.getRuntimeService().createExecutionQuery().processInstanceId(reference).list()) {
                if (execution.getActivityId() == null) continue;
                if (model.getFlowElement(execution.getActivityId()) instanceof ReceiveTask wait) {
                    String[] expected = wait.getDocumentation().split("=", -1);
                    Object value = engine.getRuntimeService().getVariable(reference, expected[0]);
                    if (expected.length == 2 && value instanceof Boolean && value.equals(Boolean.valueOf(expected[1]))) {
                        engine.getRuntimeService().trigger(execution.getId());
                        advanced = true;
                        break;
                    }
                }
            }
            if (!advanced) return;
        }
        throw conflict("The journey exceeded its bounded wait progression.");
    }
    private Map<String, Object> variables(Map<String, Boolean> facts) {
        Map<String, Object> result = new HashMap<>();
        if (facts != null) facts.forEach((key, value) -> {
            try { Fact.valueOf(key); } catch (RuntimeException e) { throw conflict("Unsupported journey fact."); }
            if (value == null) throw conflict("Journey facts must be boolean values.");
            result.put(key, value);
        });
        return result;
    }
    private static ApiException missing() { return new ApiException(404, "JOURNEY_RUNTIME_NOT_FOUND", "Runtime instance not found."); }
    private static ApiException conflict(String message) { return new ApiException(409, "JOURNEY_RUNTIME_CONFLICT", message); }
}
