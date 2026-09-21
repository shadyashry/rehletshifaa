package com.rehletshifaa.journey.application;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Internal engine boundary. Its opaque references must never be accepted from business API clients. */
public interface JourneyRuntimePort {
    record Artifact(UUID versionId, String processKey, String compilerVersion, String bpmn, String hash) {}
    record Deployment(String deploymentReference, String definitionReference) {}
    record Activity(String nodeKey, String executionReference, String taskReference) {}
    record Instance(String reference, boolean completed, List<Activity> activities) {}

    Deployment deploy(Artifact artifact);
    Instance start(Deployment deployment, String businessKey, Map<String, Boolean> facts);
    Instance inspect(String instanceReference);
    Instance complete(String instanceReference, String nodeKey, Map<String, Boolean> facts);
    Instance signal(String instanceReference, String nodeKey, Map<String, Boolean> facts);
}
