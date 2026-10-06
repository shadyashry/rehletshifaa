package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PlatformGovernanceBootstrap;
import com.rehletshifaa.access.platform.domain.PlatformOwnerPointer;
import com.rehletshifaa.access.platform.domain.PlatformOwnerRelationship;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.workforce.domain.AccessSubject;
import com.rehletshifaa.workforce.infrastructure.AccessSubjectRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Repository
public class PlatformGovernanceBootstrapStore {
    private final PlatformAccessRepository access;
    private final GovernanceAuditLog audit;
    private final PlatformGovernanceBootstrapRepository bootstrap;
    private final PlatformOwnerRelationshipRepository relationships;
    private final PlatformOwnerPointerRepository ownerPointer;
    private final AccessSubjectRepository accessSubjects;
    private final WorkforcePersonRepository people;

    public PlatformGovernanceBootstrapStore(PlatformAccessRepository access, GovernanceAuditLog audit, PlatformGovernanceBootstrapRepository bootstrap,
                                            PlatformOwnerRelationshipRepository relationships, PlatformOwnerPointerRepository ownerPointer,
                                            AccessSubjectRepository accessSubjects, WorkforcePersonRepository people) {
        this.access = access; this.audit = audit; this.bootstrap = bootstrap; this.relationships = relationships;
        this.ownerPointer = ownerPointer; this.accessSubjects = accessSubjects; this.people = people;
    }

    public Optional<Result> completed() {
        return bootstrap.findById(PlatformGovernanceBootstrap.ID).filter(b -> b.getCompletedAt() != null)
                .map(b -> new Result(false, b.getOwnerSubject(), b.getAdministrators(), b.getCompletedAt()));
    }

    @Transactional
    public Result initialize(String owner, List<String> administrators, Instant now) {
        access.lockGovernance();
        PlatformGovernanceBootstrap current = bootstrap.lockById(PlatformGovernanceBootstrap.ID).orElseThrow();
        if (current.getCompletedAt() != null) {
            if (current.getOwnerSubject().equals(owner) && current.getAdministrators().equals(administrators))
                return new Result(false, current.getOwnerSubject(), administrators, current.getCompletedAt());
            throw new ApiException(409, "GOVERNANCE_ALREADY_BOOTSTRAPPED", "Platform governance was already bootstrapped with different subjects");
        }
        for (String administrator : administrators)
            if (!activeWorkforcePerson(administrator))
                throw new ApiException(409, "INITIAL_ADMINISTRATOR_NOT_ELIGIBLE", "Each initial administrator must be an active workforce person");
        accessSubjects.ensureExists(owner, true);
        PlatformOwnerRelationship relationship = relationships.saveAndFlush(
                new PlatformOwnerRelationship(owner, now, "DEPLOYMENT", "Controlled initial governance handover"));
        ownerPointer.saveAndFlush(new PlatformOwnerPointer(relationship.getId()));
        for (String administrator : administrators) {
            people.synchroniseMfa(administrator, true, true, micros(now));
            access.insertAssignment(administrator, now, null, "DEPLOYMENT", "Controlled initial governance handover", now);
        }
        // The JPQL updates above cleared the persistence context, so complete a freshly loaded row.
        PlatformGovernanceBootstrap record = bootstrap.findById(PlatformGovernanceBootstrap.ID).orElseThrow();
        if (record.getCompletedAt() == null) {
            record.complete(owner, administrators, now);
            bootstrap.saveAndFlush(record);
        }
        audit.record("DEPLOYMENT", "platform", "PLATFORM_GOVERNANCE_BOOTSTRAPPED", "SUCCESS",
                "owner=" + owner + "; initial administrators=" + administrators.size() + "; credential evidence verified");
        return new Result(true, owner, administrators, now);
    }

    private boolean activeWorkforcePerson(String subject) {
        return people.findById(subject).filter(p -> "ACTIVE".equals(p.getLifecycleStatus())).isPresent()
                && accessSubjects.findById(subject).map(AccessSubject::isActive).orElse(false);
    }

    public record Result(boolean created, String owner, List<String> administrators, Instant completedAt) {}
}
