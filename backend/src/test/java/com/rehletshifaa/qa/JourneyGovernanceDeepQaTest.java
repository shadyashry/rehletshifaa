package com.rehletshifaa.qa;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.journey.application.JourneyActionDispatcher;
import com.rehletshifaa.journey.application.JourneyCompiler;
import com.rehletshifaa.journey.application.JourneyDefinitionService;
import com.rehletshifaa.journey.application.JourneyDefinitionService.Change;
import com.rehletshifaa.journey.application.JourneyDefinitionService.Edit;
import com.rehletshifaa.journey.application.JourneyDefinitionService.Simulate;
import com.rehletshifaa.journey.domain.JourneyGraphValidator;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.domain.JourneySimulator;
import com.rehletshifaa.journey.domain.JourneyStageRegistry;
import com.rehletshifaa.shared.crypto.CryptoService;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import static com.rehletshifaa.qa.PlatformUsersDeepQaTest.assertCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * QA deep pass (2026-10-04): Journey Manager / Journey Approver governance and how far a designer change really
 * travels — draft → validation → simulation → approval → publication → compiled runtime artifact. Runtime admission
 * of live cases is a deployment switch (see {@code JourneyCutoverIntegrationTest}); it is off in this context.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class JourneyGovernanceDeepQaTest {
    @Autowired JourneyDefinitionService journeys;
    @Autowired JourneyGraphValidator validator;
    @Autowired JourneySimulator simulator;
    @Autowired JourneyCompiler compiler;
    @Autowired JourneyStageRegistry registry;
    @Autowired JourneyActionDispatcher dispatcher;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    @BeforeEach
    void setUp() {
        TestPrincipals.grant(jdbc, crypto, "qa-jm", Role.JOURNEY_MANAGER);
        TestPrincipals.grant(jdbc, crypto, "qa-jm2", Role.JOURNEY_MANAGER);
        TestPrincipals.grant(jdbc, crypto, "qa-ja", Role.JOURNEY_APPROVER);
        TestPrincipals.grant(jdbc, crypto, "qa-dual", Role.JOURNEY_MANAGER);
        TestPrincipals.grant(jdbc, crypto, "qa-dual", Role.JOURNEY_APPROVER);
        TestPrincipals.grant(jdbc, crypto, "qa-auditor", Role.COMPLIANCE_AUDITOR);
        TestPrincipals.grant(jdbc, crypto, "qa-coord", Role.COORDINATOR);
        TestPrincipals.grant(jdbc, crypto, "qa-admin", Role.SYSTEM_ADMINISTRATOR);
        signIn("qa-jm", "2");
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------------------------------------------------------------- fixtures

    static Node task(String key, String actor, String action) { return new Node(key, label(key), StageType.STAFF_TASK, actor, action, null, null, null, null, true); }
    static Node patient(String key, String action) { return new Node(key, label(key), StageType.PATIENT_ACTION, "PATIENT", action, null, null, null, null, true); }
    static Node control(String key, StageType type) { return new Node(key, label(key), type, "SYSTEM", null, null, null, null, null, false); }
    static Edge go(String from, String to) { return new Edge(from + "__" + to, from, to, null); }
    static Edge when(String from, String to, String fact, boolean value) { return new Edge(from + "__" + to, from, to, new Condition(fact, value)); }
    static String label(String key) { return key.substring(0, 1).toUpperCase() + key.substring(1).replace('_', ' '); }

    /** The realistic international-care journey with a governed recovery loop for missing information. */
    static Graph careJourney() {
        return new Graph(List.of(
                control("start", StageType.START),
                task("assign", "COORDINATOR", "ASSIGN_CONSULTANT"),
                task("review", "CONSULTANT", "RECORD_CLINICAL_DECISION"),
                control("clinical_gate", StageType.DECISION),
                task("request_info", "COORDINATOR", "REQUEST_INFORMATION"),
                patient("provide_info", "PROVIDE_INFORMATION"),
                control("info_gate", StageType.DECISION),
                task("prepare", "COORDINATOR", "PREPARE_PROPOSAL"),
                task("finance", "FINANCE", "APPROVE_COMMERCIAL_TERMS"),
                task("release", "COORDINATOR", "RELEASE_PROPOSAL"),
                patient("patient_decision", "REVIEW_PROPOSAL"),
                control("accept_gate", StageType.DECISION),
                task("travel", "OPERATIONS", "UPDATE_TRAVEL_PLAN"),
                control("done", StageType.END),
                control("declined", StageType.END),
                control("withdrawn", StageType.END)),
                List.of(go("start", "assign"), go("assign", "review"), go("review", "clinical_gate"),
                        when("clinical_gate", "prepare", "CLINICAL_ACCEPTED", true),
                        when("clinical_gate", "request_info", "CLINICAL_ACCEPTED", false),
                        go("request_info", "provide_info"), go("provide_info", "info_gate"),
                        when("info_gate", "review", "INFORMATION_COMPLETE", true),
                        when("info_gate", "withdrawn", "INFORMATION_COMPLETE", false),
                        go("prepare", "finance"), go("finance", "release"), go("release", "patient_decision"),
                        go("patient_decision", "accept_gate"),
                        when("accept_gate", "travel", "PROPOSAL_ACCEPTED", true),
                        when("accept_gate", "declined", "PROPOSAL_ACCEPTED", false),
                        go("travel", "done")));
    }

    static Graph linear(String... keysAndActions) {
        List<Node> nodes = new ArrayList<>(List.of(control("start", StageType.START)));
        List<Edge> edges = new ArrayList<>();
        String previous = "start";
        for (int i = 0; i < keysAndActions.length; i += 3) {
            nodes.add(keysAndActions[i + 1].equals("PATIENT") ? patient(keysAndActions[i], keysAndActions[i + 2]) : task(keysAndActions[i], keysAndActions[i + 1], keysAndActions[i + 2]));
            edges.add(go(previous, keysAndActions[i]));
            previous = keysAndActions[i];
        }
        nodes.add(control("end", StageType.END));
        edges.add(go(previous, "end"));
        return new Graph(nodes, edges);
    }

    private Version readyForApproval(Graph graph) {
        var detail = journeys.create();
        UUID d = detail.definition().id();
        var v = journeys.edit(d, detail.versions().getFirst().id(), new Edit(0, "Design", graph));
        v = journeys.validate(d, v.id(), new Change(v.revision(), "Check")).version();
        v = journeys.simulate(d, v.id(), new Simulate(v.revision(), "Happy path", Map.of("CLINICAL_ACCEPTED", true, "PROPOSAL_ACCEPTED", true))).version();
        return journeys.submit(d, v.id(), new Change(v.revision(), "Ready for review"));
    }

    // ---------------------------------------------------------------- 1. who may do what

    @Test
    void onlyJourneyRolesReachTheDesignerAndMakerNeverApprovesTheirOwnVersion() {
        for (String outsider : List.of("qa-coord", "qa-admin")) {
            signIn(outsider, "3");
            assertCode("PERMISSION_NOT_HELD", journeys::list);
            assertCode("PERMISSION_NOT_HELD", journeys::create);
        }
        signIn("qa-auditor", "2");
        assertThat(journeys.list()).isEmpty();
        assertCode("PERMISSION_NOT_HELD", journeys::create);

        signIn("qa-jm", "2");
        var pending = readyForApproval(careJourney());
        UUID d = pending.definitionId();
        assertThat(pending.status()).isEqualTo(Status.PENDING_APPROVAL);
        assertCode("JOURNEY_EXISTS", journeys::create);
        assertCode("PERMISSION_NOT_HELD", () -> journeys.publish(d, pending.id(), new Change(pending.revision(), "Self-approve")));

        signIn("qa-ja", "2");
        assertCode("PERMISSION_NOT_HELD", () -> journeys.edit(d, pending.id(), new Edit(pending.revision(), "Approver edits", careJourney())));
        signIn("qa-ja", "1");
        assertCode("REAUTHENTICATION_REQUIRED", () -> journeys.publish(d, pending.id(), new Change(pending.revision(), "No MFA")));
        signIn("qa-ja", "2");
        var published = journeys.publish(d, pending.id(), new Change(pending.revision(), "Independent approval"));
        assertThat(published.status()).isEqualTo(Status.PUBLISHED);
        assertThat(published.runtimeDeployment()).as("runtime is a deployment switch, off here").isEqualTo("NOT_DEPLOYED");

        // A person holding both roles who edits the next version still cannot publish it (SOD-02).
        signIn("qa-dual", "2");
        var next = journeys.cloneVersion(d, published.id(), new Change(published.revision(), "Next iteration"));
        next = journeys.edit(d, next.id(), new Edit(next.revision(), "Tweak labels", careJourney()));
        next = journeys.validate(d, next.id(), new Change(next.revision(), "Check")).version();
        next = journeys.simulate(d, next.id(), new Simulate(next.revision(), "Run", Map.of("CLINICAL_ACCEPTED", true, "PROPOSAL_ACCEPTED", true))).version();
        var submitted = journeys.submit(d, next.id(), new Change(next.revision(), "Review please"));
        assertCode("INDEPENDENT_REVIEW_REQUIRED", () -> journeys.publish(d, submitted.id(), new Change(submitted.revision(), "My own change")));

        // Returning to draft is a review decision: the approver may, the maker may not.
        signIn("qa-jm2", "2");
        assertCode("PERMISSION_NOT_HELD", () -> journeys.returnToDraft(d, submitted.id(), new Change(submitted.revision(), "Maker withdraws")));
        signIn("qa-ja", "2");
        assertThat(journeys.returnToDraft(d, submitted.id(), new Change(submitted.revision(), "Needs work")).status()).isEqualTo(Status.DRAFT);

        assertThat(journeys.history(d, 0)).extracting(JourneyDefinitionService.HistoryEntry::action)
                .contains("JOURNEY_CREATED", "JOURNEY_DRAFT_UPDATED", "JOURNEY_VALIDATED", "JOURNEY_SIMULATED", "JOURNEY_SUBMITTED",
                        "JOURNEY_PUBLISHED", "JOURNEY_RETURNED");
    }

    // ---------------------------------------------------------------- 2. is a designer change honoured?

    @Test
    void reorderingStagesChangesTheSimulatedPathAndTheCompiledProcessButNeverThePublishedVersion() {
        Graph v1Graph = linear("assign", "COORDINATOR", "ASSIGN_CONSULTANT", "review", "CONSULTANT", "RECORD_CLINICAL_DECISION",
                "info", "COORDINATOR", "REQUEST_INFORMATION");
        var pending = readyForApproval(v1Graph);
        UUID d = pending.definitionId();
        signIn("qa-ja", "2");
        var v1 = journeys.publish(d, pending.id(), new Change(pending.revision(), "Go"));

        // The manager drags "info" before "review" (expressed as the saved graph the designer sends).
        signIn("qa-jm", "2");
        Graph reordered = linear("assign", "COORDINATOR", "ASSIGN_CONSULTANT", "info", "COORDINATOR", "REQUEST_INFORMATION",
                "review", "CONSULTANT", "RECORD_CLINICAL_DECISION");
        var v2 = journeys.cloneVersion(d, v1.id(), new Change(v1.revision(), "Ask for information earlier"));
        assertCode("DRAFT_EXISTS", () -> journeys.cloneVersion(d, v1.id(), new Change(journeys.version(d, v1.id()).revision(), "Second draft")));
        v2 = journeys.edit(d, v2.id(), new Edit(v2.revision(), "Move the information request earlier", reordered));
        long staleRevision = v2.revision() - 1;
        UUID v2Id = v2.id();
        assertCode("STALE_JOURNEY", () -> journeys.edit(d, v2Id, new Edit(staleRevision, "Lost update", v1Graph)));

        var simulated = journeys.simulate(d, v2.id(), new Simulate(v2.revision(), "Run", Map.of()));
        assertThat(simulated.result().outcome()).isEqualTo("COMPLETED");
        assertThat(simulated.result().steps()).extracting(Step::nodeKey).containsExactly("start", "assign", "info", "review", "end");
        assertThat(simulator.simulate(v1Graph, Map.of()).steps()).extracting(Step::nodeKey).containsExactly("start", "assign", "review", "info", "end");

        String v1Bpmn = compiler.compile(v1.id(), journeys.version(d, v1.id()).graph()).bpmn();
        String v2Bpmn = compiler.compile(v2.id(), journeys.version(d, v2.id()).graph()).bpmn();
        assertThat(v1Bpmn).contains("sourceRef=\"n_assign\" targetRef=\"n_review\"");
        assertThat(v2Bpmn).contains("sourceRef=\"n_assign\" targetRef=\"n_info\"").contains("sourceRef=\"n_info\" targetRef=\"n_review\"");
        assertThat(journeys.version(d, v1.id()).graphHash()).as("published versions are immutable").isEqualTo(v1.graphHash());

        // Editing after a successful simulation discards the evidence: it must be validated and simulated again.
        var afterSim = simulated.version();
        var reEdited = journeys.edit(d, afterSim.id(), new Edit(afterSim.revision(), "One more change", v1Graph));
        assertThat(reEdited.status()).isEqualTo(Status.DRAFT);
        assertThat(reEdited.simulationSummary()).isNull();
        assertCode("INVALID_JOURNEY_OPERATION", () -> journeys.submit(d, reEdited.id(), new Change(reEdited.revision(), "Skip testing")));
    }

    @Test
    void everyActionTheDesignerOffersHasARuntimeHandlerAndCompiles() {
        List<String> chain = new ArrayList<>();
        for (var capability : registry.all()) {
            assertThat(dispatcher.supports(capability.key())).as(capability.key() + " has a handler").isTrue();
            String actor = capability.actors().iterator().next().name();
            chain.addAll(List.of(capability.key().toLowerCase(), actor, capability.key()));
        }
        Graph everything = linear(chain.toArray(String[]::new));
        // NOTIFICATION capabilities are typed NOTIFICATION, not STAFF_TASK; rebuild them with their registered stage type.
        Graph typed = new Graph(everything.nodes().stream().map(n -> n.action() == null ? n : registry.find(n.action())
                .map(c -> new Node(n.key(), n.label(), c.stage(), n.actorType(), n.action(), null, null, null, null, true)).orElse(n)).toList(), everything.edges());
        assertThat(validator.validate(typed).errors()).isEmpty();
        assertThatCode(() -> compiler.compile(UUID.randomUUID(), typed)).doesNotThrowAnyException();
    }

    // ---------------------------------------------------------------- 3. validator and simulator edges

    @Test
    void malformedOrHostileGraphsAreRejectedWithStableCodes() {
        Graph base = linear("review", "CONSULTANT", "RECORD_CLINICAL_DECISION");
        errors(new Graph(add(base.nodes(), control("start2", StageType.START)), add(base.edges(), go("start2", "review"))), "START_COUNT");
        errors(new Graph(base.nodes(), add(base.edges(), go("review", "start"))), "START_INCOMING");
        errors(replace(base, new Node("review", "Review", StageType.DECISION, "SYSTEM", "RECORD_CLINICAL_DECISION", null, null, null, null, false)), "CONTROL_ACTION");
        errors(replace(base, new Node("start", "Start", StageType.START, "COORDINATOR", null, null, null, null, null, false)), "CONTROL_ACTOR");
        errors(replace(base, new Node("review", "Wait", StageType.WAIT, "SYSTEM", null, null, null, null, null, false)), "WAIT_CONDITION");
        errors(replace(base, new Node("review", "x".repeat(121), StageType.STAFF_TASK, "CONSULTANT", "RECORD_CLINICAL_DECISION", null, null, null, null, true)), "NODE_LABEL");
        errors(new Graph(add(base.nodes(), control("<script>", StageType.END)), base.edges()), "NODE_KEY");
        errors(new Graph(base.nodes(), add(base.edges(), new Edge("review__end", "review", "start", null))), "EDGE_KEY");
        errors(new Graph(add(base.nodes(), control("end2", StageType.END)), add(base.edges(), go("review", "end2"))), "OUTGOING_PATH");
        errors(replace(base, new Node("review", "Review", StageType.STAFF_TASK, "CONSULTANT", "REVIEW_PROPOSAL", null, null, null, null, true)), "ACTION_COMPATIBILITY");
        errors(replace(base, new Node("review", "Review", StageType.STAFF_TASK, "SUPERUSER", "RECORD_CLINICAL_DECISION", null, null, null, null, true)), "ACTOR_REQUIRED");
        List<Node> huge = new ArrayList<>(IntStream.range(0, 201).mapToObj(i -> control("n" + i, StageType.END)).toList());
        errors(new Graph(huge, List.of()), "GRAPH_SIZE");

        // Labels are escaped in the compiled artifact.
        Graph hostile = replace(base, new Node("review", "Review <\"&'>", StageType.STAFF_TASK, "CONSULTANT", "RECORD_CLINICAL_DECISION", null, null, null, null, true));
        assertThat(compiler.compile(UUID.randomUUID(), hostile).bpmn()).contains("Review &lt;&quot;&amp;&apos;&gt;").doesNotContain("Review <\"");
    }

    /** QA-04/QA-05 fixed: what the designer accepts the runtime can compile, and the metadata states the real rules. */
    @Test
    void theDesignerOnlyAcceptsWhatTheRuntimeCanCompileAndSaysSo() {
        Graph base = linear("review", "CONSULTANT", "RECORD_CLINICAL_DECISION");
        Graph withSla = replace(base, new Node("review", "Review", StageType.STAFF_TASK, "CONSULTANT", "RECORD_CLINICAL_DECISION", null, null, new Sla(60L, 30L, 120L), null, true));
        errors(withSla, "SLA_NOT_SUPPORTED");
        assertThat(simulator.simulate(withSla, Map.of()).outcome()).as("an SLA can no longer pass the dry run").isEqualTo("INVALID");
        for (Graph graph : List.of(base, careJourney(), withSla))
            if (validator.validate(graph).valid())
                assertThatCode(() -> compiler.compile(UUID.randomUUID(), graph)).doesNotThrowAnyException();

        var metadata = journeys.registryMetadata();
        assertThat(metadata.cyclePolicy()).isEqualTo("GOVERNED_RECOVERY_LOOPS");
        assertThat(metadata.slaSupported()).isFalse();
    }

    /**
     * QA-06 fixed: a stage whose domain service needs earlier work is flagged unless that work is on every path. A warning,
     * not an error, because ordinary case actions stay available for bound cases (the handler still fails closed).
     */
    @Test
    void stagesThatDependOnEarlierWorkAreFlaggedUnlessItIsOnEveryPath() {
        Graph impossible = linear("release", "COORDINATOR", "RELEASE_PROPOSAL", "review", "CONSULTANT", "RECORD_CLINICAL_DECISION",
                "prepare", "COORDINATOR", "PREPARE_PROPOSAL");
        assertThat(prerequisites(impossible)).containsExactlyInAnyOrder("release", "review");
        assertThat(validator.validate(impossible).warnings()).filteredOn(w -> w.nodeKey() != null && w.nodeKey().equals("release"))
                .extracting(Issue::message).singleElement().asString().contains("\"Prepare proposal\"");

        // Must hold on EVERY path: preparing on only one branch of a decision does not cover a shared release.
        Graph oneBranch = new Graph(List.of(control("start", StageType.START), task("assign", "COORDINATOR", "ASSIGN_CONSULTANT"),
                task("review", "CONSULTANT", "RECORD_CLINICAL_DECISION"), control("gate", StageType.DECISION),
                task("prepare", "COORDINATOR", "PREPARE_PROPOSAL"), task("release", "COORDINATOR", "RELEASE_PROPOSAL"), control("end", StageType.END)),
                List.of(go("start", "assign"), go("assign", "review"), go("review", "gate"),
                        when("gate", "prepare", "CLINICAL_ACCEPTED", true), when("gate", "release", "CLINICAL_ACCEPTED", false),
                        go("prepare", "release"), go("release", "end")));
        assertThat(prerequisites(oneBranch)).containsExactly("release");

        // The full journey, including its recovery loop back to clinical review, satisfies every dependency.
        assertThat(prerequisites(careJourney())).isEmpty();
        assertThat(validator.validate(careJourney()).errors()).isEmpty();
    }

    private List<String> prerequisites(Graph graph) {
        return validator.validate(graph).warnings().stream().filter(w -> w.code().equals("ACTION_PREREQUISITE")).map(Issue::nodeKey).toList();
    }

    @Test
    void aRecoveryLoopIsGovernedAndTheDryRunCannotHang() {
        assertThat(validator.validate(careJourney()).errors()).isEmpty();
        var loop = simulator.simulate(careJourney(), Map.of("CLINICAL_ACCEPTED", false, "INFORMATION_COMPLETE", true));
        assertThat(loop.outcome()).isEqualTo("LOOP_LIMIT_EXCEEDED");
        var withdrawn = simulator.simulate(careJourney(), Map.of("CLINICAL_ACCEPTED", false, "INFORMATION_COMPLETE", false));
        assertThat(withdrawn.outcome()).isEqualTo("COMPLETED");
        assertThat(withdrawn.steps()).extracting(Step::nodeKey).endsWith("request_info", "provide_info", "info_gate", "withdrawn");
        var declined = simulator.simulate(careJourney(), Map.of("CLINICAL_ACCEPTED", true, "PROPOSAL_ACCEPTED", false));
        assertThat(declined.steps()).extracting(Step::nodeKey).endsWith("accept_gate", "declined");
        assertThat(simulator.simulate(careJourney(), Map.of("CLINICAL_ACCEPTED", true)).outcome()).as("missing fact stops at the gate").isEqualTo("BLOCKED");
        assertThat(simulator.simulate(careJourney(), Map.of("NOT_A_FACT", true)).outcome()).isEqualTo("INVALID");
    }

    // ---------------------------------------------------------------- helpers

    private void errors(Graph graph, String code) {
        assertThat(validator.validate(graph).errors()).extracting(Issue::code).as(code).contains(code);
    }

    private static <T> List<T> add(List<T> list, T item) { List<T> copy = new ArrayList<>(list); copy.add(item); return copy; }

    private static Graph replace(Graph graph, Node node) {
        return new Graph(graph.nodes().stream().map(n -> n.key().equals(node.key()) ? node : n).toList(), graph.edges());
    }

    private void signIn(String subject, String acr) {
        var token = Jwt.withTokenValue("qa").header("alg", "none").subject(subject)
                .claim("auth_time", clock.instant()).claim("acr", acr).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
