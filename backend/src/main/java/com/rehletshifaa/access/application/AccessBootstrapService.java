package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.UUID;

/** Deployment-only, one-shot bootstrap. No realm role inference and no restart resurrection after revocation. */
@Service
public class AccessBootstrapService {
    private final RoleAssignmentRepository repository;
    private final AccessAuditRepository audit;
    private final Clock clock;
    public AccessBootstrapService(RoleAssignmentRepository repository,AccessAuditRepository audit,Clock clock) {
        this.repository=repository;this.audit=audit;this.clock=clock;
    }
    @Transactional
    public void initialize(String subject) {
        RoleTemplateService.text(subject,255);
        if(repository.bootstrapCompleted()) return;
        repository.lockSubject(subject);
        repository.membership(subject,ResourceContext.PLATFORM,"ACTIVE","DEPLOYMENT","Initial governance owner",clock.instant());
        var grant=new RoleAssignment(UUID.randomUUID(),subject,UUID.fromString("31000001-0000-0000-0000-000000000001"),
                ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"ACTIVE","BOOTSTRAP","DEPLOYMENT","Initial governance owner",0);
        repository.insert(grant);repository.completeBootstrap(subject,clock.instant());
        audit.record("DEPLOYMENT",grant.id().toString(),"GOVERNANCE_BOOTSTRAPPED","SUCCESS","Explicit deployment subject; platform governance only");
    }
}
