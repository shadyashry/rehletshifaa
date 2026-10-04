package com.rehletshifaa.authority.application;

import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.OwnerPolicy;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.authority.domain.RolePolicy;
import com.rehletshifaa.authority.domain.RolePolicy.Grant;
import com.rehletshifaa.authority.domain.Scope;
import com.rehletshifaa.authority.domain.Workspace;
import com.rehletshifaa.authority.infrastructure.EffectiveRoleStore;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * The one authorization entry point (IAM-06). Every business endpoint asks {@link #require}; {@code /api/v1/me}
 * reports from the same policy and the same database facts, so an explanation is the decision itself (ACG-10).
 * Deny by default; nothing is cached (IAM-08); domain rules (state, versions, maker/checker, self-action) stay in the
 * domain (ACG-09).
 */
@Service
public class Authority {
    private static final Duration STEP_UP = Duration.ofMinutes(10);
    private final EffectiveRoleStore roles;
    private final CaseRelationships cases;
    private final WorkforceDirectory workforce;
    private final Clock clock;
    private final AuthenticationStrength authenticationStrength;
    private final PlatformOwnership ownership;

    public Authority(EffectiveRoleStore roles, CaseRelationships cases, WorkforceDirectory workforce, Clock clock,
            AuthenticationStrength authenticationStrength, PlatformOwnership ownership) {
        this.roles = roles;
        this.cases = cases;
        this.workforce = workforce;
        this.clock = clock;
        this.authenticationStrength = authenticationStrength;
        this.ownership = ownership;
    }

    /** {@code granted=false} carries the refusal code and the reason; {@code role}/{@code scope} name the grant used. */
    public record Decision(boolean granted, Permission permission, Role role, Scope scope, String code, String reason) {}

    public record Held(Principal principal, Set<Role> roles, Set<Permission> platformPermissions, Set<Workspace> workspaces,
                       List<String> managedFunctions) {}

    /** Authorizes the current request or throws the endpoint's error; returns the principal for the caller. */
    public Principal require(Permission permission, Resource resource) {
        Principal principal = Principal.current();
        Decision decision = decide(principal, permission, resource);
        if (!decision.granted())
            throw new ApiException("REAUTHENTICATION_REQUIRED".equals(decision.code()) ? 401 : 403, decision.code(), decision.reason());
        return principal;
    }

    public Principal require(Permission permission) { return require(permission, Resource.platform()); }

    /** As {@link #require} but returns the authorized actor with the granting role and all effective roles. */
    public Actor authorize(Permission permission, Resource resource) {
        Principal principal = Principal.current();
        Decision decision = decide(principal, permission, resource);
        if (!decision.granted())
            throw new ApiException("REAUTHENTICATION_REQUIRED".equals(decision.code()) ? 401 : 403, decision.code(), decision.reason());
        return new Actor(principal.subject(), principal.authenticatedAt(), decision.role(), roles.roles(principal.subject(), clock.instant()));
    }

    public Actor authorize(Permission permission) { return authorize(permission, Resource.platform()); }

    public boolean allowed(Permission permission, Resource resource) {
        return decide(Principal.current(), permission, resource).granted();
    }

    public Decision decide(Principal principal, Permission permission, Resource resource) {
        Instant now = clock.instant();
        Set<Role> effective = roles.roles(principal.subject(), now);
        List<Grant> candidates = RolePolicy.grantsFor(permission).stream().filter(g -> effective.contains(g.role())).toList();
        boolean owner = ownership.isCurrentOwner(principal.subject(), now);
        if (candidates.isEmpty() && owner && OwnerPolicy.grants(permission)) {
            if (permission.stepUp()) {
                if (!authenticationStrength.recentPhishingResistant(principal, STEP_UP, now))
                    return new Decision(false, permission, null, Scope.PLATFORM, "REAUTHENTICATION_REQUIRED",
                            "Use a recent WebAuthn passkey sign-in to confirm this owner governance action");
            }
            return new Decision(true, permission, null, Scope.PLATFORM, "GRANTED", "Granted by current Platform Account Owner relationship");
        }
        if (candidates.isEmpty())
            return new Decision(false, permission, null, null, "PERMISSION_NOT_HELD",
                    "Your roles do not include this action (" + permission + ")");
        Grant matched = candidates.stream().filter(g -> inScope(principal.subject(), g, resource)).findFirst().orElse(null);
        if (matched == null)
            return new Decision(false, permission, null, null, "OUT_OF_SCOPE",
                    "You are not related to this record in a way that allows this action (" + permission + ")");
        if (permission.stepUp()) {
            if (!principal.authenticatedWithin(STEP_UP, now))
                return new Decision(false, permission, matched.role(), matched.scope(), "REAUTHENTICATION_REQUIRED",
                        "Sign in again with multi-factor authentication to confirm this sensitive action");
            if (!authenticationStrength.recentMfa(principal, STEP_UP, now))
                return new Decision(false, permission, matched.role(), matched.scope(), "REAUTHENTICATION_REQUIRED",
                        "Use multi-factor authentication to confirm this sensitive action");
            if (effective.contains(Role.SYSTEM_ADMINISTRATOR) && !authenticationStrength.phishingResistant(principal))
                return new Decision(false, permission, matched.role(), matched.scope(), "REAUTHENTICATION_REQUIRED",
                        "Use a WebAuthn passkey to confirm this administrator action");
        }
        return new Decision(true, permission, matched.role(), matched.scope(), "GRANTED", "Granted by " + matched.role() + " (" + matched.scope() + ")");
    }

    /** Everything the principal holds right now, for {@code /api/v1/me} and workspace routing. */
    public Held held(Principal principal) {
        Instant now = clock.instant();
        Set<Role> effective = roles.roles(principal.subject(), now);
        Set<Permission> platform = EnumSet.noneOf(Permission.class);
        Set<Workspace> workspaces = EnumSet.noneOf(Workspace.class);
        Set<String> managed = new TreeSet<>();
        if (ownership.isCurrentOwner(principal.subject(), now)) {
            platform.addAll(OwnerPolicy.permissions());
            workspaces.add(Workspace.OWNER);
        }
        for (Grant grant : RolePolicy.grants()) {
            if (!effective.contains(grant.role())) continue;
            if (grant.scope() == Scope.PLATFORM) platform.add(grant.permission());
            if (grant.permission() == Permission.TEAM_MANAGE && grant.role().function() != null) managed.add(grant.role().function());
        }
        effective.forEach(role -> workspaces.addAll(RolePolicy.workspaces(role)));
        return new Held(principal, effective, platform, workspaces, List.copyOf(managed));
    }

    /** WF-10: the functions whose teams the principal manages (a TEAM_MANAGE role in that function). */
    public void requireFunctionManager(String function) {
        Principal principal = require(Permission.TEAM_MANAGE);
        if (!held(principal).managedFunctions().contains(function))
            throw new ApiException(403, "FUNCTION_MANAGER_REQUIRED", "Only this function's manager can change its teams");
    }

    private boolean inScope(String subject, Grant grant, Resource resource) {
        Role role = grant.role();
        return switch (grant.scope()) {
            case PLATFORM -> true;
            case SELF -> resource.kind() == Resource.Kind.PLATFORM || subject.equals(resource.subject());
            case CASE_ASSIGNED -> isCase(resource) && role.caseAssignmentRole() != null
                    && cases.assigned(resource.id(), subject, role.caseAssignmentRole(), false);
            case CASE_CONSULTED -> isCase(resource) && cases.consulted(resource.id(), subject);
            case CASE_OFFERED -> isCase(resource) && role.caseAssignmentRole() != null
                    && cases.assigned(resource.id(), subject, role.caseAssignmentRole(), true);
            case CASE_OWNER -> isCase(resource) && cases.primaryCoordinator(resource.id()).filter(subject::equals).isPresent();
            case CASE_UNCLAIMED -> isCase(resource) && cases.unclaimedIntake(resource.id());
            case OWN_PATIENT -> isCase(resource) && cases.ownPatientCase(resource.id(), subject);
            case SUPERVISED -> supervised(subject, role, resource);
            case OWN_CLINIC -> resource.kind() == Resource.Kind.CLINIC && roles.ownsClinic(resource.id(), subject);
            case DELEGATED_CLINIC -> resource.kind() == Resource.Kind.CLINIC && roles.delegated(resource.id(), subject);
        };
    }

    /** WF-07/WF-08/INV-28: the affected person, or a live assignee of the case, is supervised by the principal. */
    private boolean supervised(String subject, Role role, Resource resource) {
        if (role.function() == null) return false;
        Set<String> team = workforce.supervised(subject, role.function());
        if (team.isEmpty()) return false;
        if (resource.subject() != null) return team.contains(resource.subject());
        return isCase(resource) && role.caseAssignmentRole() != null
                && cases.activeAssignees(resource.id(), role.caseAssignmentRole()).stream().anyMatch(team::contains);
    }

    private static boolean isCase(Resource resource) {
        return resource.kind() == Resource.Kind.CASE && resource.id() != null;
    }
}
