package com.rehletshifaa.journey.application;

import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Engine-backed synthetic authoring verification. Never calls production domain/action/notification services. */
@Service
@Transactional
public class JourneyShadowService {
    public record Start(String commandKey, Map<String,Boolean> facts) {}
    public record Step(String commandKey,long revision,String nodeKey,boolean signal,Map<String,Boolean> facts) {}
    public record Activity(String nodeKey,String state,String actorType,String action) {}
    public record View(UUID id,UUID journeyVersionId,long revision,boolean completed,List<Activity> activities) {}
    private final JourneyDefinitionRepository definitions;
    private final JourneyDeploymentRepository deployments;
    private final JourneyShadowRepository runs;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final AuthorizationService authorization;
    private final AccessAuditRepository audit;
    public JourneyShadowService(JourneyDefinitionRepository definitions,JourneyDeploymentRepository deployments,
            JourneyShadowRepository runs,ObjectProvider<JourneyRuntimePort> runtimes,AuthorizationService authorization,AccessAuditRepository audit) {
        this.definitions=definitions;this.deployments=deployments;this.runs=runs;this.runtimes=runtimes;this.authorization=authorization;this.audit=audit;
    }
    public View start(UUID definition,UUID versionId,Start command) {
        var actor=authorize("journey.simulate");
        if(command==null)throw invalid();
        key(command.commandKey());
        // The singleton definition lock serializes start-key retries and publication/retirement.
        definitions.definition(definition,true);
        var version=definitions.version(definition,versionId);
        String hash=JourneyCompiler.hash(runs.json(List.of(versionId,canonical(command.facts()))));
        var replay=runs.replayStart(actor.subject(),command.commandKey());
        if(replay.isPresent()) {
            if(!replay.get().requestHash().equals(hash))throw conflict("Idempotency key was used for a different start.");
            return view(replay.get(),version,runtime().inspect(replay.get().engineReference()),replay.get().revision());
        }
        if(version.status()!=Status.PUBLISHED)throw conflict("Synthetic execution needs a published, deployed JourneyVersion.");
        var deployment=deployments.find(versionId).orElseThrow(()->conflict("JourneyVersion is not deployed."));
        UUID id=UUID.randomUUID();
        var instance=runtime().start(deployment.engine(),"synthetic:"+id,canonical(command.facts()));
        runs.insert(id,versionId,instance.reference(),actor.subject(),command.commandKey(),hash);
        audit.record(actor.subject(),id.toString(),"JOURNEY_SHADOW_STARTED","SUCCESS","version="+versionId);
        return view(runs.lock(id,versionId),version,instance,0);
    }
    public View read(UUID definition,UUID version,UUID id) {
        authorize("journey.view");
        var model=definitions.version(definition,version);
        var run=runs.lock(id,version);
        return view(run,model,runtime().inspect(run.engineReference()),run.revision());
    }
    public View step(UUID definition,UUID versionId,UUID id,Step command) {
        var actor=authorize("journey.simulate");
        if(command==null || command.nodeKey()==null || !command.nodeKey().matches("[A-Za-z][A-Za-z0-9_-]{0,59}"))throw invalid();
        key(command.commandKey());
        var version=definitions.version(definition,versionId);
        var run=runs.lock(id,versionId);
        String hash=JourneyCompiler.hash(runs.json(List.of(command.revision(),command.nodeKey(),command.signal(),canonical(command.facts()))));
        var replay=runs.result(id,actor.subject(),command.commandKey());
        if(replay.isPresent()) {
            if(!replay.get().requestHash().equals(hash))throw conflict("Idempotency key was used for a different action.");
            return runs.read(replay.get().snapshot(),View.class);
        }
        if(run.revision()!=command.revision())throw conflict("Synthetic journey changed; reload it.");
        var state=command.signal()?runtime().signal(run.engineReference(),command.nodeKey(),canonical(command.facts()))
                :runtime().complete(run.engineReference(),command.nodeKey(),canonical(command.facts()));
        var view=view(run,version,state,run.revision()+1);
        runs.completed(run,actor.subject(),command.commandKey(),hash,view);
        audit.record(actor.subject(),id.toString(),"JOURNEY_SHADOW_ADVANCED","SUCCESS","node="+command.nodeKey()+"; revision="+view.revision());
        return view;
    }
    private View view(JourneyShadowRepository.Run run,Version version,JourneyRuntimePort.Instance state,long revision) {
        var nodes=new HashMap<String,Node>();version.graph().nodes().forEach(n->nodes.put(n.key(),n));
        var activities=state.activities().stream().map(a->{
            String key=a.nodeKey().replaceFirst("^(n_|entry_|exit_)","");
            var node=nodes.get(key);
            if(node==null)throw conflict("Runtime activity differs from the immutable graph.");
            String stage=a.nodeKey().startsWith("entry_")?"WAIT_ENTRY":a.nodeKey().startsWith("exit_")?"WAIT_EXIT":node.type().name();
            return new Activity(key,stage,node.actorType(),node.action());
        }).toList();
        return new View(run.id(),run.versionId(),revision,state.completed(),activities);
    }
    private Map<String,Boolean> canonical(Map<String,Boolean> facts) {
        Map<String,Boolean> result=new TreeMap<>();
        if(facts!=null)facts.forEach((k,v)->{try{Fact.valueOf(k);}catch(RuntimeException e){throw invalid();}if(v==null)throw invalid();result.put(k,v);});
        return result;
    }
    private JourneyRuntimePort runtime(){var runtime=runtimes.getIfAvailable();if(runtime==null)throw new ApiException(503,"JOURNEY_RUNTIME_DISABLED","Journey runtime is not enabled.");return runtime;}
    private com.rehletshifaa.access.application.AccessIdentity.Identity authorize(String permission){return authorization.require(permission,ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB,ChannelEntitlement.API);}
    private static void key(String key){if(key==null || !key.matches("[A-Za-z0-9:_-]{1,80}"))throw invalid();}
    private static ApiException invalid(){return new ApiException(400,"INVALID_JOURNEY_SHADOW","Use a bounded command key, node key and registered boolean facts.");}
    private static ApiException conflict(String message){return new ApiException(409,"JOURNEY_SHADOW_CONFLICT",message);}
}
