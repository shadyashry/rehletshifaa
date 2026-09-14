package com.rehletshifaa.coordination.application;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;

@Service
public class CoordinatorEligibilityService {
    private final CoordinationRepository repo; private final AuthorizationService auth;
    public CoordinatorEligibilityService(CoordinationRepository repo,AuthorizationService auth){this.repo=repo;this.auth=auth;}
    public List<Candidate> evaluate(CaseFacts c,Policy p,Instant at){List<Team> teams=repo.teams(c.organizationId());List<Candidate> result=new ArrayList<>();for(Capacity capacity:repo.capacities(c.organizationId())){
        List<String> exclusions=new ArrayList<>();List<UUID> memberships=new ArrayList<>();
        for(Team t:teams)if(t.configuration().active()&&(t.configuration().careAreas().isEmpty()||t.configuration().careAreas().contains(c.careArea())))
            if(repo.members(t.id()).stream().anyMatch(m->m.subject().equals(capacity.subject())&&m.active()&&CoordinationConfigurationService.effective(m.effectiveFrom(),m.effectiveTo(),at)))memberships.add(t.id());
        var grant=auth.decide(new AccessIdentity.Identity(capacity.subject(),null),"assignment.receive",new ResourceContext(c.organizationId(),true,"CASE",c.id().toString(),capacity.subject(),false),ChannelEntitlement.API);
        if(!grant.allowed())grant=auth.decide(new AccessIdentity.Identity(capacity.subject(),null),"assignment.receive",new ResourceContext(c.organizationId(),true,"CASE",c.id().toString(),capacity.subject(),false),ChannelEntitlement.ADMIN_WEB);
        if(!grant.allowed())exclusions.add("ACCESS_OR_MEMBERSHIP_DENIED");if(!repo.staffEnabled(capacity.subject()))exclusions.add("STAFF_DISABLED");if(memberships.isEmpty())exclusions.add("NO_ACTIVE_TEAM");
        if(!capacity.careAreas().isEmpty()&&!capacity.careAreas().contains(c.careArea()))exclusions.add("CARE_AREA_MISMATCH");
        boolean language=capacity.languages().stream().anyMatch(l->l.equalsIgnoreCase(c.language()));if(p.configuration().mandatoryLanguage()&&!language)exclusions.add("LANGUAGE_MISMATCH");
        if(p.configuration().requireOnDuty()&&!capacity.onDuty())exclusions.add("OFF_DUTY");long load=repo.workload(capacity.subject(),c.id());
        if(capacity.maximum()<=load)exclusions.add("AT_CAPACITY");
        result.add(new Candidate(capacity.subject(),memberships.stream().sorted().toList(),capacity.maximum(),load,capacity.onDuty(),language,repo.lastAutomatic(capacity.subject()),List.copyOf(exclusions)));
    }return List.copyOf(result);}
}
