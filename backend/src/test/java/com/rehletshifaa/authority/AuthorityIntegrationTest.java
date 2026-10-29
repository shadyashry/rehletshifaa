package com.rehletshifaa.authority;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.CaseRelationships;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.authority.domain.Scope;
import com.rehletshifaa.authority.domain.Workspace;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** A1: decisions come from effective database roles, the single policy and live relationships. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class AuthorityIntegrationTest {
    @Autowired Authority authority;
    @Autowired CaseRelationships relationships;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    private UUID caseId;

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person("a-owner", "COORDINATOR").person("a-lead", "COORDINATOR").person("a-other", "COORDINATOR")
                .person("a-admin").administrator("a-admin").person("a-auditor", "COMPLIANCE_AUDITOR");
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "a-lead", "a-owner");
        Instant now = clock.instant();
        UUID patient = UUID.randomUUID();
        jdbc.update("INSERT INTO patient_profiles(id,external_subject,given_name,country,whatsapp_number,preferred_language,created_at,updated_at,version) "
                + "VALUES(?,?,?,?,?,'en',?,?,0)", patient, "a-patient", crypto.encrypt("Patient"), "Kenya", crypto.encrypt("+254700000555"), now, now);
        caseId = UUID.randomUUID();
        jdbc.update("INSERT INTO medical_cases(id,case_number,country,preferred_language,status,consent_timestamp,created_at,updated_at,version,patient_id) "
                + "VALUES(?,?,?,'en','INTAKE_REVIEW',?,?,?,0,?)", caseId, "RS-A1-" + caseId.toString().substring(0, 6),
                "Kenya", now, now, now, patient);
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) "
                + "VALUES(?,?,'a-owner','COORDINATOR','PRIMARY','ACTIVE','Owner','test',?,0)", UUID.randomUUID(), caseId, now);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void caseAuthorityFollowsAssignmentOwnershipAndSupervision() {
        assertThat(decide("a-owner", Permission.CASE_COORDINATE, Resource.ofCase(caseId)).scope().name()).isEqualTo("CASE_OWNER");
        assertThat(decide("a-lead", Permission.CASE_READ, Resource.ofCase(caseId)).scope().name()).isEqualTo("SUPERVISED");
        assertThat(decide("a-lead", Permission.CASE_COORDINATE, Resource.ofCase(caseId)).code()).isEqualTo("OUT_OF_SCOPE");
        assertThat(decide("a-other", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("OUT_OF_SCOPE");
        assertThat(decide("a-lead", Permission.TASK_SUPERVISE, Resource.ofCase(caseId, "a-owner")).granted()).isTrue();
        assertThat(decide("a-lead", Permission.TASK_SUPERVISE, Resource.ofCase(caseId, "a-other")).granted()).isFalse();
    }

    @Test
    void financeAndOperationsReadACaseTheyWereOfferedButActOnlyOnceTheyAccept() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person("a-finance", "FINANCE").person("a-ops", "OPERATIONS").person("a-finance-unoffered", "FINANCE");
        Instant now = clock.instant();
        assign("a-finance", "FINANCE", "PRIMARY", "PENDING", now);
        assign("a-ops", "OPERATIONS", "PRIMARY", "PENDING", now);
        // An offer is reviewed before it is accepted, as a consultant reviews theirs: the case opens, the work does not.
        assertThat(decide("a-finance", Permission.CASE_READ, Resource.ofCase(caseId)).granted()).isTrue();
        assertThat(decide("a-ops", Permission.CASE_READ, Resource.ofCase(caseId)).granted()).isTrue();
        assertThat(decide("a-finance", Permission.FINANCE_SETTLE, Resource.ofCase(caseId)).granted()).isFalse();
        assertThat(decide("a-finance-unoffered", Permission.CASE_READ, Resource.ofCase(caseId)).granted()).isFalse();
    }

    @Test
    void financeSeesOnlyThePaymentViewOfAnAcceptedCaseWhileItsDepositIsOpenAndActsOnNothingThere() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("a-finance-pool", "FINANCE").person("a-ops-pool", "OPERATIONS");
        Resource onCase = Resource.ofCase(caseId);
        jdbc.update("UPDATE medical_cases SET status='ACCEPTED' WHERE id=?", caseId);
        // No deposit and no assignment: nothing to record, nothing to see.
        assertThat(decide("a-finance-pool", Permission.CASE_DEPOSIT_READ, onCase).code()).isEqualTo("OUT_OF_SCOPE");

        UUID deposit = UUID.randomUUID();
        jdbc.update("INSERT INTO deposits(id,case_id,currency,total_egp,status,created_at,version) VALUES(?,?,'EGP',3000,'REQUESTED',?,0)",
                deposit, caseId, clock.instant());
        assertThat(decide("a-finance-pool", Permission.CASE_DEPOSIT_READ, onCase).scope()).isEqualTo(Scope.CASE_DEPOSIT_OPEN);
        // The payment view only: never the case record (clinical, documents, threads), and no settlement, messaging,
        // assignment or coordination power; nothing for other roles.
        for (Permission action : List.of(Permission.CASE_READ, Permission.FINANCE_SETTLE, Permission.CASE_MESSAGE,
                Permission.ASSIGNMENT_RESPOND, Permission.CASE_COORDINATE, Permission.TASK_CREATE))
            assertThat(decide("a-finance-pool", action, onCase).granted()).as(action.name()).isFalse();
        assertThat(decide("a-ops-pool", Permission.CASE_DEPOSIT_READ, onCase).granted()).isFalse();
        assertThat(decide("a-other", Permission.CASE_DEPOSIT_READ, onCase).granted()).isFalse();

        jdbc.update("UPDATE deposits SET status='PARTIALLY_PAID' WHERE id=?", deposit);
        assertThat(decide("a-finance-pool", Permission.CASE_DEPOSIT_READ, onCase).granted()).as("partly paid is still open").isTrue();
        jdbc.update("UPDATE medical_cases SET status='CANCELLED' WHERE id=?", caseId);
        assertThat(decide("a-finance-pool", Permission.CASE_DEPOSIT_READ, onCase).code()).as("past ACCEPTED: it ends").isEqualTo("OUT_OF_SCOPE");
        jdbc.update("UPDATE medical_cases SET status='ACCEPTED' WHERE id=?", caseId);
        jdbc.update("UPDATE deposits SET status='PAID' WHERE id=?", deposit);
        assertThat(decide("a-finance-pool", Permission.CASE_DEPOSIT_READ, onCase).code()).as("paid: it ends").isEqualTo("OUT_OF_SCOPE");
        jdbc.update("UPDATE deposits SET status='REQUESTED', waived_at=?, waived_by='a-finance-pool', waiver_reason='Waived' WHERE id=?",
                clock.instant(), deposit);
        assertThat(decide("a-finance-pool", Permission.CASE_DEPOSIT_READ, onCase).code()).as("waived: it ends").isEqualTo("OUT_OF_SCOPE");
    }

    @Test
    void financePaymentViewSurvivesExitOnlyWhileInternalDepositRefundWorkIsOpen() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("a-refund-finance", "FINANCE")
                .person("a-refund-ops", "OPERATIONS");
        Resource onCase = Resource.ofCase(caseId);
        jdbc.update("UPDATE medical_cases SET status='CANCELLED' WHERE id=?", caseId);
        UUID task = UUID.randomUUID();
        jdbc.update("INSERT INTO case_tasks(id,case_id,task_type,title,owner_role,visibility_scope,priority,status,blocking,created_by,created_at,updated_at,version) "
                        + "VALUES(?,?,'REFUND_DEPOSIT',?,'FINANCE','INTERNAL','NORMAL','OPEN',FALSE,'SYSTEM',?,?,0)",
                task, caseId, crypto.encrypt("Refund deposit"), clock.instant(), clock.instant());

        assertThat(decide("a-refund-finance", Permission.CASE_DEPOSIT_READ, onCase).scope()).isEqualTo(Scope.CASE_DEPOSIT_OPEN);
        for (Permission action : List.of(Permission.CASE_READ, Permission.ADMISSION_READ, Permission.EVIDENCE_COUNTERSIGN,
                Permission.CHANGE_ORDER_PRICE, Permission.RECONCILE, Permission.SETTLEMENT_READ))
            assertThat(decide("a-refund-finance", action, onCase).granted()).as(action.name()).isFalse();
        assertThat(decide("a-refund-ops", Permission.CASE_DEPOSIT_READ, onCase).granted()).isFalse();

        jdbc.update("UPDATE case_tasks SET status='IN_PROGRESS' WHERE id=?", task);
        assertThat(decide("a-refund-finance", Permission.CASE_DEPOSIT_READ, onCase).granted()).isTrue();
        jdbc.update("UPDATE case_tasks SET status='COMPLETED' WHERE id=?", task);
        assertThat(decide("a-refund-finance", Permission.CASE_DEPOSIT_READ, onCase).granted()).isFalse();
        jdbc.update("UPDATE case_tasks SET status='OPEN', task_type='REFUND_CREDIT' WHERE id=?", task);
        assertThat(decide("a-refund-finance", Permission.CASE_DEPOSIT_READ, onCase).granted()).isFalse();
        jdbc.update("UPDATE case_tasks SET task_type='REFUND_DEPOSIT', owner_role='OPERATIONS' WHERE id=?", task);
        assertThat(decide("a-refund-finance", Permission.CASE_DEPOSIT_READ, onCase).granted()).isFalse();
        jdbc.update("UPDATE case_tasks SET owner_role='FINANCE', visibility_scope='PATIENT_ACTION' WHERE id=?", task);
        assertThat(decide("a-refund-finance", Permission.CASE_DEPOSIT_READ, onCase).granted()).isFalse();
    }

    @Test
    void administratorsAndAuditorsHoldNoCasePower() {
        assertThat(decide("a-admin", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
        assertThat(decide("a-auditor", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
        assertThat(decide("a-admin", Permission.WORKFORCE_ADMINISTER, Resource.platform()).granted()).isTrue();
        assertThat(decide("a-auditor", Permission.WORKFORCE_ADMINISTER, Resource.platform()).granted()).isFalse();
    }

    @Test
    void patientsReachOnlyTheirOwnCasesAndAccountsOnlyBind() {
        assertThat(decide("a-patient", Permission.CASE_READ, Resource.ofCase(caseId)).scope().name()).isEqualTo("OWN_PATIENT");
        assertThat(decide("a-stranger", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
        assertThat(decide("a-stranger", Permission.ACCOUNT_BINDING, Resource.platform()).granted()).isTrue();
        assertThat(decide("a-owner", Permission.PATIENT_SELF_SERVICE, Resource.platform()).code())
                .as("IAM-11: workforce identities hold no patient authority").isEqualTo("PERMISSION_NOT_HELD");
    }

    /**
     * Deep validation D-12: patients sign in with a password only (D1), so their sensitive decisions confirm with a fresh
     * sign-in, not a second factor they were never asked to set up. Found live: a just-signed-in patient could not withdraw.
     */
    @Test
    void aPatientsDecisionNeedsAFreshSignInNotASecondFactor() {
        Principal fresh = new Principal("a-patient", clock.instant(), "1");
        assertThat(authority.decide(fresh, Permission.PATIENT_DECIDE, Resource.ofCase(caseId)).granted()).isTrue();
        Principal stale = new Principal("a-patient", clock.instant().minus(java.time.Duration.ofMinutes(30)), "1");
        assertThat(authority.decide(stale, Permission.PATIENT_DECIDE, Resource.ofCase(caseId)).code()).isEqualTo("REAUTHENTICATION_REQUIRED");
        // Staff step-up is unchanged: a fresh password-only session never confirms a staff decision.
        assertThat(authority.decide(new Principal("a-owner", clock.instant(), "1"), Permission.PROPOSAL_DECISION_RECORD, Resource.ofCase(caseId)).granted()).isFalse();
    }

    /** D1 / MFA-1 (owner, 2026-10-14): who signs in with which second factor. */
    @Test
    void staffSignInWithASecondFactorAndPrivilegedRolesWithAPasskey() {
        Principal password = new Principal("someone", clock.instant(), "1");
        assertThat(authority.signInStrength(password, java.util.Set.of(Role.COORDINATOR), false)).isEqualTo(new Authority.SignInStrength("2", false));
        assertThat(authority.signInStrength(password, java.util.Set.of(Role.CONSULTANT), false).acr()).as("Consultants read medical records").isEqualTo("2");
        assertThat(authority.signInStrength(password, java.util.Set.of(Role.FINANCE), false).acr()).isEqualTo("3");
        assertThat(authority.signInStrength(password, java.util.Set.of(Role.CREDENTIAL_VERIFIER), false).acr()).isEqualTo("3");
        assertThat(authority.signInStrength(password, java.util.Set.of(), true).acr()).as("the platform owner").isEqualTo("3");
        assertThat(authority.signInStrength(password, java.util.Set.of(Role.PATIENT), false)).isEqualTo(new Authority.SignInStrength(null, true));
        assertThat(authority.signInStrength(new Principal("someone", clock.instant(), "2"), java.util.Set.of(Role.FINANCE), false).satisfied())
                .as("the authenticator app is the privileged roles' backup sign-in").isTrue();
    }

    /** QA W-35: listing what a sensitive permission decides needs the role and a second-factor session, not a fresh re-check. */
    @Test
    void listingPendingDecisionsNeedsNoFreshRecheckButDecidingDoes() {
        TestPrincipals.signIn("a-admin", clock.instant().minusSeconds(3600), "3");
        assertThat(authority.allowedToList(Permission.WORKFORCE_ADMINISTER)).isTrue();
        assertThat(authority.allowed(Permission.WORKFORCE_ADMINISTER, Resource.platform())).isFalse();
        TestPrincipals.signIn("a-admin", clock.instant(), "1");
        assertThat(authority.allowedToList(Permission.WORKFORCE_ADMINISTER)).as("never in a password-only session").isFalse();
        TestPrincipals.signIn("a-stranger", clock.instant(), "2");
        assertThat(catchThrowableOfType(ApiException.class, () -> authority.requireToList(Permission.WORKFORCE_ADMINISTER)).code())
                .isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test
    void stepUpAndNextRequestRevocationApply() {
        Principal stale = new Principal("a-admin", clock.instant().minusSeconds(3600), "3");
        assertThat(authority.decide(stale, Permission.WORKFORCE_ADMINISTER, Resource.platform()).code()).isEqualTo("REAUTHENTICATION_REQUIRED");
        // D1: a password-only session of a staff member reaches nothing that needs a role.
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "pwd"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).code())
                .isEqualTo("MFA_REQUIRED");
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "2"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).reason())
                .contains("passkey");
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "3"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).granted()).isTrue();
        jdbc.update("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                        + "VALUES(?,'a-admin','JOURNEY_APPROVER',?,'ACTIVE','GRANT','test','Mixed-role check',?,0)",
                UUID.randomUUID(), clock.instant().minusSeconds(60), clock.instant());
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "2"), Permission.JOURNEY_APPROVE, Resource.platform()).reason())
                .as("an administrator cannot bypass passkey strength through another granting role")
                .contains("passkey");
        jdbc.update("UPDATE workforce_role_assignments SET status='REVOKED' WHERE subject='a-owner'");
        assertThat(decide("a-owner", Permission.CASE_COORDINATE, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test
    void heldRolesDriveWorkspacesAndTheEndpointErrorMatchesTheDecision() {
        var held = authority.held(new Principal("a-lead", clock.instant(), null));
        assertThat(held.roles()).containsExactlyInAnyOrder(Role.ACCOUNT_HOLDER, Role.COORDINATOR);
        assertThat(held.workspaces()).containsExactly(Workspace.COORDINATION);
        authenticate("a-other");
        ApiException error = catchThrowableOfType(ApiException.class, () -> authority.require(Permission.CASE_READ, Resource.ofCase(caseId)));
        assertThat(error.code()).isEqualTo(decide("a-other", Permission.CASE_READ, Resource.ofCase(caseId)).code());
    }

    @Test
    void caseRelationshipFactsSeparateTheTeamOffersSecondOpinionsIntakeAndRepresentation() {
        Instant now = clock.instant();
        assign("r-doctor", "DOCTOR", "PRIMARY", "ACTIVE", now);
        assign("r-offered", "DOCTOR", "PRIMARY", "PENDING", now);
        assign("r-second", "DOCTOR", "SECOND_OPINION", "ACTIVE", now);
        assign("r-ended", "DOCTOR", "PRIMARY", "ENDED", now);
        // The team: active and not a second opinion; an offer counts only when offers are asked for; the role must match.
        assertThat(relationships.assigned(caseId, "r-doctor", "DOCTOR", false)).isTrue();
        assertThat(relationships.assigned(caseId, "r-offered", "DOCTOR", false)).isFalse();
        assertThat(relationships.assigned(caseId, "r-offered", "DOCTOR", true)).isTrue();
        assertThat(relationships.assigned(caseId, "r-second", "DOCTOR", false)).isFalse();
        assertThat(relationships.assigned(caseId, "r-second", "DOCTOR", true)).isTrue();
        assertThat(relationships.assigned(caseId, "r-ended", "DOCTOR", true)).isFalse();
        assertThat(relationships.assigned(caseId, "r-doctor", "COORDINATOR", true)).isFalse();
        assertThat(relationships.consulted(caseId, "r-second")).isTrue();
        assertThat(relationships.consulted(caseId, "r-doctor")).isFalse();
        assertThat(relationships.activeAssignees(caseId, "DOCTOR")).containsExactlyInAnyOrder("r-doctor", "r-second");
        assertThat(relationships.activeAssignees(caseId, "COORDINATOR")).containsExactly("a-owner");

        // Ownership and intake: a RECEIVED case is unclaimed only while no primary coordinator is active.
        assertThat(relationships.primaryCoordinator(caseId)).contains("a-owner");
        jdbc.update("UPDATE medical_cases SET status='RECEIVED' WHERE id=?", caseId);
        assertThat(relationships.unclaimedIntake(caseId)).isFalse();
        jdbc.update("UPDATE case_assignments SET status='ENDED' WHERE case_id=? AND assignee_subject='a-owner'", caseId);
        assertThat(relationships.primaryCoordinator(caseId)).isEmpty();
        assertThat(relationships.unclaimedIntake(caseId)).isTrue();
        assertThat(relationships.unclaimedIntake(UUID.randomUUID())).isFalse();

        // The patient and a representative in force reach the case; one not yet in force, expired or revoked does not.
        UUID patient = jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId);
        assertThat(relationships.ownPatientCase(caseId, "a-patient")).isTrue();
        represent(patient, "r-rep", now.minusSeconds(60), null, null);
        represent(patient, "r-future", now.plusSeconds(3600), null, null);
        represent(patient, "r-expired", now.minusSeconds(7200), now.minusSeconds(60), null);
        represent(patient, "r-revoked", now.minusSeconds(60), null, now.minusSeconds(30));
        assertThat(relationships.ownPatientCase(caseId, "r-rep")).isTrue();
        assertThat(relationships.ownPatientCase(caseId, "r-future")).isFalse();
        assertThat(relationships.ownPatientCase(caseId, "r-expired")).isFalse();
        assertThat(relationships.ownPatientCase(caseId, "r-revoked")).isFalse();
        assertThat(relationships.ownPatientCase(caseId, "a-stranger")).isFalse();
    }

    private void assign(String subject, String role, String type, String status, Instant at) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) "
                + "VALUES(?,?,?,?,?,?,'Relationship check','test',?,0)", UUID.randomUUID(), caseId, subject, role, type, status, at);
    }

    private void represent(UUID patient, String subject, Instant from, Instant expires, Instant revoked) {
        jdbc.update("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,expires_at,revoked_at,created_at) "
                + "VALUES(?,?,?,'Parent','VIEW',?,?,?,?)", UUID.randomUUID(), patient, subject, from, expires, revoked, from);
    }

    private Authority.Decision decide(String subject, Permission permission, Resource resource) {
        return authority.decide(new Principal(subject, clock.instant(), "3"), permission, resource);
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("t").header("alg", "none").subject(subject)
                .claim("auth_time", clock.instant()).claim("acr", "2").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
