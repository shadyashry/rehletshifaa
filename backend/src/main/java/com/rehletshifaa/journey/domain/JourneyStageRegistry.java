package com.rehletshifaa.journey.domain;

import org.springframework.stereotype.Component;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

/** Engineering-owned catalog. Source contracts are documentation, never reflective handler names. */
@Component
public class JourneyStageRegistry {
    /**
     * {@code dependsOn}: actions whose result this one needs (a prepared proposal before release, a request before the
     * patient answers). The validator warns when they are not done earlier on every path (QA-06). It is a warning, not an
     * error, because ordinary case actions stay available for journey-bound cases, so the work may be done outside the
     * journey; the handler still fails closed at runtime when it was not.
     */
    public record Capability(String key, String label, Set<ActorType> actors, StageType stage,
                             String sourceContract, List<String> permissionReferences, List<String> dependsOn) {}
    private final Map<String,Capability> entries=new LinkedHashMap<>();
    public JourneyStageRegistry() {
        add("ASSIGN_CONSULTANT","Assign Consultant",ActorType.COORDINATOR,StageType.STAFF_TASK,"CaseActionService / JourneyService.assign",List.of());
        add("REQUEST_INFORMATION","Request patient information",ActorType.COORDINATOR,StageType.STAFF_TASK,"PatientActionService.request",List.of());
        add("RECORD_CLINICAL_DECISION","Consultant clinical review",ActorType.CONSULTANT,StageType.STAFF_TASK,"CaseActionService",List.of("ASSIGN_CONSULTANT"),"clinical.recommendation.submit");
        add("PREPARE_PROPOSAL","Prepare proposal",ActorType.COORDINATOR,StageType.STAFF_TASK,"CaseActionService",List.of("RECORD_CLINICAL_DECISION"));
        add("RELEASE_PROPOSAL","Release proposal",ActorType.COORDINATOR,StageType.STAFF_TASK,"CaseActionService",List.of("PREPARE_PROPOSAL"));
        add("APPROVE_COMMERCIAL_TERMS","Approve commercial terms",ActorType.FINANCE,StageType.STAFF_TASK,"CaseActionService",List.of("PREPARE_PROPOSAL"));
        add("UPDATE_TRAVEL_PLAN","Arrange travel",ActorType.OPERATIONS,StageType.STAFF_TASK,"CaseActionService",List.of("PREPARE_PROPOSAL"));
        add("PROVIDE_INFORMATION","Provide information",ActorType.PATIENT,StageType.PATIENT_ACTION,"PatientActionService.completeByPatient",List.of("REQUEST_INFORMATION"));
        add("REVIEW_PROPOSAL","Patient proposal decision",ActorType.PATIENT,StageType.PATIENT_ACTION,"CaseActionService",List.of("RELEASE_PROPOSAL"));
        add("COMPLETE_PROFILE","Complete profile",ActorType.PATIENT,StageType.PATIENT_ACTION,"CaseActionService",List.of());
        add("RESEND_PROPOSAL_LINK","Resend proposal notice",ActorType.COORDINATOR,StageType.NOTIFICATION,"CaseActionService",List.of("RELEASE_PROPOSAL"));
    }
    private void add(String key,String label,ActorType actor,StageType stage,String source,List<String> dependsOn,String... permissions) {
        entries.put(key,new Capability(key,label,Set.of(actor),stage,source,List.of(permissions),dependsOn));
    }
    public List<Capability> all(){return List.copyOf(entries.values());}
    public Optional<Capability> find(String key){return Optional.ofNullable(entries.get(key));}
}
