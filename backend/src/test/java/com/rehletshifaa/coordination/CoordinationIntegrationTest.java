package com.rehletshifaa.coordination;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.coordination.application.*;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class CoordinationIntegrationTest {
    @Autowired AssignmentEngine engine;
    @Autowired CoordinationConfigurationService config;
    @Autowired CoordinationRepository repo;
    @Autowired CoordinationReadService reads;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    UUID consultant, caseId, team;
    Instant past = Instant.now().minusSeconds(300), future = Instant.now().plusSeconds(86400);

    @BeforeEach void seed() {
        TestPrincipals.grant(jdbc, crypto, "routing-manager", Role.CARE_COORDINATION_MANAGER);
        signIn("routing-manager");
        consultant = consultant();
        caseId = medicalCase(consultant);
        team = team("Coordination");
        candidate("routing-a", team, 10, true);
        candidate("routing-b", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void automaticRoutingAssignsAndReplaysIdempotently() {
        Decision first = command("AUTO", 0, null);
        assertThat(first.selectedOwner()).isEqualTo("routing-a");
        assertThat(first.path()).isEqualTo("DEFAULT_TEAM");
        assertThat(first.candidates()).hasSize(2);
        assertThat(repo.owner(caseId)).isEqualTo("routing-a");
        Command retry = new Command("same", 1, "AUTO", null, null, null, "TEST");
        Decision continuity = engine.execute(caseId, retry);
        assertThat(engine.execute(caseId, retry)).isEqualTo(continuity);
        assertThat(continuity.path()).isEqualTo("CONTINUITY");
        assertThatThrownBy(() -> engine.execute(caseId, new Command("same", 1, "AUTO", null, null, null, "CHANGED")))
                .isInstanceOf(ApiException.class).hasMessageContaining("different input");
        assertThat(count("SELECT COUNT(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ACTIVE'", caseId)).isEqualTo(1);
    }

    @Test void preferredCoordinatorThenFallbackWhenTheyStopBeingACoordinator() {
        preference("routing-b", team, null);
        assertThat(command("AUTO", 0, null).path()).isEqualTo("PREFERRED_COORDINATOR");
        jdbc.update("UPDATE workforce_role_assignments SET status='REVOKED' WHERE subject='routing-b'");
        Decision next = command("AUTO", 1, null);
        assertThat(next.selectedOwner()).isEqualTo("routing-a");
        assertThat(next.path()).isEqualTo("PREFERRED_TEAM");
        assertThat(exclusions(next, "routing-b")).contains("NOT_AN_ACTIVE_COORDINATOR");
    }

    @Test void preferredOffDutyOrAtCapacityFallsThrough() {
        preference("routing-b", team, null);
        capacity("routing-b", 10, false);
        assertThat(command("AUTO", 0, null).selectedOwner()).isEqualTo("routing-a");
        capacity("routing-b", 0, true);
        assertThat(exclusions(command("AUTO", 1, null), "routing-b")).contains("AT_CAPACITY");
    }

    @Test void continuitySurvivesPreferenceAndCapacityIsNotDoubleCounted() {
        assignOwner(caseId, "routing-a");
        capacity("routing-a", 1, true);
        preference("routing-b", team, null);
        Decision d = command("AUTO", 0, null);
        assertThat(d.path()).isEqualTo("CONTINUITY");
        assertThat(d.selectedOwner()).isEqualTo("routing-a");
    }

    @Test void noCandidateQueuesAlertsManagersAndManualResolutionPreservesOtherWork() {
        capacity("routing-a", 0, true);
        capacity("routing-b", 0, true);
        Decision queued = command("AUTO", 0, null);
        assertThat(queued.selectedOwner()).isNull();
        assertThat(engine.queue()).hasSize(1);
        assertThat(engine.queue().getFirst().team()).isEqualTo(team);
        assertThat(engine.queue().getFirst().dueAt()).isAfter(Instant.now());
        assertThat(count("SELECT COUNT(*) FROM staff_notifications WHERE recipient_subject='routing-manager' AND event_type='COORDINATION_QUEUED'")).isEqualTo(1);
        capacity("routing-a", 10, true);
        UUID operations = task("OPERATIONS", "operations");
        Decision assigned = command("ASSIGN", 1, "routing-a");
        assertThat(assigned.path()).isEqualTo("MANUAL_ASSIGN");
        assertThat(engine.queue()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, operations)).isEqualTo("operations");
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("READY_FOR_CONSULTANT");
    }

    @Test void manualReassignmentRequiresReasonEligibilityAndRevision() {
        command("AUTO", 0, null);
        UUID coordinatorTask = task("COORDINATOR", "routing-a");
        assertThatThrownBy(() -> engine.execute(caseId, new Command("bad", 1, "REASSIGN", "routing-b", null, " ", "TEST"))).hasMessageContaining("reason");
        assertThatThrownBy(() -> command("REASSIGN", 1, "foreign")).hasMessageContaining("not eligible");
        Decision reassigned = command("REASSIGN", 1, "routing-b");
        assertThat(reassigned.previousOwner()).isEqualTo("routing-a");
        assertThat(repo.owner(caseId)).isEqualTo("routing-b");
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, coordinatorTask)).isEqualTo("routing-b");
        assertThatThrownBy(() -> command("AUTO", 1, null)).hasMessageContaining("changed");
        assertThat(count("SELECT COUNT(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ENDED'", caseId)).isEqualTo(1);
    }

    @Test void configurationRefusesNonCoordinatorsUnknownConsultantsAndUnknownCases() {
        TestPrincipals.grant(jdbc, crypto, "finance-person", Role.FINANCE);
        assertThatThrownBy(() -> config.saveCapacity(new Capacity("finance-person", 5, true, Set.of("en"), Set.of(), -1), "Capacity"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("NOT_A_COORDINATOR");
        assertThatThrownBy(() -> config.savePreference(UUID.randomUUID(), 0, past, future, "routing-a", team, null, "Preference")).hasMessageContaining("not found");
        assertThatThrownBy(() -> engine.status(UUID.randomUUID())).hasMessageContaining("not found");
    }

    @Test void revokedOffboardedOrNonMembersCannotReceiveAndOnlyTheManagerConfigures() {
        jdbc.update("UPDATE workforce_role_assignments SET status='REVOKED' WHERE subject='routing-a'");
        assertThat(command("AUTO", 0, null).selectedOwner()).isEqualTo("routing-b");
        jdbc.update("UPDATE workforce_people SET lifecycle_status='OFFBOARDED' WHERE subject='routing-b'");
        Decision noCoordinator = command("AUTO", 1, null);
        assertThat(noCoordinator.selectedOwner()).isNull();
        assertThat(exclusions(noCoordinator, "routing-b")).contains("NOT_AN_ACTIVE_COORDINATOR");
        candidate("routing-c", null, 10, true); // a Coordinator in no care-coordination team
        assertThat(exclusions(engine.simulate(null, "cardiology", "en", null, null).candidates(), "routing-c")).contains("NO_ACTIVE_TEAM");
        TestPrincipals.grant(jdbc, crypto, "plain-coordinator", Role.COORDINATOR);
        signIn("plain-coordinator");
        assertThatThrownBy(() -> config.teams()).hasMessageContaining("do not include this action");
        assertThatThrownBy(() -> command("AUTO", 2, null)).hasMessageContaining("do not include this action");
    }

    @Test void teamProfileRestrictsCareAreasAndCannotFallBackToItself() {
        Team current = config.teams().stream().filter(t -> t.id().equals(team)).findFirst().orElseThrow();
        assertThatThrownBy(() -> config.saveProfile(team, new TeamProfile(Set.of(), Set.of(), team), current.revision(), "Self fallback")).hasMessageContaining("itself");
        Team oncology = config.saveProfile(team, new TeamProfile(Set.of("oncology"), Set.of("en"), null), current.revision(), "Oncology only");
        assertThat(oncology.careAreas()).containsExactly("oncology");
        Decision d = command("AUTO", 0, null);
        assertThat(d.selectedOwner()).isNull();
        assertThat(exclusions(d, "routing-a")).contains("NO_ACTIVE_TEAM");
        assertThatThrownBy(() -> config.saveProfile(team, new TeamProfile(Set.of(), Set.of(), null), current.revision(), "Stale")).hasMessageContaining("reload");
    }

    @Test void policiesAndPreferencesAreVersionedAndNonOverlapping() {
        assertThatThrownBy(() -> config.savePolicy(0, future, future.plusSeconds(1000), policy(team), "Stale")).hasMessageContaining("changed");
        assertThatThrownBy(() -> config.savePolicy(1, past, future, policy(team), "Overlap")).hasMessageContaining("overlap");
        Policy next = config.savePolicy(1, future, future.plusSeconds(1000), policy(team), "Next interval");
        assertThat(next.version()).isEqualTo(2);
        assertThat(config.policies()).hasSize(2);
        preference("routing-b", team, null);
        assertThatThrownBy(() -> preference("routing-a", team, null)).hasMessageContaining("changed");
    }

    @Test void queueManualMoveAndResolutionAreAudited() {
        command("AUTO", 0, null);
        Decision d = command("QUEUE", 1, null);
        assertThat(d.path()).isEqualTo("MANUAL_QUEUE");
        assertThat(repo.owner(caseId)).isNull();
        assertThat(repo.retryableQueue()).doesNotContain(caseId); // a manager's explicit queue stays parked
        Decision assigned = command("ASSIGN", 2, "routing-b");
        assertThat(engine.history(caseId)).hasSize(3);
        String decision = assigned.id().toString();
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE entity_id=? AND action='COORDINATOR_ASSIGNMENT_DECIDED'", decision)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE entity_id=? AND action='COORDINATION_QUEUE_RESOLVED'", decision)).isEqualTo(1);
    }

    @Test void journeyWorkIsRoutedOnlyUnderAnEffectivePolicyAndKeepsTheOwner() {
        assertThat(engine.routeCoordinatorWork(caseId)).contains("routing-a");
        assertThat(engine.routeCoordinatorWork(caseId)).contains("routing-a");
        assertThat(engine.history(caseId)).hasSize(1);
        jdbc.update("UPDATE coordination_policy_versions SET effective_from=?,effective_to=?", java.sql.Timestamp.from(future), java.sql.Timestamp.from(future.plusSeconds(3600)));
        UUID other = medicalCase(consultant);
        assertThat(engine.routeCoordinatorWork(other)).isEmpty();
        assertThat(repo.owner(other)).isNull();
        assertThat(repo.queued(other)).isTrue();
        assertThat(repo.history(other)).singleElement().satisfies(d -> {
            assertThat(d.path()).isEqualTo("NO_ROUTING_POLICY");
            assertThat(d.policyId()).isNull();
            assertThat(d.selectedOwner()).isNull();
        });
    }

    @Test void coordinationIntakeWithNoCareAreaAssignsOnlyToUnrestrictedTeam() {
        jdbc.update("UPDATE medical_cases SET status='RECEIVED',care_category=NULL WHERE id=?", caseId);
        assertThat(engine.routeCoordinationIntake(caseId)).contains("routing-a");
        assertThat(repo.history(caseId)).singleElement().satisfies(d -> assertThat(d.source()).isEqualTo("COORDINATION_INTAKE"));
    }

    @Test void undefinedCareAreaQueuesThenClassificationAllowsRetry() {
        jdbc.update("UPDATE medical_cases SET status='RECEIVED',care_category=NULL WHERE id=?", caseId);
        Team current = config.teams().stream().filter(t -> t.id().equals(team)).findFirst().orElseThrow();
        config.saveProfile(team, new TeamProfile(Set.of("cardiology"), Set.of("en"), null), current.revision(), "Specialist team");
        assertThat(engine.routeCoordinationIntake(caseId)).isEmpty();
        assertThat(repo.queued(caseId)).isTrue();
        assertThat(repo.history(caseId).getFirst().path()).isEqualTo("NO_ELIGIBLE_COORDINATOR");
        jdbc.update("UPDATE medical_cases SET care_category='cardiology' WHERE id=?", caseId);
        engine.retryQueued(caseId);
        assertThat(repo.owner(caseId)).isEqualTo("routing-a");
        assertThat(repo.queued(caseId)).isFalse();
    }

    @Test void noEffectivePolicyQueuesOnceAndPolicyActivationAllowsRetry() {
        jdbc.update("UPDATE coordination_policy_versions SET effective_from=?,effective_to=?", java.sql.Timestamp.from(future), java.sql.Timestamp.from(future.plusSeconds(3600)));
        assertThat(engine.routeCoordinationIntake(caseId)).isEmpty();
        assertThat(engine.routeCoordinationIntake(caseId)).isEmpty();
        assertThat(repo.history(caseId)).singleElement().satisfies(d -> assertThat(d.path()).isEqualTo("NO_ROUTING_POLICY"));
        assertThat(repo.queued(caseId)).isTrue();
        jdbc.update("UPDATE coordination_policy_versions SET effective_from=?,effective_to=?", java.sql.Timestamp.from(past), java.sql.Timestamp.from(future));
        engine.retryQueued(caseId);
        assertThat(repo.owner(caseId)).isEqualTo("routing-a");
        assertThat(repo.queued(caseId)).isFalse();
    }

    @Test void selfClaimRequiresEligibleTeamCareAreaCapacityAndPolicy() {
        jdbc.update("UPDATE medical_cases SET status='RECEIVED' WHERE id=?", caseId);
        signIn("routing-a");
        assertThat(engine.claimCoordinatorCase(caseId)).isNotNull();
        assertThat(repo.owner(caseId)).isEqualTo("routing-a");
        signIn("routing-manager");
        assertThat(repo.history(caseId).getFirst().path()).isEqualTo("COORDINATOR_CLAIM");
        UUID other = medicalCase(consultant);
        jdbc.update("INSERT INTO care_categories(slug,name_en,name_ar,sort_order) SELECT 'oncology','Oncology','Oncology',99 "
                + "WHERE NOT EXISTS(SELECT 1 FROM care_categories WHERE slug='oncology')");
        jdbc.update("UPDATE medical_cases SET status='RECEIVED',care_category='oncology' WHERE id=?", other);
        Team current = config.teams().stream().filter(t -> t.id().equals(team)).findFirst().orElseThrow();
        config.saveProfile(team, new TeamProfile(Set.of("cardiology"), Set.of("en"), null), current.revision(), "Cardiology team");
        signIn("routing-b");
        assertThatThrownBy(() -> engine.claimCoordinatorCase(other)).isInstanceOf(ApiException.class).hasMessageContaining("not eligible");
        assertThat(repo.owner(other)).isNull();
        signIn("routing-manager");
        jdbc.update("UPDATE coordination_policy_versions SET effective_from=?,effective_to=?", java.sql.Timestamp.from(future), java.sql.Timestamp.from(future.plusSeconds(3600)));
        assertThat(engine.routeCoordinationIntake(other)).isEmpty();
        signIn("routing-b");
        assertThatThrownBy(() -> engine.claimCoordinatorCase(other)).isInstanceOf(ApiException.class).hasMessageContaining("policy");
        assertThat(repo.queued(other)).isTrue();
    }

    @Test void managerReassignmentUsesFullEligibilityAndMovesOnlyCoordinatorWork() {
        command("AUTO", 0, null);
        UUID coordinatorTask = task("COORDINATOR", "routing-a");
        UUID operationsTask = task("OPERATIONS", "operations");
        capacity("routing-b", 0, true);
        assertThatThrownBy(() -> engine.reassignCoordinator(caseId, "routing-b", "Capacity denial")).hasMessageContaining("not eligible");
        assertThat(repo.owner(caseId)).isEqualTo("routing-a");
        capacity("routing-b", 10, true);
        assertThat(engine.reassignCoordinator(caseId, "routing-b", "Coverage change")).isNotNull();
        assertThat(repo.owner(caseId)).isEqualTo("routing-b");
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, coordinatorTask)).isEqualTo("routing-b");
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, operationsTask)).isEqualTo("operations");
    }

    @Test void simulateIsEphemeralAndNeverMutatesRealState() {
        long decisions = count("SELECT COUNT(*) FROM coordination_decisions"), assignments = count("SELECT COUNT(*) FROM case_assignments"),
                tasks = count("SELECT COUNT(*) FROM case_tasks"), audits = count("SELECT COUNT(*) FROM audit_events");
        SimulationResult r = engine.simulate(null, "cardiology", "en", null, null);
        assertThat(r.candidates()).hasSize(2);
        assertThat(r.selection().subject()).isEqualTo("routing-a");
        assertThat(r.selection().path()).isEqualTo("DEFAULT_TEAM");
        assertThat(r.algorithm()).isEqualTo(CoordinatorScoringService.ALGORITHM);
        assertThat(count("SELECT COUNT(*) FROM coordination_decisions")).isEqualTo(decisions);
        assertThat(count("SELECT COUNT(*) FROM case_assignments")).isEqualTo(assignments);
        assertThat(count("SELECT COUNT(*) FROM case_tasks")).isEqualTo(tasks);
        assertThat(count("SELECT COUNT(*) FROM audit_events")).isEqualTo(audits);
        preference("routing-b", team, null);
        assertThat(engine.simulate(consultant, "cardiology", "en", null, null).selection().path()).isEqualTo("PREFERRED_COORDINATOR");
        assertThat(engine.simulate(null, "cardiology", "en", "routing-b", null).selection().subject()).isEqualTo("routing-b");
    }

    @Test void readModelsAreNamedReadOnlyForTheAuditorAndWriteNothing() {
        CoordinationOverview empty = reads.overview();
        assertThat(empty.routedCases()).isZero();
        assertThat(empty.policyVersion()).isEqualTo(1);
        command("AUTO", 0, null);
        long decisions = count("SELECT COUNT(*) FROM coordination_decisions"), assignments = count("SELECT COUNT(*) FROM case_assignments");
        assertThat(reads.overview().routedCases()).isEqualTo(1);
        List<CoordinationPerson> people = reads.people();
        CoordinationPerson a = people.stream().filter(p -> p.subject().equals("routing-a")).findFirst().orElseThrow();
        assertThat(a.name()).isEqualTo("Coordinator routing-a");
        assertThat(a.teams()).extracting(PersonTeam::team).containsExactly(team);
        assertThat(a.capacity().maximum()).isEqualTo(10);
        assertThat(a.account()).isEqualTo("ACTIVE");
        assertThat(a.workload()).isEqualTo(1);
        assertThat(people).extracting(CoordinationPerson::subject).doesNotContain(consultant.toString());
        assertThat(reads.consultants()).extracting(ConsultantRouting::consultantId).contains(consultant);
        List<DecisionEntry> feed = reads.decisions(10);
        assertThat(feed).hasSize(1);
        assertThat(feed.getFirst().caseNumber()).isNotBlank();
        assertThat(feed.getFirst().selectedOwnerName()).isEqualTo("Coordinator routing-a");
        assertThat(count("SELECT COUNT(*) FROM coordination_decisions")).isEqualTo(decisions);
        assertThat(count("SELECT COUNT(*) FROM case_assignments")).isEqualTo(assignments);
        TestPrincipals.grant(jdbc, crypto, "auditor", Role.COMPLIANCE_AUDITOR);
        signIn("auditor");
        assertThat(reads.people()).isNotEmpty();
        assertThatThrownBy(() -> command("AUTO", 1, null)).hasMessageContaining("do not include this action");
        assertThatThrownBy(() -> capacity("routing-a", 3, true)).hasMessageContaining("do not include this action");
    }

    @Test void managedCaseSummaryIsTeamScopedAndContainsOnlyOperationalCounts() {
        jdbc.update("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Manager member',0)",
                UUID.randomUUID(), team, "routing-manager", past);
        jdbc.update("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Managed team',0)",
                UUID.randomUUID(), team, "routing-manager", past);
        assignOwner(caseId, "routing-a");
        task("COORDINATOR", "routing-a");
        jdbc.update("UPDATE case_tasks SET due_at=?,blocking=TRUE WHERE case_id=? AND owner_subject='routing-a'", past, caseId);

        UUID otherTeam = team("Out of scope");
        candidate("routing-outside", otherTeam, 10, true);
        UUID otherCase = medicalCase(consultant);
        assignOwner(otherCase, "routing-outside");

        var summaries = reads.managedCaseSummaries();
        assertThat(summaries).singleElement().satisfies(summary -> {
            assertThat(summary.caseId()).isEqualTo(caseId);
            assertThat(summary.coordinatorSubject()).isEqualTo("routing-a");
            assertThat(summary.openWork()).isEqualTo(1);
            assertThat(summary.overdueWork()).isEqualTo(1);
            assertThat(summary.blockingWork()).isEqualTo(1);
        });
        assertThat(summaries).extracting(CoordinationReadService.ManagedCaseSummary::caseId).doesNotContain(otherCase);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE entity_id=? AND action='SUPERVISORY_SUMMARY_READ'", caseId.toString())).isOne();
    }

    @Test void peopleShowAccountStateAndOpenCaseloadAndManagedSummariesListEveryLedCaseLatestFirst() {
        jdbc.update("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Managed team',0)",
                UUID.randomUUID(), team, "routing-manager", past);
        assignOwner(caseId, "routing-a");
        task("COORDINATOR", "routing-a"); // open, not overdue, not blocking
        UUID quiet = medicalCase(consultant), closed = medicalCase(consultant);
        assignOwner(quiet, "routing-b");
        assignOwner(closed, "routing-b");
        jdbc.update("UPDATE medical_cases SET updated_at=? WHERE id=?", Instant.now(), quiet);
        jdbc.update("UPDATE medical_cases SET status='CLOSED',updated_at=? WHERE id=?", past.minusSeconds(60), closed);
        jdbc.update("UPDATE access_subjects SET active=FALSE WHERE subject='routing-b'");
        candidate("routing-former", team, 5, true);
        jdbc.update("UPDATE workforce_role_assignments SET status='REVOKED' WHERE subject='routing-former'");

        List<CoordinationPerson> people = reads.people();
        CoordinationPerson b = people.stream().filter(p -> p.subject().equals("routing-b")).findFirst().orElseThrow();
        assertThat(b.name()).isEqualTo("Coordinator routing-b");
        assertThat(b.account()).isEqualTo("DISABLED");
        assertThat(b.workload()).as("a closed case is not caseload").isEqualTo(1);
        CoordinationPerson former = people.stream().filter(p -> p.subject().equals("routing-former")).findFirst().orElseThrow();
        assertThat(former.account()).isEqualTo("NOT_A_COORDINATOR");
        assertThat(former.workload()).isZero();
        assertThat(former.capacity().maximum()).isEqualTo(5);
        assertThat(people.stream().filter(p -> p.subject().equals("routing-a")).findFirst().orElseThrow().workload()).isEqualTo(1);

        var summaries = reads.managedCaseSummaries();
        assertThat(summaries).extracting(CoordinationReadService.ManagedCaseSummary::caseId).containsExactly(quiet, caseId, closed);
        assertThat(summaries.getFirst()).isEqualTo(new CoordinationReadService.ManagedCaseSummary(quiet,
                jdbc.queryForObject("SELECT case_number FROM medical_cases WHERE id=?", String.class, quiet), "READY_FOR_CONSULTANT",
                "routing-b", "Coordinator routing-b", 0, 0, 0));
        assertThat(summaries.get(1)).extracting(s -> s.openWork(), s -> s.overdueWork(), s -> s.blockingWork(), s -> s.coordinatorName())
                .containsExactly(1L, 0L, 0L, "Coordinator routing-a");
        assertThat(summaries.get(2).stage()).isEqualTo("CLOSED");
        // A lead of no team sees nothing.
        TestPrincipals.grant(jdbc, crypto, "routing-unled", Role.CARE_COORDINATION_MANAGER);
        signIn("routing-unled");
        assertThat(reads.managedCaseSummaries()).isEmpty();
    }

    @Test void routingReadsCarryQueueRevisionsTeamsLeadsPreferencesConsultantsAndNewestDecisionsFirst() {
        // An automatic route, then a manager's QUEUE: the case waits in the queue carrying both decisions as its revision.
        assertThat(repo.lastAutomatic("routing-a")).isNull();
        command("AUTO", 0, null);
        assertThat(repo.lastAutomatic("routing-a")).isEqualTo(jdbc.queryForObject(
                "SELECT MAX(assigned_at) FROM case_assignments WHERE assignee_subject='routing-a' AND assigned_by='ROUTING_ENGINE'", Instant.class)).isNotNull();
        assertThat(repo.lastAutomatic("routing-b")).isNull();
        command("QUEUE", 1, null);
        QueueItem item = repo.queue().stream().filter(q -> q.caseId().equals(caseId)).findFirst().orElseThrow();
        assertThat(item.caseNumber()).isEqualTo(jdbc.queryForObject("SELECT case_number FROM medical_cases WHERE id=?", String.class, caseId));
        assertThat(item.reason()).isEqualTo("MANUAL_QUEUE");
        assertThat(item.team()).isEqualTo(team);
        assertThat(item.queuedAt()).isNotNull();
        assertThat(item.revision()).isEqualTo(2).isEqualTo(repo.facts(caseId).revision());
        assertThat(reads.overview().queue()).isEqualTo(repo.queue().size());
        assertThat(repo.history(caseId)).extracting(Decision::id).containsExactlyElementsOf(
                jdbc.queryForList("SELECT id FROM coordination_decisions WHERE case_id=? ORDER BY created_at DESC,id DESC", UUID.class, caseId));
        assertThat(reads.decisions(10)).extracting(DecisionEntry::id).containsExactlyElementsOf(
                jdbc.queryForList("SELECT id FROM coordination_decisions ORDER BY created_at DESC,id DESC", UUID.class));

        // The case's primary consultant: the latest active or offered one.
        CaseFacts facts = repo.facts(caseId);
        assertThat(facts).extracting(CaseFacts::consultantId, CaseFacts::careArea, CaseFacts::language, CaseFacts::status, CaseFacts::owner)
                .containsExactly(consultant, "cardiology", "en", "READY_FOR_CONSULTANT", null);
        UUID offered = consultant();
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'DOCTOR','PRIMARY','PENDING','Offer','TEST',?,0)",
                UUID.randomUUID(), caseId, offered.toString(), Instant.now());
        assertThat(repo.facts(caseId).consultantId()).isEqualTo(offered);
        assertThat(catchThrowableOfType(ApiException.class, () -> repo.facts(UUID.randomUUID())).code()).isEqualTo("CASE_NOT_FOUND");

        // A team without a routing profile has none, at revision -1; leads are flagged on their teams.
        UUID bare = team("Bare");
        assertThat(repo.team(bare)).hasValueSatisfying(t -> {
            assertThat(t.revision()).isEqualTo(-1);
            assertThat(t.careAreas()).isEmpty();
            assertThat(t.languages()).isEmpty();
            assertThat(t.active()).isTrue();
        });
        jdbc.update("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Lead',0)",
                UUID.randomUUID(), team, "routing-a", past);
        List<CoordinationPerson> people = reads.people();
        assertThat(people.stream().filter(p -> p.subject().equals("routing-a")).findFirst().orElseThrow().teams()).singleElement().satisfies(t -> {
            assertThat(t.lead()).isTrue();
            assertThat(t.effectiveFrom()).isNotNull();
        });
        assertThat(people.stream().filter(p -> p.subject().equals("routing-b")).findFirst().orElseThrow().teams()).singleElement()
                .satisfies(t -> assertThat(t.lead()).isFalse());

        // A consultant's current preference is the one in force; the latest is the newest version.
        config.savePreference(consultant, 0, past, future, "routing-b", team, null, "Current preference");
        config.savePreference(consultant, 1, future, future.plusSeconds(1000), "routing-a", team, null, "Next preference");
        ConsultantRouting routing = reads.consultants().stream().filter(c -> c.consultantId().equals(consultant)).findFirst().orElseThrow();
        assertThat(routing.current().version()).isEqualTo(1);
        assertThat(routing.current().coordinator()).isEqualTo("routing-b");
        assertThat(routing.latest().version()).isEqualTo(2);
        assertThat(reads.consultants()).extracting(ConsultantRouting::consultantId).contains(offered);
    }

    Decision command(String action, long revision, String target) {
        return engine.execute(caseId, new Command(UUID.randomUUID().toString(), revision, action, target, action.equals("QUEUE") ? team : null, "Reviewed assignment", "TEST"));
    }
    PolicyConfig policy(UUID team) { return new PolicyConfig(80, 20, true, false, Map.of(), team, null, 24); }
    void preference(String subject, UUID t, UUID fallback) { config.savePreference(consultant, 0, past, future, subject, t, fallback, "Consultant preference"); }
    void capacity(String subject, int max, boolean duty) {
        Capacity c = repo.capacities().stream().filter(x -> x.subject().equals(subject)).findFirst().orElseThrow();
        config.saveCapacity(new Capacity(subject, max, duty, c.languages(), c.careAreas(), c.revision()), "Capacity update");
    }
    void candidate(String subject, UUID t, int max, boolean duty) {
        WorkforceTestData.staffWithEmail(jdbc, subject, "COORDINATOR", crypto.encrypt("Coordinator " + subject), crypto.encrypt(subject + "@example.test"));
        if (t != null) jdbc.update("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Member',0)",
                UUID.randomUUID(), t, subject, past);
        config.saveCapacity(new Capacity(subject, max, duty, Set.of("en"), Set.of(), -1), "Initial capacity");
    }
    UUID team(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,'CARE_COORDINATION',?,'ACTIVE','TEST',?,?,0)", id, name + " " + id, past, past);
        return id;
    }
    UUID consultant() {
        UUID id = UUID.randomUUID();
        String subject = id.toString();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,0)",
                id, subject, subject, subject, past, past);
        return id;
    }
    UUID medicalCase(UUID doctor) {
        UUID id = UUID.randomUUID(), patient = UUID.randomUUID();
        jdbc.update("INSERT INTO patient_profiles(id,given_name,country,preferred_language,created_at,updated_at,version) VALUES(?,'Test','AE','en',?,?,0)",
                patient, past, past);
        jdbc.update("INSERT INTO medical_cases(id,case_number,patient_id,country,preferred_language,status,consent_timestamp,created_at,updated_at,version,care_category) VALUES(?,?,?,'AE','en','READY_FOR_CONSULTANT',?,?,?,0,'cardiology')",
                id, "R-" + id.toString().substring(0, 10), patient, past, past, past);
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'DOCTOR','PRIMARY','ACTIVE','Fixture assignment','TEST',?,0)",
                UUID.randomUUID(), id, doctor.toString(), past);
        return id;
    }
    void assignOwner(UUID id, String subject) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,'COORDINATOR','PRIMARY','ACTIVE','Fixture assignment','TEST',?,?,0)",
                UUID.randomUUID(), id, subject, past, past);
    }
    UUID task(String role, String subject) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO case_tasks(id,case_id,task_type,title,owner_subject,owner_role,visibility_scope,priority,status,blocking,created_by,created_at,updated_at,version) VALUES(?,?,'EXISTING',?,?,?,'INTERNAL','NORMAL','OPEN',FALSE,'TEST',?,?,0)",
                id, caseId, crypto.encrypt("Existing work"), subject, role, past, past);
        return id;
    }
    static List<String> exclusions(Decision d, String subject) { return exclusions(d.candidates(), subject); }
    static List<String> exclusions(List<Candidate> candidates, String subject) {
        return candidates.stream().filter(c -> c.subject().equals(subject)).findFirst().orElseThrow().exclusions();
    }
    long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }
    static void signIn(String subject) { TestPrincipals.signIn(subject); }
}
