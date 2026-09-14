package com.rehletshifaa.journey.domain;

import org.springframework.stereotype.Component;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

/** Engineering-owned catalog. Source contracts are documentation, never reflective handler names. */
@Component
public class JourneyStageRegistry {
    public record Capability(String key, String label, Set<ActorType> actors, StageType stage,
                             String sourceContract, List<String> permissionReferences) {}
    private final Map<String,Capability> entries=new LinkedHashMap<>();
    public JourneyStageRegistry() {
        add("ASSIGN_CONSULTANT","Assign Consultant",ActorType.COORDINATOR,StageType.STAFF_TASK,"CaseActionService / JourneyService.assign");
        add("REQUEST_INFORMATION","Request patient information",ActorType.COORDINATOR,StageType.STAFF_TASK,"PatientActionService.request");
        add("RECORD_CLINICAL_DECISION","Consultant clinical review",ActorType.CONSULTANT,StageType.STAFF_TASK,"CaseActionService", "clinical.recommendation.submit");
        add("PREPARE_PROPOSAL","Prepare proposal",ActorType.COORDINATOR,StageType.STAFF_TASK,"CaseActionService");
        add("RELEASE_PROPOSAL","Release proposal",ActorType.COORDINATOR,StageType.STAFF_TASK,"CaseActionService");
        add("APPROVE_COMMERCIAL_TERMS","Approve commercial terms",ActorType.FINANCE,StageType.STAFF_TASK,"CaseActionService");
        add("UPDATE_TRAVEL_PLAN","Arrange travel",ActorType.OPERATIONS,StageType.STAFF_TASK,"CaseActionService");
        add("PROVIDE_INFORMATION","Provide information",ActorType.PATIENT,StageType.PATIENT_ACTION,"PatientActionService.completeByPatient");
        add("REVIEW_PROPOSAL","Patient proposal decision",ActorType.PATIENT,StageType.PATIENT_ACTION,"CaseActionService");
        add("COMPLETE_PROFILE","Complete profile",ActorType.PATIENT,StageType.PATIENT_ACTION,"CaseActionService");
        add("RESEND_PROPOSAL_LINK","Resend proposal notice",ActorType.COORDINATOR,StageType.NOTIFICATION,"CaseActionService");
    }
    private void add(String key,String label,ActorType actor,StageType stage,String source,String... permissions) {
        entries.put(key,new Capability(key,label,Set.of(actor),stage,source,List.of(permissions)));
    }
    public List<Capability> all(){return List.copyOf(entries.values());}
    public Optional<Capability> find(String key){return Optional.ofNullable(entries.get(key));}
}
