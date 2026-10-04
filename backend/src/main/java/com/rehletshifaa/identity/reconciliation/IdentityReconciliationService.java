package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class IdentityReconciliationService {
    private final IdentityProvisioningPort identities;
    private final IdentityReconciliationStore store;
    private final Authority authority;
    private final Clock clock;

    public IdentityReconciliationService(IdentityProvisioningPort identities, IdentityReconciliationStore store,
            Authority authority, Clock clock) {
        this.identities=identities;this.store=store;this.authority = authority;this.clock=clock;
    }

    public IdentityReconciliationStore.Run reconcile(Command command) {
        var actor = authority.require(Permission.IDENTITY_OPERATIONS_MANAGE);
        if(command==null||command.reason()==null||command.reason().isBlank())throw new ApiException(400,"REASON_REQUIRED","A reason is required");
        String reason=command.reason().trim();if(reason.length()>500)throw new ApiException(400,"REASON_TOO_LONG","The reason is too long");
        return run(command.postRestore()?"POST_RESTORE":"MANUAL",actor.subject(),reason);
    }

    @Scheduled(cron="${app.identity-reconciliation.cron:0 20 2 * * *}")
    public void scheduled() { run("SCHEDULED","SYSTEM","Daily database-to-identity reconciliation"); }

    public List<IdentityReconciliationStore.Run> runs(){authority.require(Permission.IDENTITY_OPERATIONS_READ);return store.runs();}
    public List<IdentityReconciliationStore.Discrepancy> discrepancies(UUID run){authority.require(Permission.IDENTITY_OPERATIONS_READ);return store.discrepancies(run);}

    private IdentityReconciliationStore.Run run(String trigger,String actor,String reason){
        var started=clock.instant();UUID id=store.start(trigger,actor,reason,started);
        List<IdentityReconciliationStore.Observation> observations=new ArrayList<>();
        for(var person:store.people()){
            var state=identities.identityState(person.subject());
            if(!state.available())return store.fail(id,observations.size(),clock.instant());
            observations.add(new IdentityReconciliationStore.Observation(person,state));
        }
        return store.apply(id,observations,clock.instant());
    }

    public record Command(boolean postRestore,String reason) {}
}
