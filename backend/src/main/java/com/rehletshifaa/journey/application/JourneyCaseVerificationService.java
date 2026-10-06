package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.domain.JourneyModel.Status;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingStore;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionStore;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentStore;
import com.rehletshifaa.shared.api.ApiException;
import jakarta.validation.Validator;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.UUID;

/**
 * Opt-in application entry point for business parity fixtures. No HTTP route or automatic intake hook.
 * Uses real case/patient/intake services, so callers must use synthetic contacts in an isolated environment.
 * Creation is the only admission operation: it cannot adopt an existing draft or active case.
 * Business action execution remains unavailable until domain projection and authorization are integrated.
 */
@Service
@Transactional
public class JourneyCaseVerificationService {
    public record Create(String commandKey, CreateCaseRequest intake) {}
    public record View(UUID caseId, UUID journeyVersionId, String state) {}

    private final JourneyDefinitionStore definitions;
    private final JourneyDeploymentStore deployments;
    private final JourneyCaseBindingStore bindings;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final CaseService cases;
    private final Authority authorization;
    private final GovernanceAuditLog audit;
    private final ObjectMapper mapper;
    private final Validator validator;
    private final boolean enabled;

    public JourneyCaseVerificationService(JourneyDefinitionStore definitions, JourneyDeploymentStore deployments,
            JourneyCaseBindingStore bindings, ObjectProvider<JourneyRuntimePort> runtimes, CaseService cases,
            Authority authorization, GovernanceAuditLog audit, ObjectMapper mapper, Validator validator,
            @Value("${app.journey.runtime.case-verification-enabled:false}") boolean enabled) {
        this.definitions=definitions; this.deployments=deployments; this.bindings=bindings; this.runtimes=runtimes;
        this.cases=cases; this.authorization=authorization; this.audit=audit; this.mapper=mapper; this.validator=validator; this.enabled=enabled;
    }

    public View create(UUID definitionId, UUID versionId, Create command) {
        String subject=authorize(Permission.JOURNEY_EDIT);
        runtime();
        if(command==null || command.commandKey()==null || !command.commandKey().matches("[A-Za-z0-9:_-]{1,80}")
                || command.intake()==null || !validator.validate(command.intake()).isEmpty()
                || !Boolean.TRUE.equals(command.intake().consent()))
            throw new ApiException(400,"INVALID_JOURNEY_CASE","Provide a bounded command key and valid consenting intake.");
        // Same definition lock as publish/retire and synthetic admission. Protects duplicate starts
        // before any case exists; the unique actor/key constraint is the durable backstop.
        definitions.definition(definitionId,true);
        var version=definitions.version(definitionId,versionId);
        String hash=hash(versionId,command.intake());
        var replay=bindings.replay(subject,command.commandKey());
        if(replay.isPresent()) {
            if(!replay.get().requestHash().equals(hash)) throw conflict("Idempotency key was used for a different case admission.");
            return view(bindings.lock(replay.get().caseId(),subject));
        }
        if(version.status()!=Status.PUBLISHED) throw conflict("A new case requires a published, deployed JourneyVersion.");
        var deployment=deployments.find(versionId).orElseThrow(()->conflict("JourneyVersion is not deployed."));
        if(!deployment.graphHash().equals(version.graphHash())) throw conflict("Journey deployment differs from the immutable version.");
        UUID caseId=cases.create(command.intake()).caseId();
        bindings.insert(caseId,versionId,"VERIFICATION",subject,command.commandKey(),hash);
        audit.record(subject,caseId.toString(),"JOURNEY_CASE_BOUND","SUCCESS","version="+versionId+"; mode=VERIFICATION");
        return new View(caseId,versionId,"BOUND");
    }

    /** Submits intake and starts the pinned deployment together, or rolls both back. */
    public View start(UUID caseId) {
        String subject=authorize(Permission.JOURNEY_EDIT);
        var runtime=runtime();
        var binding=bindings.lock(caseId,subject);
        if(binding.engineReference()!=null) return view(binding);
        // Retirement prevents new admissions, not execution of a case already pinned to that version.
        var deployment=deployments.find(binding.versionId()).orElseThrow(()->conflict("Pinned Journey deployment is missing."));
        cases.submit(caseId);
        var instance=runtime.start(deployment.engine(),"case:"+caseId,Map.of());
        bindings.started(caseId,instance.reference());
        audit.record(subject,caseId.toString(),"JOURNEY_CASE_STARTED","SUCCESS","version="+binding.versionId());
        return new View(caseId,binding.versionId(),instance.completed()?"COMPLETED":"RUNNING");
    }

    public View read(UUID caseId) {
        String subject=authorize(Permission.JOURNEY_READ);
        runtime();
        return view(bindings.lock(caseId,subject));
    }

    private View view(JourneyCaseBindingStore.Binding binding) {
        String state=binding.engineReference()==null?"BOUND":runtime().inspect(binding.engineReference()).completed()?"COMPLETED":"RUNNING";
        return new View(binding.caseId(),binding.versionId(),state);
    }

    private String authorize(Permission permission) {
        return authorization.require(permission).subject();
    }
    private JourneyRuntimePort runtime() {
        var runtime=runtimes.getIfAvailable();
        if(!enabled || runtime==null) throw new ApiException(503,"JOURNEY_CASE_VERIFICATION_DISABLED","Journey case verification is not enabled.");
        return runtime;
    }
    private String hash(UUID versionId, CreateCaseRequest intake) {
        try { return JourneyCompiler.hash(mapper.writeValueAsString(java.util.List.of(versionId,intake))); }
        catch(com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException("Cannot encode case admission",e); }
    }
    private static ApiException conflict(String message) { return new ApiException(409,"JOURNEY_CASE_CONFLICT",message); }
}
