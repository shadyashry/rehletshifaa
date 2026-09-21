package com.rehletshifaa.coordination.application;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.rehletshifaa.coordination.application.CoordinationConfigurationService.*;

@Service
public class AssignmentEngine implements CoordinatorRoutingPort {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AssignmentEngine.class);
    private final CoordinationRepository repo; private final CoordinationConfigurationService config;
    private final CoordinatorEligibilityService eligibility; private final CoordinatorScoringService scoring;
    private final AuthorizationService auth; private final AccessAuditRepository audit; private final StaffWorkService work; private final Clock clock;
    public AssignmentEngine(CoordinationRepository repo,CoordinationConfigurationService config,CoordinatorEligibilityService eligibility,CoordinatorScoringService scoring,AuthorizationService auth,AccessAuditRepository audit,StaffWorkService work,Clock clock){this.repo=repo;this.config=config;this.eligibility=eligibility;this.scoring=scoring;this.auth=auth;this.audit=audit;this.work=work;this.clock=clock;}
    public List<Decision> history(UUID org,UUID id){config.authorize(org,"assignment.audit.view");checked(org,id);return repo.history(org,id);}
    public List<QueueItem> queue(UUID org){config.authorize(org,"assignment.queue.manage");return repo.queue(org);}
    @Transactional public Decision execute(UUID org,UUID id,Command command){
        text(command.key(),150);text(command.source(),100);String action=command.action();if(action==null||!Set.of("SHADOW","ACTIVATE","AUTO","ASSIGN","REASSIGN","QUEUE").contains(action))bad("Choose a registered routing command");
        repo.lock();if(!repo.organization(org,true))bad("Provider was not found or is suspended");
        var actor=config.authorize(org,permission(action));repo.lockCase(id);
        if(!repo.bound(id)){if(!action.equals("SHADOW"))bad("Run a shadow comparison before routing adoption");bind(org,id);}
        CaseFacts c=checked(org,id);String payload=repo.encode(command);var replay=repo.replay(id,actor.subject(),command.key(),payload);if(replay.isPresent())return replay.get();
        if(c.revision()!=command.revision())stale();if(Set.of("DRAFT","CLOSED","CANCELLED").contains(c.status()))bad("This case is not accepting coordination work");
        if(!action.equals("SHADOW")&&!action.equals("ACTIVATE")&&!c.mode().equals("LIVE"))bad("Explicit routing adoption is required");
        if(Set.of("ACTIVATE","ASSIGN","REASSIGN","QUEUE").contains(action))text(command.reason(),500);
        Instant now=clock.instant();Policy p=config.effectivePolicy(org,now);Preference preference=config.effectivePreference(org,c.consultantId(),now);
        List<Candidate> candidates=eligibility.evaluate(c,p,now);Selection selection=choose(c,p,preference,candidates);
        if(action.equals("ASSIGN")||action.equals("REASSIGN")){
            if(action.equals("ASSIGN")&&c.owner()!=null)bad("Use reassignment to replace an existing owner");text(command.target(),255);
            Candidate target=candidates.stream().filter(x->x.subject().equals(command.target())&&x.exclusions().isEmpty()).findFirst().orElseThrow(()->new ApiException(403,"INELIGIBLE_COORDINATOR","Target is not eligible within this provider"));
            UUID team=command.team()==null?target.teams().getFirst():command.team();if(!target.teams().contains(team))throw new ApiException(403,"TEAM_SCOPE_DENIED","Target is not an eligible member of this team");
            selection=new Selection(target.subject(),team,"MANUAL_"+action,scoring.score(candidates,p.configuration()));
        }else if(action.equals("QUEUE")){config.validTeam(org,command.team());selection=new Selection(null,command.team(),"MANUAL_QUEUE",scoring.score(candidates,p.configuration()));}
        if(action.equals("ACTIVATE")){
            if(c.mode().equals("LIVE"))bad("Case routing is already adopted");Selection proposed=selection;
            boolean validated=repo.history(org,id).stream().anyMatch(d->d.mode().equals("SHADOW")&&d.revision()==c.revision()&&d.policyId().equals(p.id())&&Objects.equals(d.selectedOwner(),proposed.subject())&&Objects.equals(d.team(),proposed.team())&&d.candidates().equals(candidates));
            if(!validated)throw new ApiException(409,"SHADOW_REVALIDATION_REQUIRED","Run a fresh matching shadow comparison before adoption");
        }
        return persist(c,p,preference,candidates,selection,command,actor.subject(),payload,now,action.equals("SHADOW")?"SHADOW":"LIVE");
    }
    private Decision persist(CaseFacts c,Policy p,Preference preference,List<Candidate> candidates,Selection selection,Command command,String actor,String payload,Instant now,String mode){
        UUID id=UUID.randomUUID();String explanation=explain(selection,c);boolean resolvesQueue=mode.equals("LIVE")&&selection.subject()!=null&&repo.queued(c.id());
        Decision d=new Decision(id,c.id(),mode,p.id(),p.version(),preference==null?null:preference.id(),c.owner(),selection.subject(),selection.team(),selection.path(),explanation,candidates,selection.scores(),command.source(),command.reason(),now,c.revision()+1,Objects.equals(c.owner(),selection.subject()),CoordinatorScoringService.ALGORITHM);
        repo.advance(c,mode.equals("LIVE")?"LIVE":c.mode());
        if(mode.equals("LIVE")){
            repo.owner(c,selection.subject(),Set.of("AUTO","ACTIVATE").contains(command.action())?"ROUTING_ENGINE":actor,explanation,now);
            if(selection.subject()==null){UUID task=work.openWorkItem(new NewWorkItem(c.id(),"COORDINATION_ROUTING","Coordinator assignment needed","Review the authorized coordination queue",null,"COORDINATOR",false,now.plus(Duration.ofHours(p.configuration().queueHours())),actor,"COORDINATION_QUEUED","routing:"+id,false));repo.queue(task,selection.team(),selection.path(),now);
                for(String manager:repo.subjects(c.organizationId()))if(manager(manager,c.organizationId()))work.notifyStaff(manager,c.id(),task,"COORDINATION_QUEUED","Coordinator assignment needs attention","Review the authorized coordination queue","routing:"+id+":"+manager,true);
            }else{work.closeWorkItems(c.id(),"COORDINATION_ROUTING","Coordination queue resolved");if(!Objects.equals(c.owner(),selection.subject()))work.notifyStaff(selection.subject(),c.id(),null,"COORDINATOR_ASSIGNED","Care coordination assigned","Review your authorized work queue","routing:"+id+":"+selection.subject(),true);}
        }
        repo.decision(d,c.organizationId(),actor,command.key(),payload);audit.record(actor,id.toString(),mode.equals("SHADOW")?"ROUTING_SHADOW_COMPARED":selection.subject()==null?"COORDINATION_QUEUED":"COORDINATOR_ASSIGNMENT_DECIDED","SUCCESS","organization="+c.organizationId()+"; policy="+p.id()+"; path="+selection.path()+"; reason="+command.reason());if(resolvesQueue)audit.record(actor,id.toString(),"COORDINATION_QUEUE_RESOLVED","SUCCESS","organization="+c.organizationId()+"; owner="+selection.subject()+"; team="+selection.team());return d;
    }
    private Selection choose(CaseFacts c,Policy p,Preference pref,List<Candidate> candidates){Map<UUID,UUID> fallbacks=new HashMap<>();repo.teams(c.organizationId()).forEach(t->{if(t.configuration().fallbackTeam()!=null)fallbacks.put(t.id(),t.configuration().fallbackTeam());});return scoring.select(c,p,pref,candidates,fallbacks);}
    private boolean manager(String subject,UUID org){for(ChannelEntitlement channel:List.of(ChannelEntitlement.ADMIN_WEB,ChannelEntitlement.API))if(auth.decide(new AccessIdentity.Identity(subject,null),"assignment.queue.manage",context(org),channel).allowed())return true;return false;}
    private void bind(UUID org,UUID id){var provenance=repo.provenance(id);if(provenance.size()!=1||!provenance.getFirst()[0].equals(org))throw new ApiException(403,"CASE_PROVIDER_UNRESOLVED","Case requires a unique stored Consultant/provider relationship");repo.bind(id,org,provenance.getFirst()[1]);}
    private CaseFacts checked(UUID org,UUID id){CaseFacts c=repo.facts(id);if(!c.organizationId().equals(org))throw new ApiException(404,"ROUTING_NOT_FOUND","Routing was not found in this provider");return c;}
    private String permission(String action){return switch(action){case "SHADOW"->"assignment.simulate";case "REASSIGN"->"assignment.reassign";case "QUEUE"->"assignment.queue.manage";case "ACTIVATE"->"assignment.policy.manage";default->"assignment.manual_assign";};}
    private String explain(Selection s,CaseFacts c){return switch(s.path()){case "CONTINUITY"->"Existing eligible care coordinator retained for continuity.";case "PREFERRED_COORDINATOR"->"Consultant's preferred coordinator is eligible and has capacity.";case "NO_ELIGIBLE_COORDINATOR"->"Nobody is eligible. Work is in the coordination queue for manager review.";case "MANUAL_QUEUE"->"Authorized manager moved coordination to the queue.";case "MANUAL_ASSIGN","MANUAL_REASSIGN"->"Authorized manager selected an eligible coordinator with a recorded reason.";default->"Assigned by "+s.path().toLowerCase(Locale.ROOT).replace('_',' ')+" using capacity/language score and deterministic workload, last-assignment and identity tie-breaks; earlier preferences did not yield an eligible coordinator.";};}
    @Override public void guardLegacyWrite(UUID id){repo.lock();repo.lockCase(id);if(repo.bound(id)&&repo.facts(id).mode().equals("LIVE"))throw new ApiException(409,"ROUTING_ADOPTED","Use the authorized coordination assignment API for this case");}
    /** Durable LIVE queue retry. Manual parking remains intentional until an authorized resolution. */
    @Transactional public void retryQueued(UUID id){repo.lock();if(!repo.bound(id))return;CaseFacts initial=repo.facts(id);if(!repo.organization(initial.organizationId(),true))return;repo.lockCase(id);CaseFacts c=repo.facts(id);if(!c.mode().equals("LIVE")||!repo.queuedCases().contains(id)||Set.of("DRAFT","CLOSED","CANCELLED").contains(c.status()))return;Instant now=clock.instant();var policies=repo.policies(c.organizationId()).stream().filter(p->effective(p.effectiveFrom(),p.effectiveTo(),now)).toList();if(policies.isEmpty())return;Policy p=policies.getFirst();Preference pref=config.effectivePreference(c.organizationId(),c.consultantId(),now);List<Candidate> candidates=eligibility.evaluate(c,p,now);Selection selection=choose(c,p,pref,candidates);if(selection.subject()==null)return;Command command=new Command("queue-retry:"+c.revision(),c.revision(),"AUTO",null,null,null,"QUEUE_RETRY");persist(c,p,pref,candidates,selection,command,"SYSTEM",repo.encode(command),now,"LIVE");}
    @Override public void compareLegacy(UUID id,String key){
        // Called inside the locked legacy transaction. Unconfigured or unresolved cases stay legacy.
        if(!repo.bound(id)){var provenance=repo.provenance(id);if(provenance.size()!=1)return;UUID org=provenance.getFirst()[0];if(!repo.organization(org,false)||repo.policies(org).stream().noneMatch(p->effective(p.effectiveFrom(),p.effectiveTo(),clock.instant())))return;repo.bind(id,org,provenance.getFirst()[1]);}
        CaseFacts c=repo.facts(id);if(!c.mode().equals("SHADOW")||!repo.organization(c.organizationId(),false))return;Instant now=clock.instant();var policies=repo.policies(c.organizationId()).stream().filter(p->effective(p.effectiveFrom(),p.effectiveTo(),now)).toList();if(policies.isEmpty())return;Policy p=policies.getFirst();Preference pref=config.effectivePreference(c.organizationId(),c.consultantId(),now);List<Candidate> candidates=eligibility.evaluate(c,p,now);Command command=new Command(key,c.revision(),"SHADOW",null,null,null,"LEGACY_ASSIGNMENT");String payload=repo.encode(command);if(repo.replay(id,"SYSTEM",key,payload).isPresent())return;persist(c,p,pref,candidates,choose(c,p,pref,candidates),command,"SYSTEM",payload,now,"SHADOW");
    }
    /**
     * Journey integration boundary (Phase 4B item B). Reuses {@link #retryQueued} — the existing
     * SYSTEM-triggered, already-idempotent LIVE queue retry — unchanged, then reads whatever owner Phase 3
     * already decided. Never mutates routing state itself and never throws: a case that is not yet
     * provider-bound, not yet adopted into LIVE routing, or any internal Assignment Engine error all
     * safely resolve to no result so Journey projection can fall back to its own unassigned/queued state.
     */
    @Override public Optional<String> routeCoordinatorWork(UUID caseId){
        try {
            retryQueued(caseId);
            return repo.bound(caseId)?Optional.ofNullable(repo.owner(caseId)):Optional.empty();
        } catch(RuntimeException e){
            log.warn("Journey coordinator routing unavailable for case {} ({}); leaving work unassigned",caseId,e.getMessage());
            return Optional.empty();
        }
    }
    @Override public Optional<UUID> resolveOrganization(UUID caseId){
        var provenance=repo.provenance(caseId);
        return provenance.size()==1?Optional.of(provenance.getFirst()[0]):Optional.empty();
    }
}
