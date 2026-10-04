package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.authority.domain.Permission;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Code-reviewed contract for every value exposed through the initial owner analytics API. */
@Component
public class ExecutiveMetricCatalog {
    private static final String BASIS = "UTC event/record time; half-open [from,to) period where a period applies";
    private static final String CORRECTION = "Authoritative source is read at request time; corrections appear on the next read";
    private static final String EMPTY = "Zero for complete empty source; grouped cohorts below the configured threshold are SUPPRESSED";
    private static final String BUSINESS_OWNER = "Platform Account Owner";
    private static final String TECHNICAL_OWNER = "RehletShifaa platform engineering";
    private final Map<String, Definition> definitions;

    public ExecutiveMetricCatalog() {
        Map<String, Definition> values = new LinkedHashMap<>();
        add(values,"activeCases","Active cases","الحالات النشطة","Cases not in a terminal state","medical_cases",Permission.EXECUTIVE_OVERVIEW_VIEW,"LIVE/HOUR");
        add(values,"activeWorkforce","Active workforce","فريق العمل النشط","People with ACTIVE lifecycle","workforce_people",Permission.EXECUTIVE_OVERVIEW_VIEW,"LIVE/HOUR");
        add(values,"verifiedConsultants","Verified consultants","الاستشاريون المعتمدون","Consultant profiles with VERIFIED credentialing","practitioner_profiles",Permission.EXECUTIVE_OVERVIEW_VIEW,"LIVE/HOUR");
        add(values,"netPaymentsEgp","Net payments (EGP)","صافي المدفوعات (ج.م)","Recorded payments less refunds and reversals in EGP","payment_events",Permission.EXECUTIVE_REVENUE_VIEW,"HOURLY");
        add(values,"pendingAdministratorChanges","Pending administrator changes","تغييرات المسؤولين المعلّقة","Open privileged administrator change requests","privileged_access_change_requests",Permission.PLATFORM_GOVERNANCE_VIEW,"LIVE");
        add(values,"eventsByType","Payment events by type","أحداث الدفع حسب النوع","Payment event count grouped by controlled event type","payment_events",Permission.EXECUTIVE_REVENUE_VIEW,"HOURLY");
        add(values,"amountsByCurrency","Amounts by currency","المبالغ حسب العملة","Display amounts net of recorded refunds grouped by currency","payment_events",Permission.EXECUTIVE_REVENUE_VIEW,"HOURLY");
        add(values,"paymentMethods","Payment methods","وسائل الدفع","Payment event count grouped by recorded method; no instrument data","payment_events",Permission.EXECUTIVE_REVENUE_VIEW,"HOURLY");
        add(values,"casesByStatus","Cases by status","الحالات حسب الحالة","Created case count grouped by controlled status","medical_cases",Permission.EXECUTIVE_JOURNEY_ANALYTICS_VIEW,"15_MINUTES");
        add(values,"createdCases","Created cases","الحالات المنشأة","Cases created in period","medical_cases",Permission.EXECUTIVE_JOURNEY_ANALYTICS_VIEW,"15_MINUTES");
        add(values,"statusTransitions","Status transitions","انتقالات الحالة","Recorded case status transitions in period","case_status_history",Permission.EXECUTIVE_JOURNEY_ANALYTICS_VIEW,"15_MINUTES");
        add(values,"byCredentialingStatus","Consultants by credentialing status","الاستشاريون حسب حالة الاعتماد","Consultant profiles grouped by controlled credentialing status","practitioner_profiles",Permission.EXECUTIVE_CONSULTANT_ANALYTICS_VIEW,"HOURLY");
        add(values,"byAvailability","Consultants by availability","الاستشاريون حسب التوفر","Consultant profiles grouped by controlled availability status","practitioner_profiles",Permission.EXECUTIVE_CONSULTANT_ANALYTICS_VIEW,"HOURLY");
        add(values,"activeAssignments","Active consultant assignments","تعيينات الاستشاريين النشطة","Active case assignments for consultants","case_assignments",Permission.EXECUTIVE_CONSULTANT_ANALYTICS_VIEW,"HOURLY");
        add(values,"tasksByStatus","Tasks by status","المهام حسب الحالة","Created operational task count grouped by status","case_tasks",Permission.EXECUTIVE_OPERATIONS_ANALYTICS_VIEW,"15_MINUTES");
        add(values,"overdueOpenTasks","Overdue open tasks","المهام المفتوحة المتأخرة","Open or in-progress tasks past due time","case_tasks",Permission.EXECUTIVE_OPERATIONS_ANALYTICS_VIEW,"15_MINUTES");
        add(values,"activeOperationsAssignments","Active operations assignments","تعيينات العمليات النشطة","Active case assignments for operations","case_assignments",Permission.EXECUTIVE_OPERATIONS_ANALYTICS_VIEW,"15_MINUTES");
        add(values,"peopleByLifecycle","People by lifecycle","الأشخاص حسب دورة الحياة","Workforce people grouped by controlled lifecycle","workforce_people",Permission.EXECUTIVE_WORKFORCE_ANALYTICS_VIEW,"LIVE");
        add(values,"effectiveRoles","Effective roles","الأدوار الفعّالة","Distinct effective subjects grouped by ordinary workforce role","workforce_role_assignments",Permission.EXECUTIVE_WORKFORCE_ANALYTICS_VIEW,"LIVE");
        add(values,"effectiveAdministrators","Effective administrators","المسؤولون الفعّالون","Current eligible System Administrator subjects","platform_role_assignments, workforce_people, access_subjects",Permission.PLATFORM_GOVERNANCE_VIEW,"LIVE");
        add(values,"openStaffingRequests","Open staffing requests","طلبات التوظيف المفتوحة","Submitted workforce staffing requests","workforce_staffing_requests",Permission.EXECUTIVE_WORKFORCE_ANALYTICS_VIEW,"LIVE");
        add(values,"proposalOutcomes","Proposal outcomes","نتائج العروض","Proposal versions grouped by controlled patient outcome","proposal_versions",Permission.EXECUTIVE_PATIENT_EXPERIENCE_VIEW,"DAILY");
        add(values,"patientDecisions","Patient decisions","قرارات المرضى","Recorded patient proposal decisions in period","proposal_versions",Permission.EXECUTIVE_PATIENT_EXPERIENCE_VIEW,"DAILY");
        add(values,"governanceEvents","Governance events","أحداث الحوكمة","Access-governance audit event count","audit_events",Permission.EXECUTIVE_RISK_COMPLIANCE_VIEW,"LIVE");
        add(values,"deniedEvents","Denied governance events","أحداث الحوكمة المرفوضة","Denied access-governance audit event count","audit_events",Permission.EXECUTIVE_RISK_COMPLIANCE_VIEW,"LIVE");
        add(values,"pendingMfaResets","Pending MFA resets","إعادة تعيين التحقق المعلّقة","Pending governed MFA reset requests","mfa_reset_requests",Permission.EXECUTIVE_RISK_COMPLIANCE_VIEW,"LIVE");
        add(values,"openRecertifications","Open access reviews","مراجعات الوصول المفتوحة","Open access recertification campaigns","access_recertification_campaigns",Permission.EXECUTIVE_RISK_COMPLIANCE_VIEW,"LIVE");
        definitions = Map.copyOf(values);
    }

    public Map<String, Definition> require(Set<String> keys) {
        Map<String, Definition> result = new LinkedHashMap<>();
        for (String key : keys) {
            Definition definition = definitions.get(key);
            if (definition == null) throw new IllegalStateException("Owner metric has no reviewed definition: " + key);
            result.put(key, definition);
        }
        return result;
    }

    private static void add(Map<String, Definition> values, String key, String en, String ar, String formula,
            String source, Permission permission, String freshness) {
        values.put(key, new Definition(key, en, ar, formula, source, BASIS, "Controlled status/type/currency dimensions only",
                "E1_AGGREGATE", freshness, CORRECTION, EMPTY, permission, BUSINESS_OWNER, TECHNICAL_OWNER));
    }

    public record Definition(String key, String labelEn, String labelAr, String definitionAndFormula,
                             String authoritativeSources, String timeBasis, String supportedDimensions,
                             String privacyTier, String freshnessTarget, String correctionBehavior,
                             String emptyPartialDelayedBehavior, Permission permission,
                             String businessOwner, String technicalOwner) {}
}
