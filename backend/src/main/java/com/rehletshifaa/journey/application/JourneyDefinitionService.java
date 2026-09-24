package com.rehletshifaa.journey.application;

import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.journey.domain.*;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

@Service
public class JourneyDefinitionService {
    private final JourneyDefinitionRepository repository;private final AuthorizationService authorization;
    private final AccessAuditRepository audit;private final JourneyGraphValidator validator;private final JourneySimulator simulator;private final JourneyStageRegistry registry;
    private final JourneyDeploymentService deployment;
    public JourneyDefinitionService(JourneyDefinitionRepository repository,AuthorizationService authorization,AccessAuditRepository audit,JourneyGraphValidator validator,JourneySimulator simulator,JourneyStageRegistry registry,JourneyDeploymentService deployment){this.repository=repository;this.authorization=authorization;this.audit=audit;this.validator=validator;this.simulator=simulator;this.registry=registry;this.deployment=deployment;}
    public List<HistoryEntry> history(UUID definition,int offset){authorize("journey.view");repository.definition(definition,false);if(offset<0)invalid("Offset must be nonnegative.");return repository.history(definition,offset);}
    public List<Definition> list(){authorize("journey.view");return repository.definitions();}
    /**
     * Read-only list summary (UX-8): what is published, what is being changed and when anything last happened, in one
     * bounded read instead of one detail call per journey. Stored facts only; no graph, hash or runtime detail.
     */
    public List<Summary> summaries(){authorize("journey.view");return repository.definitions().stream().map(d->{
        List<Version> versions=repository.versions(d.id());
        Version live=versions.stream().filter(v->v.status()==Status.PUBLISHED).findFirst().orElse(null);
        Version draft=versions.stream().filter(v->v.status()!=Status.PUBLISHED&&v.status()!=Status.RETIRED).findFirst().orElse(null);
        return new Summary(d.id(),d.key(),d.name(),d.createdAt(),live==null?null:live.number(),live==null?null:live.publishedAt(),
            (int)versions.stream().filter(v->v.status()==Status.PUBLISHED).count(),draft==null?null:draft.number(),draft==null?null:draft.status().name(),
            versions.size(),repository.lastActivity(d.id()));}).toList();}
    public Detail detail(UUID definition){authorize("journey.view");return new Detail(repository.definition(definition,false),repository.versions(definition));}
    public Version version(UUID definition,UUID version){authorize("journey.view");return repository.version(definition,version);}
    public RegistryMetadata registryMetadata(){authorize("journey.view");return new RegistryMetadata(List.of(ActorType.values()),List.of(StageType.values()),List.of(Fact.values()),200,400,"ACYCLIC_ONLY","NOT_DEPLOYED");}
    public List<JourneyStageRegistry.Capability> registry(){authorize("journey.view");return registry.all();}
    @Transactional public Detail create(){var actor=authorize("journey.create");UUID id=repository.create();audit.record(actor.subject(),id.toString(),"JOURNEY_CREATED","SUCCESS","Canonical platform journey");Version initial=repository.draft(id,new Graph(List.of(),List.of()),actor.subject());audit.record(actor.subject(),initial.id().toString(),"JOURNEY_VERSION_CREATED","SUCCESS","Initial draft");return new Detail(repository.definition(id,false),repository.versions(id));}
    @Transactional public Version cloneVersion(UUID definition,UUID source,Change change){
        var actor=authorize("journey.create");Version v=locked(definition,source,change);if(v.status()!=Status.PUBLISHED && v.status()!=Status.RETIRED)invalid("Clone a published or retired version; reuse the current draft otherwise.");
        Version draft=repository.draft(definition,v.graph(),actor.subject());audit.record(actor.subject(),draft.id().toString(),"JOURNEY_VERSION_CREATED","SUCCESS","source="+source,why(change));return draft;
    }
    @Transactional public Version edit(UUID definition,UUID id,Edit edit){
        var actor=authorize("journey.edit_draft");Version v=locked(definition,id,new Change(edit.revision(),edit.reason()));editable(v);
        if(edit.graph()==null)invalid("Supply the journey graph.");
        var result=validator.validate(edit.graph());
        if(result.errors().stream().anyMatch(i->Set.of("GRAPH_SIZE","NODE_KEY","EDGE_KEY").contains(i.code())))invalid("Use bounded stages and transitions with unique stable keys.");
        if(edit.graph().edges().stream().anyMatch(e->e.from()==null || e.to()==null || e.from().length()>60 || e.to().length()>60))invalid("Each transition needs source and target stage keys.");
        if(repository.json(edit.graph()).length()>250000)invalid("Journey configuration is too large.");
        repository.save(v,edit.graph(),actor.subject());audit.record(actor.subject(),id.toString(),"JOURNEY_DRAFT_UPDATED","SUCCESS","revision="+(v.revision()+1),edit.reason().trim());return repository.version(definition,id);
    }
    @Transactional public ValidationResult validate(UUID definition,UUID id,Change change){
        var actor=authorize("journey.validate");Version v=locked(definition,id,change);editable(v);Validation result=validator.validate(v.graph());
        repository.transition(v,result.valid()?Status.VALIDATED:Status.DRAFT,repository.json(result),null);
        audit.record(actor.subject(),id.toString(),"JOURNEY_VALIDATED",result.valid()?"SUCCESS":"BLOCKED","errors="+result.errors().size(),why(change));return new ValidationResult(repository.version(definition,id),result);
    }
    @Transactional public SimulationResult simulate(UUID definition,UUID id,Simulate command){
        var actor=authorize("journey.simulate");Version v=locked(definition,id,new Change(command.revision(),command.reason()));editable(v);
        Simulation result=simulator.simulate(v.graph(),command.facts());
        repository.transition(v,"COMPLETED".equals(result.outcome())?Status.SIMULATED:result.validation().valid()?Status.VALIDATED:Status.DRAFT,repository.json(result.validation()),result.outcome());
        audit.record(actor.subject(),id.toString(),"JOURNEY_SIMULATED","SUCCESS","outcome="+result.outcome()+"; steps="+result.steps().size(),command.reason().trim());return new SimulationResult(repository.version(definition,id),result);
    }
    @Transactional public Version submit(UUID definition,UUID id,Change change){
        var actor=authorize("journey.submit");Version v=locked(definition,id,change);if(v.status()!=Status.SIMULATED)invalid("Complete a valid simulation before submitting for approval.");
        repository.transition(v,Status.PENDING_APPROVAL,v.validationSummary(),v.simulationSummary());audit.record(actor.subject(),id.toString(),"JOURNEY_SUBMITTED","SUCCESS","revision="+v.revision(),why(change));return repository.version(definition,id);
    }
    @Transactional public Version returnToDraft(UUID definition,UUID id,Change change){
        var actor=authorize("journey.edit_draft");Version v=locked(definition,id,change);if(v.status()!=Status.PENDING_APPROVAL)invalid("Only a pending approval can be returned to draft.");
        repository.transition(v,Status.DRAFT,null,null);audit.record(actor.subject(),id.toString(),"JOURNEY_RETURNED","SUCCESS","revision="+v.revision(),why(change));return repository.version(definition,id);
    }
    @Transactional public Version publish(UUID definition,UUID id,Change change){
        var actor=authorize("journey.publish");authorize("journey.approve");Version v=locked(definition,id,change);
        if(v.status()!=Status.PENDING_APPROVAL || !validator.validate(v.graph()).valid() || !"COMPLETED".equals(v.simulationSummary())) {
            audit.denied(actor.subject(),id.toString(),"journey.publish","VALIDATION_AND_SIMULATION_REQUIRED");invalid("Submit a validated, successfully simulated version before publication.");
        }
        if(repository.edited(id,actor.subject())){audit.denied(actor.subject(),id.toString(),"journey.publish","INDEPENDENT_REVIEW_REQUIRED");throw new ApiException(403,"INDEPENDENT_REVIEW_REQUIRED","Another authorized reviewer must publish this journey.");}
        deployment.deployOnPublish(v);
        repository.transition(v,Status.PUBLISHED,v.validationSummary(),v.simulationSummary());
        Version published=repository.version(definition,id);
        audit.record(actor.subject(),id.toString(),"JOURNEY_PUBLISHED","SUCCESS","graph="+v.graphHash()+"; runtime="+published.runtimeDeployment(),why(change));return published;
    }
    @Transactional public Version retire(UUID definition,UUID id,Change change){
        var actor=authorize("journey.retire");Version v=locked(definition,id,change);if(v.status()!=Status.PUBLISHED)invalid("Only a published journey version can be retired.");repository.transition(v,Status.RETIRED,v.validationSummary(),v.simulationSummary());audit.record(actor.subject(),id.toString(),"JOURNEY_RETIRED","SUCCESS","graph="+v.graphHash(),why(change));return repository.version(definition,id);
    }
    private com.rehletshifaa.access.application.AccessIdentity.Identity authorize(String permission){return authorization.require(permission,com.rehletshifaa.access.domain.ResourceContext.platform(),com.rehletshifaa.access.domain.ChannelEntitlement.ADMIN_WEB,com.rehletshifaa.access.domain.ChannelEntitlement.API);}
    private Version locked(UUID definition,UUID id,Change change){
        if(change==null || change.reason()==null || change.reason().isBlank() || change.reason().length()>500)invalid("Provide a governance reason of at most 500 characters.");
        repository.definition(definition,true);Version v=repository.version(definition,id);if(v.revision()!=change.revision())throw new ApiException(409,"STALE_JOURNEY","This journey changed. Reload before saving.");return v;
    }
    /** J-1: the reason the person gave, stored with the audit event of the action it justified (validated by {@link #locked}). */
    private static String why(Change change){return change.reason().trim();}
    private void editable(Version v){if(!Set.of(Status.DRAFT,Status.VALIDATED,Status.SIMULATED).contains(v.status()))invalid("Use a new draft for a published version, or return pending approval to draft.");}
    private static void invalid(String message){throw new ApiException(400,"INVALID_JOURNEY_OPERATION",message);}
    public record RegistryMetadata(List<ActorType> actorTypes,List<StageType> stageTypes,List<Fact> conditionFacts,int maxNodes,int maxEdges,String cyclePolicy,String runtimeDeployment) {}
    /** {@code reason} is the technical detail the system recorded; {@code changeReason} is what the person said (J-1), null when none was recorded. */
    public record HistoryEntry(String actor,String entity,String action,String outcome,String reason,String changeReason,java.time.Instant occurredAt) {}
    public record Change(long revision,String reason) {}
    public record Edit(long revision,String reason,Graph graph) {}
    public record Simulate(long revision,String reason,Map<String,Boolean> facts) {}
    public record Detail(Definition definition,List<Version> versions) {}
    public record Summary(UUID id,String key,String name,java.time.Instant createdAt,Integer liveVersion,java.time.Instant livePublishedAt,int publishedVersions,
                          Integer draftVersion,String draftStatus,int versions,java.time.Instant lastActivityAt) {}
    public record ValidationResult(Version version,Validation result) {}
    public record SimulationResult(Version version,Simulation result) {}
}
