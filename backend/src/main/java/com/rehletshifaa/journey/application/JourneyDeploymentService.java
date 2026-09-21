package com.rehletshifaa.journey.application;

import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.domain.ChannelEntitlement;
import com.rehletshifaa.access.domain.ResourceContext;
import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.journey.domain.JourneyModel.Version;
import com.rehletshifaa.journey.domain.JourneyModel.Status;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.util.UUID;

@Service
public class JourneyDeploymentService {
    public record Readiness(UUID journeyVersionId, String status, String compilerVersion, String artifactHash) {}
    private final JourneyDefinitionRepository definitions;
    private final JourneyDeploymentRepository deployments;
    private final JourneyCompiler compiler;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final AuthorizationService authorization;
    private final AccessAuditRepository audit;

    public JourneyDeploymentService(JourneyDefinitionRepository definitions, JourneyDeploymentRepository deployments,
            JourneyCompiler compiler, ObjectProvider<JourneyRuntimePort> runtimes, AuthorizationService authorization,
            AccessAuditRepository audit) {
        this.definitions=definitions; this.deployments=deployments; this.compiler=compiler;
        this.runtimes=runtimes; this.authorization=authorization; this.audit=audit;
    }
    @Transactional(readOnly = true)
    public Readiness readiness(UUID definition, UUID version) {
        authorize("journey.view"); definitions.version(definition, version);
        return view(version);
    }
    @Transactional
    public Readiness deployPublished(UUID definition, UUID version, JourneyDefinitionService.Change command) {
        authorize("journey.publish"); authorize("journey.approve");
        if (command == null || command.reason() == null || command.reason().isBlank() || command.reason().length()>500)
            throw new ApiException(400,"INVALID_JOURNEY_OPERATION","Provide a bounded deployment reason.");
        definitions.definition(definition, true);
        var model = definitions.version(definition, version);
        if (model.revision()!=command.revision() || model.status()!=Status.PUBLISHED)
            throw new ApiException(409,"JOURNEY_NOT_DEPLOYABLE","Deploy a current published JourneyVersion.");
        deploy(model);
        return view(version);
    }
    /** Called only inside publication's transaction after its independent-review check. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void deployOnPublish(Version version) {
        if (runtimes.getIfAvailable()!=null) deploy(version);
    }
    private void deploy(Version version) {
        var actor = authorize("journey.publish");
        JourneyRuntimePort runtime = runtimes.getIfAvailable();
        if (runtime == null) throw new ApiException(503,"JOURNEY_RUNTIME_DISABLED","Journey runtime is not enabled.");
        var existing=deployments.find(version.id());
        if (existing.isPresent()) {
            if (!existing.get().graphHash().equals(version.graphHash()))
                throw new ApiException(409,"JOURNEY_DEPLOYMENT_IMMUTABLE","Deployed journey content cannot change.");
            return;
        }
        var artifact=compiler.compile(version.id(),version.graph());
        var deployed=runtime.deploy(artifact);
        deployments.insert(version.graphHash(),artifact,deployed,actor.subject());
        audit.record(actor.subject(),version.id().toString(),"JOURNEY_DEPLOYED","SUCCESS","compiler="+artifact.compilerVersion()+"; hash="+artifact.hash());
    }
    private Readiness view(UUID version) {
        return deployments.find(version).map(d -> new Readiness(version,"DEPLOYED",d.compilerVersion(),d.bpmnHash()))
                .orElseGet(() -> new Readiness(version,"NOT_DEPLOYED",null,null));
    }
    private com.rehletshifaa.access.application.AccessIdentity.Identity authorize(String permission) {
        return authorization.require(permission, ResourceContext.platform(), ChannelEntitlement.ADMIN_WEB, ChannelEntitlement.API);
    }
}
