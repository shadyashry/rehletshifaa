package com.rehletshifaa.journey.application;

import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.domain.ChannelEntitlement;
import com.rehletshifaa.access.domain.ResourceContext;
import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.journey.api.WorkDtos.ItemResponse;
import com.rehletshifaa.journey.domain.JourneyModel.Node;
import com.rehletshifaa.journey.domain.JourneyModel.StageType;
import com.rehletshifaa.journey.domain.JourneyModel.Version;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository.Binding;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyStageProjectionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyStageProjectionRepository.Projection;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Projects Journey runtime human stages (STAFF_TASK / PATIENT_ACTION) into the existing WorkItem
 * ({@link StaffWorkService}) and PatientAction ({@link PatientActionService}) model — no second task
 * subsystem. Opening and completing a stage's business side effect is dispatched by the node's registered
 * action key ({@link JourneyActionDispatcher}), never hardcoded here or inside a Flowable delegate.
 *
 * <p>{@link #sync} (projecting newly active stages) stays on the same admin/platform-governance
 * verification-harness boundary as {@link JourneyCaseVerificationService} — the runtime reaching a node is
 * a system event, not a human business action. {@link #completeWorkItem} (a human completing projected
 * staff work) instead enforces the real Journey-state AND Access Governance intersection: the projection
 * must be open for that exact node, and the caller must hold {@code journey.work.execute} for the case's
 * resolved resource (its provider organization when one exists, the platform verification scope otherwise —
 * see {@link CoordinatorRoutingPort#resolveOrganization}). {@link #completePatientAction} remains the
 * verification-harness overload for existing parity fixtures. Real patient completion intersects the
 * active projection with either the authenticated canonical patient subject or an existing OTP-verified,
 * case/patient-bound secure grant, using the PatientAction id rather than runtime identifiers.
 *
 * <p>Runtime advancement, domain persistence and the durable projection record share one local
 * transaction (same application transaction manager Flowable already participates in — see
 * technical-decisions.md §17): a failed domain call never reaches the engine, and an engine failure rolls
 * back a domain call that already ran, so a business task can never be left falsely completed nor a
 * Journey silently advanced.
 */
@Service
@Transactional
public class JourneyProjectionService {
    private final JourneyCaseBindingRepository bindings;
    private final JourneyDefinitionRepository definitions;
    private final JourneyStageProjectionRepository projections;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final JourneyActionDispatcher dispatcher;
    private final CoordinatorRoutingPort routing;
    private final AuthorizationService authorization;
    private final PatientJourneyAuthorizationService patientAuthorization;
    private final AccessAuditRepository audit;
    private final JourneyLiveShadowService liveShadow;
    private final boolean enabled;

    public JourneyProjectionService(JourneyCaseBindingRepository bindings, JourneyDefinitionRepository definitions,
            JourneyStageProjectionRepository projections, ObjectProvider<JourneyRuntimePort> runtimes,
            JourneyActionDispatcher dispatcher, CoordinatorRoutingPort routing, AuthorizationService authorization,
            PatientJourneyAuthorizationService patientAuthorization, AccessAuditRepository audit, JourneyLiveShadowService liveShadow,
            @Value("${app.journey.runtime.case-verification-enabled:false}") boolean verificationEnabled,
            @Value("${app.journey.runtime.production-intake-enabled:false}") boolean productionIntakeEnabled) {
        this.bindings = bindings; this.definitions = definitions; this.projections = projections; this.runtimes = runtimes;
        this.dispatcher = dispatcher; this.routing = routing; this.authorization = authorization;
        this.patientAuthorization = patientAuthorization;
        this.audit = audit; this.liveShadow = liveShadow;
        // Two independent callers now reach syncInternal: the journey.simulate verification harness and the
        // real production intake hook (JourneyProductionIntakeService, Phase 7A). Either flag is sufficient to
        // let the shared projection machinery run; neither caller grants the other any extra authority — this
        // only gates whether a JourneyRuntimePort call is attempted at all, the same fail-closed 503 either way.
        this.enabled = verificationEnabled || productionIntakeEnabled;
    }

    /**
     * Opens exactly one WorkItem/PatientAction for every currently active human-stage node that does not
     * already have one. Safe to call repeatedly (replay, a duplicate runtime signal, or after every
     * advancement): a node already projected — by this call or a concurrent one serialized behind the same
     * case-binding lock — is skipped. A node whose action has no registered handler fails the whole call
     * closed: nothing is opened and the caller sees a clear diagnostic instead of a silently stuck Journey.
     */
    public List<Projection> sync(UUID caseId) {
        String subject = authorize();
        var binding = bindings.lock(caseId, subject);
        return syncInternal(caseId, binding, subject);
    }

    /**
     * Records a boolean business fact the runtime is currently WAITing on (e.g. {@code CONSULTANT_ACCEPTED})
     * and advances past any WAIT node it now satisfies, then projects whatever human stage is reached next.
     * This is the correct way to unblock a Journey WAIT for an event that happens outside a registered
     * action (the legacy "Consultant accepts the assignment" step is not itself one of the 11 registered
     * actions) — it never silently auto-advances a WAIT on its own; a fact only becomes true when the real
     * event it represents has actually happened. Same admin/platform-governance boundary as {@link #sync}:
     * recording an external fact is a system event, not a human business action.
     */
    public List<Projection> signal(UUID caseId, String nodeKey, Map<String, Boolean> facts) {
        String subject = authorize();
        var binding = bindings.lock(caseId, subject);
        if (binding.engineReference() == null) throw conflict("Journey case has not started.");
        runtime().signal(binding.engineReference(), nodeKey, facts);
        return syncInternal(caseId, binding, subject);
    }

    /**
     * Completes a projected staff WorkItem's registered action, advances the pinned runtime exactly once,
     * then projects whatever stage is reached next. Order: (1) the projection must exist and be a staff
     * stage — Journey-state; (2) the caller must hold real, resource-scoped Access Governance authorization
     * for this case's business work; (3) an already-completed projection is a safe no-op, checked only once
     * the caller is known to be authorized. Only then is the registered handler invoked and the runtime
     * advanced. A handler failure or a missing handler is never reached after the runtime advances, and a
     * runtime failure rolls back whatever the handler already did, in the one shared local transaction.
     */
    public List<Projection> completeWorkItem(UUID caseId, String nodeKey, Map<String, Boolean> facts) {
        return completeWorkItem(caseId, nodeKey, Map.of(), null, facts);
    }

    /** As {@link #completeWorkItem(UUID, String, Map)}, with completion parameters for handlers that need caller input (e.g. {@code ASSIGN_CONSULTANT}'s target consultant, {@code RELEASE_PROPOSAL}'s version id). */
    public List<Projection> completeWorkItem(UUID caseId, String nodeKey, Map<String, String> parameters, Map<String, Boolean> facts) {
        return completeWorkItem(caseId, nodeKey, parameters, null, facts);
    }

    /** As {@link #completeWorkItem(UUID, String, Map, Map)}, with a structured request payload for handlers whose mapped service takes one (e.g. {@code RECORD_CLINICAL_DECISION}'s {@code ReviewDecisionRequest}, {@code PREPARE_PROPOSAL}'s {@code ProposalDraftRequest}). */
    public List<Projection> completeWorkItem(UUID caseId, String nodeKey, Map<String, String> parameters, Object payload, Map<String, Boolean> facts) {
        var binding = bindings.lockByCase(caseId);
        if (binding.engineReference() == null) throw conflict("Journey case has not started.");
        var projection = projections.lockLatest(caseId, nodeKey).orElseThrow(JourneyProjectionService::notFound);
        if (!Set.of("STAFF_TASK", "NOTIFICATION").contains(projection.stageType())) throw conflict("This Journey stage is not staff work.");
        String subject = authorizeWork(caseId);
        if ("COMPLETED".equals(projection.status())) return projections.forCase(caseId); // duplicate completion: no-op
        var version = definitions.version(binding.versionId());
        var node = node(version, nodeKey);
        dispatcher.complete(node.action(), new JourneyActionHandler.CompleteContext(caseId, binding.versionId(), node, subject, projection.caseTaskId(), null, null, parameters == null ? Map.of() : parameters, payload));
        runtime().complete(binding.engineReference(), nodeKey, facts);
        projections.complete(projection.id());
        audit.record(subject, caseId.toString(), "JOURNEY_WORK_ITEM_COMPLETED", "SUCCESS", "node=" + nodeKey + "; action=" + node.action());
        return syncInternal(caseId, binding, "SYSTEM");
    }

    /** Completes a projected PatientAction, advances the pinned runtime exactly once, then re-syncs. */
    public List<Projection> completePatientAction(UUID caseId, String nodeKey, List<ItemResponse> responses, String note, Map<String, Boolean> facts) {
        String subject = authorize();
        var binding = bindings.lock(caseId, subject);
        var projection = projections.lockLatest(caseId, nodeKey).orElseThrow(JourneyProjectionService::notFound);
        if (!"PATIENT_ACTION".equals(projection.stageType())) throw conflict("This Journey stage is not a patient action.");
        if ("COMPLETED".equals(projection.status())) return projections.forCase(caseId); // duplicate completion: no-op
        var version = definitions.version(binding.versionId());
        var node = node(version, nodeKey);
        dispatcher.complete(node.action(), new JourneyActionHandler.CompleteContext(caseId, binding.versionId(), node, subject, projection.caseTaskId(), responses, note, Map.of(), null));
        runtime().complete(binding.engineReference(), nodeKey, facts);
        projections.complete(projection.id());
        audit.record(subject, caseId.toString(), "JOURNEY_PATIENT_ACTION_COMPLETED", "SUCCESS", "node=" + nodeKey + "; action=" + node.action());
        return syncInternal(caseId, binding, "SYSTEM");
    }

    /** Authenticated patient business surface: case + PatientAction id, never a runtime node/task id. */
    public void completeAuthenticatedPatientAction(UUID caseId, UUID patientActionId, Object payload, Map<String, Boolean> facts) {
        var authorized = patientAuthorization.authenticated(caseId, patientActionId);
        completeAuthorizedPatientAction(authorized, patientActionId, payload, facts);
    }

    /** OTP-verified proposal surface, bound by the existing secure grant to one patient/case/version. */
    public void completeSecureProposalAction(String token, String grant, UUID patientActionId, Object payload, Map<String, Boolean> facts) {
        var authorized = patientAuthorization.secureProposal(token, grant, patientActionId);
        completeAuthorizedPatientAction(authorized, patientActionId, payload, facts);
    }

    /** OTP-verified onboarding surface, bound by the existing secure grant to one patient/case. */
    public void completeSecureProfileAction(String token, String grant, UUID patientActionId, Object payload, Map<String, Boolean> facts) {
        var authorized = patientAuthorization.secureOnboarding(token, grant, patientActionId);
        completeAuthorizedPatientAction(authorized, patientActionId, payload, facts);
    }

    /** OTP-verified information-response surface, bound to one case/patient and PatientAction. */
    public void completeSecureInformationAction(String token, String grant, UUID patientActionId, Object payload, Map<String, Boolean> facts) {
        var authorized = patientAuthorization.secureInformation(token, grant, patientActionId);
        completeAuthorizedPatientAction(authorized, patientActionId, payload, facts);
    }

    private void completeAuthorizedPatientAction(PatientJourneyAuthorizationService.Authorization authorized,
            UUID patientActionId, Object payload, Map<String, Boolean> facts) {
        UUID caseId = authorized.caseId();
        var binding = bindings.lockByCase(caseId);
        if (binding.engineReference() == null) throw conflict("Journey case has not started.");
        var projection = projections.lockByTask(caseId, patientActionId).orElseThrow(JourneyProjectionService::notFound);
        if (!"PATIENT_ACTION".equals(projection.stageType())) throw notFound();
        if ("COMPLETED".equals(projection.status())) return;
        var version = definitions.version(binding.versionId());
        var node = node(version, projection.nodeKey());
        dispatcher.complete(node.action(), new JourneyActionHandler.CompleteContext(caseId, binding.versionId(), node,
                authorized.subject(), projection.caseTaskId(), null, null, Map.of(), payload));
        runtime().complete(binding.engineReference(), projection.nodeKey(), facts == null ? Map.of() : facts);
        projections.complete(projection.id());
        audit.record(authorized.subject(), caseId.toString(), "JOURNEY_PATIENT_ACTION_COMPLETED", "SUCCESS",
                "node=" + projection.nodeKey() + "; action=" + node.action());
        syncInternal(caseId, binding, "SYSTEM");
    }

    public List<Projection> read(UUID caseId) {
        String subject = authorize();
        bindings.lock(caseId, subject); // scoped to the creating subject, matching every other verification-harness read
        return projections.forCase(caseId);
    }

    /**
     * Package-private: projects the newly started runtime's active human stages for a real production
     * admission ({@link JourneyProductionIntakeService}), where there is no human caller to hold
     * {@code journey.simulate} yet — the runtime reaching its first node is a system event, exactly like
     * every other {@code syncInternal} call site above. Deliberately not {@code public}: it must never be
     * reachable from a controller or an ordinary client, only from this package's own system-triggered code.
     */
    List<Projection> syncAsSystem(UUID caseId) {
        var binding = bindings.lockByCase(caseId);
        return syncInternal(caseId, binding, "SYSTEM");
    }

    private List<Projection> syncInternal(UUID caseId, Binding binding, String subject) {
        if (binding.engineReference() == null) throw conflict("Journey case has not started.");
        var instance = runtime().inspect(binding.engineReference());
        var version = definitions.version(binding.versionId());
        for (var activity : instance.activities()) {
            if (activity.taskReference() == null || !activity.nodeKey().startsWith("n_")) continue;
            String nodeKey = activity.nodeKey().substring(2);
            // Idempotency keys off the exact runtime task instance, not the node alone: a bounded recovery
            // loop (technical-decisions.md §22) can legitimately reach this same node again after its first
            // visit already completed, and that later visit is a genuinely new task with a fresh reference.
            if (projections.findByTaskReference(activity.taskReference()).isPresent()) continue;
            project(caseId, binding.versionId(), node(version, nodeKey), subject, activity.taskReference());
        }
        return projections.forCase(caseId);
    }

    private void project(UUID caseId, UUID versionId, Node node, String subject, String engineTaskReference) {
        UUID caseTaskId = dispatcher.open(node.action(), new JourneyActionHandler.OpenContext(caseId, versionId, node, subject));
        UUID projectionId = projections.insert(caseId, versionId, node.key(), node.actorType(), node.type().name(), caseTaskId, engineTaskReference);
        audit.record(subject, caseId.toString(), node.type() == StageType.STAFF_TASK ? "JOURNEY_WORK_ITEM_OPENED" : "JOURNEY_PATIENT_ACTION_OPENED",
                "SUCCESS", "node=" + node.key() + "; action=" + node.action());
        liveShadow.compare(caseId, projectionId, versionId, caseTaskId, node);
    }

    private static Node node(Version version, String nodeKey) {
        return version.graph().nodes().stream().filter(n -> n.key().equals(nodeKey)).findFirst()
                .orElseThrow(() -> conflict("Journey node is not defined in the pinned version."));
    }

    private String authorize() {
        return authorization.require("journey.simulate", ResourceContext.platform(), ChannelEntitlement.ADMIN_WEB, ChannelEntitlement.API).subject();
    }

    /** Real Journey+Access Governance intersection for business completion: resolves the case's actual resource scope. */
    private String authorizeWork(UUID caseId) {
        ResourceContext resource = routing.resolveOrganization(caseId)
                .map(org -> new ResourceContext(org, true, "MedicalCase", caseId.toString(), null, false))
                .orElseGet(ResourceContext::platform);
        return authorization.require("journey.work.execute", resource, ChannelEntitlement.ADMIN_WEB, ChannelEntitlement.API).subject();
    }

    private JourneyRuntimePort runtime() {
        var runtime = runtimes.getIfAvailable();
        if (!enabled || runtime == null) throw new ApiException(503, "JOURNEY_CASE_VERIFICATION_DISABLED", "Journey case verification is not enabled.");
        return runtime;
    }
    private static ApiException notFound() { return new ApiException(404, "JOURNEY_STAGE_NOT_FOUND", "No projected Journey stage for this case/node."); }
    private static ApiException conflict(String message) { return new ApiException(409, "JOURNEY_STAGE_CONFLICT", message); }
}
