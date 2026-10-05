package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.access.platform.infrastructure.AccessHygieneStore;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.authority.domain.Workspace;
import com.rehletshifaa.workforce.application.WorkforceFacts;
import com.rehletshifaa.workforce.application.WorkforceFacts.PersonFacts;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * ACG-10/WF-17: one authenticated response with the principal's effective roles, platform permissions, workspaces
 * and workforce facts — all from the same {@link Authority} the endpoints enforce, so routing and decisions agree.
 */
@Service
public class EffectiveAccessService {
    private final Authority authority;
    private final WorkforceFacts workforce;
    private final PlatformAccessRepository access;
    private final PlatformOwnerTransferStore owners;
    private final AccessHygieneStore hygiene;
    private final Clock clock;
    private final JdbcClient jdbc;

    public EffectiveAccessService(Authority authority, WorkforceFacts workforce, PlatformAccessRepository access,
            PlatformOwnerTransferStore owners, AccessHygieneStore hygiene, Clock clock, JdbcClient jdbc) {
        this.authority = authority;
        this.workforce = workforce;
        this.access = access;
        this.owners = owners;
        this.hygiene = hygiene;
        this.clock = clock;
        this.jdbc = jdbc;
    }

    public record PlatformRoleView(String role, Instant effectiveFrom, Instant effectiveTo, boolean effectiveNow) {}
    public record MeView(String subject, Instant evaluatedAt, Set<Role> roles, Set<Permission> permissions, Set<Permission> reauthenticate, Set<Workspace> workspaces,
                         List<String> managedFunctions, boolean platformAccountOwner, List<PlatformRoleView> platformRoles,
                         PersonFacts workforce, List<String> pendingActions) {}

    @Transactional
    public MeView me() {
        Principal principal = Principal.current();
        Instant now = clock.instant();
        // IAM-16: the session-start call records the latest interactive sign-in for dormancy.
        if (principal.authenticatedAt() != null && principal.authenticatedAt().isAfter(Instant.EPOCH)
                && !principal.authenticatedAt().isAfter(now.plusSeconds(60)))
            hygiene.recordSignIn(principal.subject(), principal.authenticatedAt());
        var held = authority.held(principal);
        PersonFacts person = workforce.forSubject(principal.subject(), now).orElse(null);
        List<PlatformRoleView> platformRoles = access.subjectFacts(principal.subject(), now).administratorAssignments().stream()
                .map(a -> new PlatformRoleView(PlatformAccessRepository.SYSTEM_ADMINISTRATOR, a.effectiveFrom(), a.effectiveTo(),
                        !a.effectiveFrom().isAfter(now))).toList();
        boolean owner = owners.findCurrentOwner().filter(principal.subject()::equals).isPresent();
        // GOV-02: the owner decides administrator changes in the Control Center even without any workforce role.
        Set<Workspace> workspaces = java.util.EnumSet.noneOf(Workspace.class);
        workspaces.addAll(held.workspaces());
        // The named incoming owner of a live transfer reaches the ownership page to accept or decline it.
        boolean incomingOwner = owners.pendingFor(principal.subject(), now).filter(t -> "PENDING_ACCEPTANCE".equals(t.status())).isPresent();
        if (owner || incomingOwner) workspaces.add(Workspace.CONTROL_CENTER);
        List<String> pending = new ArrayList<>();
        if (incomingOwner) pending.add("ACCEPT_PLATFORM_OWNERSHIP");
        boolean pendingAdoption = jdbc.sql("SELECT COUNT(*) FROM workforce_identity_reviews r JOIN workforce_invitations i ON i.id=r.invitation_id "
                        + "WHERE r.resolved_subject=? AND r.status='AWAITING_ACCEPTANCE' AND i.status='AWAITING_ACCEPTANCE' AND i.expires_at>?")
                .params(principal.subject(), com.rehletshifaa.shared.persistence.SqlValues.timestamp(now)).query(Long.class).single() > 0;
        if (pendingAdoption) pending.add("ACCEPT_WORKFORCE_ADOPTION");
        if (person != null && "INVITED".equals(person.lifecycleStatus())) pending.add("ACTIVATE_ACCOUNT");
        return new MeView(principal.subject(), now, held.roles(), held.platformPermissions(),
                held.platformPermissions().stream().filter(Permission::stepUp).collect(java.util.stream.Collectors.toCollection(java.util.TreeSet::new)), workspaces, held.managedFunctions(),
                owner, platformRoles, person, List.copyOf(pending));
    }
}
