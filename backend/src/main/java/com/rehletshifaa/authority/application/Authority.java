package com.rehletshifaa.authority.application;

import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.authority.domain.RolePolicy;
import com.rehletshifaa.authority.domain.RolePolicy.Grant;
import com.rehletshifaa.authority.domain.Scope;
import com.rehletshifaa.authority.domain.Workspace;
import com.rehletshifaa.authority.infrastructure.EffectiveRoleStore;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
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
    /** MFA-1: a sensitive action re-confirms after this long (owner-agreed 15–30 minutes). */
    private static final Duration STEP_UP = Duration.ofMinutes(20);
    private final EffectiveRoleStore roles;
    private final CaseRelationships cases;
    private final ConversationRelationships conversations;
    private final WorkforceDirectory workforce;
    private final Clock clock;
    private final AuthenticationStrength authenticationStrength;
    private final GovernanceAuditLog audit;

    public Authority(EffectiveRoleStore roles, CaseRelationships cases, ConversationRelationships conversations, WorkforceDirectory workforce, Clock clock,
            AuthenticationStrength authenticationStrength, GovernanceAuditLog audit) {
        this.conversations = conversations;
        this.roles = roles;
        this.cases = cases;
        this.workforce = workforce;
        this.clock = clock;
        this.authenticationStrength = authenticationStrength;
        this.audit = audit;
    }

    /** {@code granted=false} carries the refusal code and the reason; {@code role}/{@code scope} name the grant used. */
    /** Refusals answered by signing in (again), not by different access: 401 rather than 403. */
    private static final Set<String> SIGN_IN_AGAIN = Set.of("REAUTHENTICATION_REQUIRED", "MFA_REQUIRED", "PHISHING_RESISTANT_AUTHENTICATION_REQUIRED");

    public record Decision(boolean granted, Permission permission, Role role, Scope scope, String code, String reason) {}

    /**
     * D1: the sign-in a session needs — {@code acr} "2" (authenticator app), "3" (passkey: privileged roles and the platform
     * owner) or null (no second factor required) — and whether the current token already proves a second factor.
     */
    public record SignInStrength(String acr, boolean satisfied) {}

    public SignInStrength signInStrength(Principal principal, Set<Role> effective, boolean platformOwner) {
        boolean required = platformOwner || effective.stream().anyMatch(Role::secondFactorAtSignIn);
        if (!required) return new SignInStrength(null, true);
        String acr = platformOwner || effective.stream().anyMatch(Role::privileged) ? "3" : "2";
        return new SignInStrength(acr, authenticationStrength.mfa(principal));
    }

    public record Held(Principal principal, Set<Role> roles, Set<Permission> platformPermissions, Set<Workspace> workspaces,
                       List<String> managedFunctions) {}

    /** Authorizes the current request or throws the endpoint's error; returns the principal for the caller. */
    public Principal require(Permission permission, Resource resource) {
        Principal principal = Principal.current();
        Decision decision = decide(principal, permission, resource);
        if (!decision.granted())
            throw new ApiException(SIGN_IN_AGAIN.contains(decision.code()) ? 401 : 403, decision.code(), decision.reason());
        auditSupervisoryRead(principal, permission, resource, decision);
        return principal;
    }

    public Principal require(Permission permission) { return require(permission, Resource.platform()); }

    /**
     * A2b: the request-level guard behind every API call (see {@code SecondFactorGuard}). A staff session — any role that signs
     * in with a second factor — that proved only a password is refused here, before any controller runs, so an endpoint that
     * resolves its caller without a permission check still cannot serve it. Patients and anonymous calls pass through.
     */
    public void requireSecondFactorForStaff() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken)) return;
        Principal principal = Principal.current();
        boolean staff = roles.roles(principal.subject(), clock.instant()).stream().anyMatch(Role::secondFactorAtSignIn);
        if (staff && !authenticationStrength.mfa(principal))
            throw new ApiException(401, "MFA_REQUIRED", "Finish signing in with your second step (authenticator app or passkey)");
    }

    /** As {@link #require} but returns the authorized actor with the granting role and all effective roles. */
    public Actor authorize(Permission permission, Resource resource) {
        Principal principal = Principal.current();
        Decision decision = decide(principal, permission, resource);
        if (!decision.granted())
            throw new ApiException(SIGN_IN_AGAIN.contains(decision.code()) ? 401 : 403, decision.code(), decision.reason());
        auditSupervisoryRead(principal, permission, resource, decision);
        return new Actor(principal.subject(), principal.authenticatedAt(), decision.role(), roles.roles(principal.subject(), clock.instant()));
    }

    public Actor authorize(Permission permission) { return authorize(permission, Resource.platform()); }

    public boolean allowed(Permission permission, Resource resource) {
        return decide(Principal.current(), permission, resource).granted();
    }

    /**
     * QA W-35: listing what a sensitive platform permission decides (pending requests, changes awaiting approval) needs the
     * role and a second-factor session, but not a fresh re-check — the decision itself asks for one.
     */
    public Principal requireToList(Permission permission) {
        Principal principal = Principal.current();
        Decision decision = decide(principal, permission, Resource.platform(), false);
        if (!decision.granted())
            throw new ApiException(SIGN_IN_AGAIN.contains(decision.code()) ? 401 : 403, decision.code(), decision.reason());
        return principal;
    }

    public boolean allowedToList(Permission permission) {
        return decide(Principal.current(), permission, Resource.platform(), false).granted();
    }

    public Decision decide(Principal principal, Permission permission, Resource resource) {
        return decide(principal, permission, resource, true);
    }

    private Decision decide(Principal principal, Permission permission, Resource resource, boolean stepUp) {
        Instant now = clock.instant();
        Set<Role> effective = roles.roles(principal.subject(), now);
        List<Grant> candidates = RolePolicy.grantsFor(permission).stream().filter(g -> effective.contains(g.role())).toList();
        if (candidates.isEmpty())
            return new Decision(false, permission, null, null, "PERMISSION_NOT_HELD",
                    "Your roles do not include this action (" + permission + ")");
        // D1: staff work only in a session signed in with a second factor; a password-only session reaches nothing but /me.
        if (effective.stream().anyMatch(Role::secondFactorAtSignIn) && !authenticationStrength.mfa(principal))
            return new Decision(false, permission, null, null, "MFA_REQUIRED",
                    "Finish signing in with your second step (authenticator app or passkey)");
        Grant matched = candidates.stream().filter(g -> inScope(principal.subject(), g, resource)).findFirst().orElse(null);
        if (matched == null)
            return new Decision(false, permission, null, null, "OUT_OF_SCOPE",
                    "You are not related to this record in a way that allows this action (" + permission + ")");
        if (stepUp && permission.stepUp()) {
            if (!principal.authenticatedWithin(STEP_UP, now))
                return new Decision(false, permission, matched.role(), matched.scope(), "REAUTHENTICATION_REQUIRED",
                        "Sign in again with multi-factor authentication to confirm this sensitive action");
            // D1: a power held through a role that signs in without a second factor (a patient, a representative) confirms
            // with the fresh sign-in alone; any staff power still needs the second factor (deep validation D-12).
            if (matched.role().secondFactorAtSignIn() && !authenticationStrength.recentMfa(principal, STEP_UP, now))
                return new Decision(false, permission, matched.role(), matched.scope(), "REAUTHENTICATION_REQUIRED",
                        "Use multi-factor authentication to confirm this sensitive action");
            if (effective.stream().anyMatch(Role::privileged) && !authenticationStrength.phishingResistant(principal))
                return new Decision(false, permission, matched.role(), matched.scope(), "PHISHING_RESISTANT_AUTHENTICATION_REQUIRED",
                        "Use your passkey to confirm this sensitive action");
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
            case CASE_REPLIER -> isCase(resource) && cases.primaryCoordinator(resource.id())
                    .map(owner -> cases.activeCover(owner).orElse(owner)).filter(subject::equals).isPresent();
            case CASE_COVERING -> isCase(resource) && cases.primaryCoordinator(resource.id())
                    .flatMap(cases::activeCover).filter(subject::equals).isPresent();
            case CONVERSATION_REPLIER -> isConversation(resource) && conversations.conversationOwner(resource.id())
                    .map(owner -> cases.activeCover(owner).orElse(owner)).filter(subject::equals).isPresent();
            case CONVERSATION_UNCLAIMED -> isConversation(resource) && conversations.unclaimedConversation(resource.id());
            case CASE_UNCLAIMED -> isCase(resource) && cases.unclaimedIntake(resource.id());
            case CASE_DEPOSIT_OPEN -> isCase(resource) && cases.depositOpen(resource.id());
            case CASE_MONEY_OPEN -> isCase(resource) && cases.moneyOpen(resource.id());
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

    private static boolean isConversation(Resource resource) {
        return resource.kind() == Resource.Kind.CONVERSATION && resource.id() != null;
    }

    private static boolean isCase(Resource resource) {
        return resource.kind() == Resource.Kind.CASE && resource.id() != null;
    }

    private void auditSupervisoryRead(Principal principal, Permission permission, Resource resource, Decision decision) {
        if (permission == Permission.CASE_READ && decision.scope() == Scope.SUPERVISED && isCase(resource))
            audit.supervisoryRead(principal.subject(), resource.id().toString(), permission.name());
        // A read granted by the open deposit alone (no assignment) reaches any such case on the platform: it leaves evidence too.
        if ((decision.scope() == Scope.CASE_DEPOSIT_OPEN || decision.scope() == Scope.CASE_MONEY_OPEN) && isCase(resource))
            audit.depositRead(principal.subject(), resource.id().toString(), permission.name());
    }
}
