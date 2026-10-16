package com.rehletshifaa.retention.application;

import com.rehletshifaa.retention.domain.RecordClass;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static com.rehletshifaa.retention.domain.RecordClass.*;

/**
 * P1-7 (review E-03): the record class of every table the platform keeps. A test compares it with the live schema, both ways, so a
 * new table cannot ship unclassified and a dropped one cannot linger here. A DRAFT case and the rows hanging off it (its submission
 * contact, files and intake grant) are {@link RecordClass#DRAFT_INTAKE} whatever their table's class: the class follows the record's
 * state, the table gives the default.
 *
 * <p>Classification rules: anything that proves what was agreed, paid, decided or done to a case (consent, proposals and decisions,
 * deposits and payments, the evidence ledger, statements, reconciliation, incidents, exits, status history) or that audits staff
 * power (governance, access reviews, the audit log, the purge log) is {@link RecordClass#LEGAL_RECORD} and is never purged.
 */
public final class RecordCatalogue {
    private static final Map<String, RecordClass> TABLES = new LinkedHashMap<>();

    private static void put(RecordClass recordClass, String... tables) {
        for (String table : tables)
            if (TABLES.put(table, recordClass) != null) throw new IllegalStateException(table + " is classified twice");
    }

    static {
        put(LEGAL_RECORD,
                // what was agreed, paid, decided and done
                "consent_records", "proposals", "proposal_versions", "proposal_items", "proposal_decisions", "clinical_review_cost_estimates",
                "deposits", "deposit_components", "deposit_transfer_reports", "payment_events", "case_evidence", "admission_vouchers",
                "facility_admissions", "change_orders", "change_order_lines", "reconciliations", "reconciliation_lines", "statements",
                "case_status_history", "case_exit_reasons", "case_reopenings", "case_incidents", "patient_identity_verifications",
                // the hospital-agreement audit and compliance actions
                "affiliation_declarations", "consultant_affiliations", "affiliation_flags", "audit_samples", "audit_sample_cases",
                "facility_package_suspensions",
                // governance of staff power and the logs themselves
                "audit_events", "retention_purges", "privileged_access_change_requests", "privileged_access_change_decisions",
                "access_recertification_campaigns", "access_recertification_items", "platform_account_owner_relationships",
                "platform_owner_transfer_requests", "platform_owner_transfer_acceptances", "platform_owner_transfer_verifications",
                "support_identity_checks", "platform_governance_commissioning", "platform_governance_commissioning_decisions",
                "platform_governance_commissioning_participants", "platform_owner_recovery_requests", "platform_owner_recovery_evidence",
                "practice_manager_delegation_history");
        put(CLINICAL_RECORD,
                "medical_cases", "medical_documents", "clinical_review_versions", "consultant_referrals", "case_messages", "case_urgency_changes",
                "treatment_episodes", "case_outcomes", "follow_up_plans", "follow_up_contacts", "follow_up_windows");
        put(PERSONAL_IDENTITY,
                "patient_profiles", "case_submission_contacts", "patient_representatives", "patient_onboardings", "patient_account_link_requests",
                "portal_preferences");
        put(CASE_OPERATIONS,
                "case_assignments", "case_tasks", "case_message_reads", "patient_action_items", "staff_notifications", "reply_obligations",
                "proposal_assistance_requests", "travel_plans", "coordination_decisions", "consultant_review_conflicts", "journey_case_bindings",
                "journey_case_admissions", "journey_stage_projections", "journey_shadow_commands", "journey_shadow_runs",
                // its idempotency keys guard once-only messages, so the row stays; scrubbing destination and data after delivery is a later slice
                "notification_outbox");
        put(TRANSPORT_LOG, "whatsapp_inbound_messages", "whatsapp_delivery_events");
        put(INTAKE_CONVERSATION, "intake_conversations", "intake_messages", "conversation_media");
        put(ACCESS_SECRET,
                "case_access_links", "case_access_challenges", "case_intake_grants", "proposal_access_challenges", "proposal_share_tokens",
                // a replayed response is kept until it expires
                "idempotency_records");
        put(WORKFORCE_RECORD,
                "workforce_people", "workforce_invitations", "workforce_role_assignments", "workforce_team_memberships", "workforce_reporting_lines",
                "workforce_lead_designations", "workforce_staffing_requests", "workforce_identity_reviews", "workforce_identity_review_history",
                "access_subjects", "platform_role_assignments", "service_accounts", "mfa_reset_requests", "identity_operations",
                "identity_reconciliation_runs", "identity_reconciliation_discrepancies", "practitioner_profiles", "practitioner_credentials",
                "practice_managers", "consultant_operations_ownerships", "consultant_capabilities", "consultant_service_catalog",
                "consultation_slots", "virtual_clinics", "clinic_service_changes", "coordinator_capacity", "coordinator_intake_settings",
                "reply_covers", "practice_manager_invitations", "workforce_invitation_roles");
        put(CONFIGURATION,
                "retention_policies", "care_categories", "commercial_policies", "deposit_policies", "fx_rates", "service_templates",
                "service_template_items", "facilities", "facility_accreditations", "facility_packages", "conversation_settings",
                "coordination_policy_versions", "coordination_team_profiles", "consultant_routing_preferences", "journey_definitions",
                "journey_versions", "journey_nodes", "journey_edges", "journey_deployments", "journey_version_editors",
                "journey_admission_policy_revisions", "workforce_functions", "workforce_teams", "workforce_role_catalogue",
                "workforce_role_conflicts", "platform_access_roles");
        put(SYSTEM_STATE,
                "scheduler_leases", "platform_governance_lock", "journey_governance_lock", "coordination_routing_lock", "identity_restore_gate",
                "platform_governance_bootstrap", "platform_account_owner_current", "journey_admission_policy_current",
                "workforce_current_managers", "consultant_current_operations_owners");
    }

    private RecordCatalogue() {}

    /** Every classified table and its class. */
    public static Map<String, RecordClass> tables() { return Collections.unmodifiableMap(TABLES); }

    public static Optional<RecordClass> classOf(String table) { return Optional.ofNullable(TABLES.get(table)); }
}
