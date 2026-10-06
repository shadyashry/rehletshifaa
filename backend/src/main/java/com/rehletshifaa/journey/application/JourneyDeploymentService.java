package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.journey.domain.JourneyModel.Version;
import com.rehletshifaa.journey.domain.JourneyModel.Status;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionStore;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentStore;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.util.Optional;
import java.util.UUID;

@Service
public class JourneyDeploymentService {
    public record Readiness(UUID journeyVersionId, String status, String compilerVersion, String artifactHash) {}
    /** Production-admission readiness: {@code READY} carries the version new cases bind to; any other category carries none. */
    public record AdmissionReadiness(String category, Optional<Version> version) {
        public boolean ready() { return version.isPresent(); }
    }
    private final JourneyDefinitionStore definitions;
    private final JourneyDeploymentStore deployments;
    private final JourneyCompiler compiler;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final Authority authorization;
    private final GovernanceAuditLog audit;

    public JourneyDeploymentService(JourneyDefinitionStore definitions, JourneyDeploymentStore deployments,
            JourneyCompiler compiler, ObjectProvider<JourneyRuntimePort> runtimes, Authority authorization,
            GovernanceAuditLog audit) {
        this.definitions=definitions; this.deployments=deployments; this.compiler=compiler;
        this.runtimes=runtimes; this.authorization=authorization; this.audit=audit;
    }
    @Transactional(readOnly = true)
    public Readiness readiness(UUID definition, UUID version) {
        authorize(Permission.JOURNEY_READ); definitions.version(definition, version);
        return view(version);
    }
    @Transactional
    public Readiness deployPublished(UUID definition, UUID version, JourneyDefinitionService.Change command) {
        authorize(Permission.JOURNEY_APPROVE); authorize(Permission.JOURNEY_APPROVE);
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
        var actor = authorize(Permission.JOURNEY_APPROVE);
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
    /**
     * The one runtime-readiness rule for new production admissions (moved here from Phase 7A's intake service so
     * admission and operator status share it): the highest-numbered PUBLISHED version of the single canonical
     * definition whose deployment graph hash still matches. Publication alone is not readiness (§16). No
     * authorization: callers are the system intake hook and the already-authorized cutover status read.
     */
    AdmissionReadiness admissionReadiness() {
        var defs = definitions.definitions();
        if (defs.size() != 1) return new AdmissionReadiness("NO_DEFINITION", Optional.empty());
        boolean published = false, deployed = false;
        for (Version v : definitions.versions(defs.get(0).id())) {
            if (v.status() != Status.PUBLISHED) continue;
            published = true;
            var deployment = deployments.find(v.id());
            if (deployment.isEmpty()) continue;
            deployed = true;
            if (deployment.get().graphHash().equals(v.graphHash())) return new AdmissionReadiness("READY", Optional.of(v));
        }
        return new AdmissionReadiness(!published ? "NOT_PUBLISHED" : !deployed ? "NOT_DEPLOYED" : "GRAPH_MISMATCH", Optional.empty());
    }
    /** Whether an already-pinned version's deployment still matches its immutable graph. */
    String pinnedReadiness(Version version) {
        return deployments.find(version.id()).map(d -> d.graphHash().equals(version.graphHash()) ? "DEPLOYED" : "GRAPH_MISMATCH").orElse("NOT_DEPLOYED");
    }
    private Readiness view(UUID version) {
        return deployments.find(version).map(d -> new Readiness(version,"DEPLOYED",d.compilerVersion(),d.bpmnHash()))
                .orElseGet(() -> new Readiness(version,"NOT_DEPLOYED",null,null));
    }
    private com.rehletshifaa.authority.application.Principal authorize(Permission permission) {
        return authorization.require(permission);
    }
}
