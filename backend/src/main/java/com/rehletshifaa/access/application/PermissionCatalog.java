package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.*;

/** Engineering registry is the executable contract; the database is its queryable projection. */
@Component
public class PermissionCatalog {
    private final Map<String, PermissionDefinition> definitions = new LinkedHashMap<>();
    public PermissionCatalog() {
        register("provider.view", "View provider", "provider", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("provider.create", "Create provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.update", "Update provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.activate", "Activate provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.suspend", "Suspend provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.member.invite", "Invite member provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.member.deactivate", "Deactivate member provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.clinician.invite", "Invite clinician provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.practice_staff.manage", "Manage practice staff provider", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("provider.relationship.manage", "Manage provider relationships", "provider", PermissionRisk.HIGH, Set.of(), Set.of(), true, false, false);
        register("credential.submit", "Submit credential", "credential", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("credential.view", "View credential", "credential", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("credential.review", "Review credential", "credential", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("credential.request_information", "Request information credential", "credential", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("credential.verify", "Verify credential", "credential", PermissionRisk.CRITICAL, Set.of("credential.view", "credential.review"), Set.of(), false, false, false);
        register("credential.reject", "Reject credential", "credential", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("credential.suspend", "Suspend credential", "credential", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("availability.view", "View availability", "availability", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("availability.manage", "Manage availability", "availability", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("availability.manage_self", "Manage self availability", "availability", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("appointment.view", "View appointment", "appointment", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("appointment.schedule", "Schedule appointment", "appointment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("appointment.reschedule", "Reschedule appointment", "appointment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("appointment.cancel", "Cancel appointment", "appointment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("service_catalog.view", "View service catalog", "service_catalog", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("service_catalog.manage", "Manage service catalog", "service_catalog", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("price_list.view", "View price list", "price_list", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("price_list.manage", "Manage price list", "price_list", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("price_list.publish", "Publish price list", "price_list", PermissionRisk.CRITICAL, Set.of(), Set.of(), false, false, false);
        register("clinical.case.view", "View case clinical", "clinical", PermissionRisk.LOW, Set.of(), Set.of(), false, true, false);
        register("clinical.document.view", "View document clinical", "clinical", PermissionRisk.LOW, Set.of(), Set.of(), false, true, false);
        register("clinical.recommendation.draft", "Draft recommendation clinical", "clinical", PermissionRisk.HIGH, Set.of(), Set.of(), false, true, false);
        register("clinical.recommendation.submit", "Submit recommendation clinical", "clinical", PermissionRisk.HIGH, Set.of("clinical.case.view", "clinical.document.view", "clinical.recommendation.draft"), Set.of(), false, true, false);
        register("clinical.outcome.record", "Record outcome clinical", "clinical", PermissionRisk.HIGH, Set.of(), Set.of(), false, true, false);
        register("clinical.export", "Export clinical", "clinical", PermissionRisk.CRITICAL, Set.of(), Set.of("support.account.view", "support.invitation.resend"), false, true, false);
        register("finance.deposit.view", "View deposit finance", "finance", PermissionRisk.LOW, Set.of(), Set.of(), false, true, false);
        register("finance.deposit.confirm", "Confirm deposit finance", "finance", PermissionRisk.HIGH, Set.of(), Set.of(), false, true, false);
        register("finance.deposit.waive", "Waive deposit finance", "finance", PermissionRisk.HIGH, Set.of(), Set.of(), false, true, false);
        register("finance.deposit.refund", "Refund deposit finance", "finance", PermissionRisk.CRITICAL, Set.of(), Set.of(), false, true, false);
        register("finance.reconcile", "Reconcile finance", "finance", PermissionRisk.HIGH, Set.of(), Set.of(), false, true, false);
        register("journey.view", "View journey", "journey", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("journey.create", "Create journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("journey.edit_draft", "Edit draft journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("journey.validate", "Validate journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("journey.simulate", "Simulate journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("journey.submit", "Submit journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("journey.approve", "Approve journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("journey.publish", "Publish journey", "journey", PermissionRisk.CRITICAL, Set.of("journey.view", "journey.approve"), Set.of(), false, false, false);
        register("journey.retire", "Retire journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("journey.instance_migrate", "Instance migrate journey", "journey", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("assignment.team.view", "View team assignment", "assignment", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("assignment.team.manage", "Manage team assignment", "assignment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("assignment.policy.view", "View policy assignment", "assignment", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("assignment.policy.manage", "Manage policy assignment", "assignment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("assignment.simulate", "Simulate assignment", "assignment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("assignment.manual_assign", "Manual assign assignment", "assignment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("assignment.reassign", "Reassign assignment", "assignment", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
        register("assignment.audit.view", "View audit assignment", "assignment", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("access.role.view", "View roles and capabilities", "access", PermissionRisk.LOW, Set.of(), Set.of(), true, false, false);
        register("access.role.create", "Create role templates", "access", PermissionRisk.HIGH, Set.of("access.role.view"), Set.of(), true, false, true);
        register("access.role.edit_draft", "Configure draft roles", "access", PermissionRisk.HIGH, Set.of("access.role.view"), Set.of(), true, false, true);
        register("access.role.simulate", "Simulate access", "access", PermissionRisk.HIGH, Set.of("access.role.view"), Set.of(), true, false, true);
        register("access.role.publish", "Publish role versions", "access", PermissionRisk.CRITICAL, Set.of("access.role.view"), Set.of(), true, false, true);
        register("access.role.retire", "Retire role versions", "access", PermissionRisk.HIGH, Set.of("access.role.view"), Set.of(), true, false, true);
        register("access.assignment.manage", "Grant and revoke access", "access", PermissionRisk.CRITICAL, Set.of("access.role.view"), Set.of(), true, false, true);
        register("access.relationship.manage", "Manage delegated relationships", "access", PermissionRisk.HIGH, Set.of("access.role.view"), Set.of(), true, false, true);
        register("access.effective_access.view", "Review effective access", "access", PermissionRisk.LOW, Set.of("access.role.view"), Set.of(), true, false, false);
        register("access.audit.view", "Review access history", "access", PermissionRisk.LOW, Set.of("access.role.view"), Set.of(), true, false, false);
        register("audit.view", "View audit", "audit", PermissionRisk.LOW, Set.of(), Set.of(), false, false, false);
        register("support.account.view", "View account support", "support", PermissionRisk.LOW, Set.of(), Set.of("clinical.export"), false, false, false);
        register("support.invitation.resend", "Resend invitation support", "support", PermissionRisk.HIGH, Set.of(), Set.of("clinical.export"), false, false, false);
        register("integration.invoke", "Invoke integration", "integration", PermissionRisk.HIGH, Set.of(), Set.of(), false, false, false);
    }
    private void register(String key, String label, String family, PermissionRisk risk, Set<String> dependencies,
            Set<String> conflicts, boolean executable, boolean workflow, boolean recent) {
        Set<ActorType> actors = family.equals("access") || key.equals("provider.create") || key.equals("provider.suspend") ? Set.of(ActorType.GOVERNANCE)
                : key.equals("provider.relationship.manage") ? Set.of(ActorType.GOVERNANCE,ActorType.PRACTICE_OPERATIONS,ActorType.CONSULTANT)
                : family.equals("provider") && !key.equals("provider.view") ? Set.of(ActorType.GOVERNANCE,ActorType.PRACTICE_OPERATIONS)
                : key.equals("clinical.recommendation.submit") || key.equals("clinical.outcome.record")
                ? Set.of(ActorType.CONSULTANT) : family.equals("integration") ? Set.of(ActorType.SERVICE)
                : EnumSet.complementOf(EnumSet.of(ActorType.SERVICE, ActorType.PATIENT, ActorType.REPRESENTATIVE));
        Set<ScopeType> scopes = family.equals("access") ? Set.of(ScopeType.PLATFORM)
                : key.equals("provider.create") ? Set.of(ScopeType.PLATFORM,ScopeType.ORGANIZATION,ScopeType.ASSIGNED_ORGANIZATIONS)
                : EnumSet.complementOf(EnumSet.of(ScopeType.PLATFORM));
        boolean phase2AExecutable = Set.of("provider.view","provider.create","provider.update","provider.suspend",
                "provider.member.invite","provider.member.deactivate","provider.clinician.invite",
                "provider.practice_staff.manage","provider.relationship.manage").contains(key);
        definitions.put(key, new PermissionDefinition(key, label, label + " within the approved data scope.",
                family, risk, scopes, actors, family.equals("access") ? Set.of(ChannelEntitlement.ADMIN_WEB, ChannelEntitlement.API)
                : EnumSet.allOf(ChannelEntitlement.class), family.equals("clinical") ? "CLINICAL" :
                family.equals("finance") ? "FINANCIAL" : "BUSINESS", dependencies, conflicts, true, executable || phase2AExecutable, workflow, recent));
    }
    public List<PermissionDefinition> all() { return List.copyOf(definitions.values()); }
    public Optional<PermissionDefinition> find(String key) { return Optional.ofNullable(definitions.get(key)); }
    public PermissionDefinition require(String key) {
        return find(key).orElseThrow(() -> new ApiException(400, "UNKNOWN_PERMISSION", "Select a registered capability"));
    }
    public Validation validate(List<RolePermissionGrant> grants, ActorType actor, ChannelEntitlement channel) {
        List<String> errors = new ArrayList<>(), warnings = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        Set<RolePermissionGrant> unique = new HashSet<>();
        for (RolePermissionGrant grant : grants) {
            var permission = require(grant.permission());
            keys.add(permission.key());
            if (!unique.add(grant)) errors.add("DUPLICATE_GRANT:" + permission.key());
            if (!permission.active() || !permission.scopes().contains(grant.scope())) errors.add("INVALID_SCOPE:" + permission.key());
            if (!permission.actors().contains(actor)) errors.add("ACTOR_NOT_SUPPORTED:" + permission.key());
            if (!permission.channels().contains(channel)) errors.add("CHANNEL_NOT_SUPPORTED:" + permission.key());
            if (grant.scope() == ScopeType.MANAGED_CLINICIANS && grant.relationship() != RelationshipType.MANAGES)
                errors.add("MANAGES_RELATIONSHIP_REQUIRED:" + permission.key());
            if (!permission.executable()) warnings.add("FUTURE_CAPABILITY:" + permission.key());
        }
        for (RolePermissionGrant grant : grants) {
            var permission = require(grant.permission());
            for (String dependency : permission.dependencies())
                if (grants.stream().noneMatch(g -> g.permission().equals(dependency) && g.scope() == grant.scope()
                        && g.relationship() == grant.relationship())) errors.add("DEPENDENCY_REQUIRED:" + dependency);
            for (String conflict : permission.conflicts())
                if (keys.contains(conflict)) errors.add("PROHIBITED_COMBINATION:" + permission.key() + ":" + conflict);
        }
        if (keys.contains("journey.edit_draft") && keys.contains("journey.publish"))
            errors.add("MAKER_CHECKER_SEPARATION_REQUIRED");
        return new Validation(errors.isEmpty(), List.copyOf(errors), List.copyOf(warnings));
    }
    public record Validation(boolean valid, List<String> errors, List<String> warnings) {}
}
