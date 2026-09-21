package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.domain.JourneyGraphValidator;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

/** Deterministic, application-owned BPMN serialization; no engine dependency or business side effects. */
@Component
public class JourneyCompiler {
    public static final String VERSION = "rehletshifaa-bpmn-1";
    private final JourneyGraphValidator validator;
    private final JourneyActionDispatcher dispatcher;

    public JourneyCompiler(JourneyGraphValidator validator, JourneyActionDispatcher dispatcher) {
        this.validator = validator;
        this.dispatcher = dispatcher;
    }

    public JourneyRuntimePort.Artifact compile(UUID versionId, Graph graph) {
        var validation = validator.validate(graph);
        if (!validation.valid()) throw invalid("Graph validation failed: " + validation.errors().getFirst().code());
        // No executable domain handler is implied by the descriptive Phase 4A catalog.
        // Register and verify concrete handlers before expanding this supported runtime subset.
        // NOTIFICATION now has a registered handler (RESEND_PROPOSAL_LINK) and compiles like any other
        // human stage — a real dispatched completion, not an engine-fired side effect (see technical-decisions.md §21).
        for (Node node : graph.nodes()) {
            if (node.action() != null && !dispatcher.supports(node.action()))
                throw invalid("No runtime handler is registered for action " + node.action());
            if (node.sla() != null)
                throw invalid("SLA projection is not available for stage " + node.key());
        }
        String process = "journey_" + versionId.toString().replace("-", "");
        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
                .append("<definitions xmlns=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" targetNamespace=\"https://rehletshifaa.com/journey\">\n")
                .append("<process id=\"").append(process).append("\" isExecutable=\"true\">\n");
        for (Node node : graph.nodes().stream().sorted(Comparator.comparing(Node::key)).toList()) {
            String id = "n_" + node.key();
            // Conditions on a human stage must be true before work appears and after its completion.
            if (node.entry() != null) waitFor(xml, "entry_" + node.key(), node.entry());
            switch (node.type()) {
                case START -> element(xml, "startEvent", id, node.label());
                case END -> element(xml, "endEvent", id, node.label());
                case DECISION -> element(xml, "exclusiveGateway", id, node.label());
                case STAFF_TASK, PATIENT_ACTION, NOTIFICATION -> element(xml, "userTask", id, node.label());
                case WAIT -> waitFor(xml, id, node.exit());
                case TIMER -> xml.append("<intermediateCatchEvent id=\"").append(id).append("\" name=\"").append(escape(node.label()))
                        .append("\"><timerEventDefinition><timeDuration>PT").append(node.timerMinutes())
                        .append("M</timeDuration></timerEventDefinition></intermediateCatchEvent>\n");
                default -> throw invalid("Unsupported executable stage " + node.key());
            }
            if (node.entry() != null) flow(xml, "enter_" + node.key(), "entry_" + node.key(), id, null);
            if (node.exit() != null && node.type() != StageType.WAIT) {
                waitFor(xml, "exit_" + node.key(), node.exit());
                flow(xml, "leave_" + node.key(), id, "exit_" + node.key(), null);
            }
        }
        Map<String, Node> nodes = new HashMap<>();
        graph.nodes().forEach(n -> nodes.put(n.key(), n));
        for (Edge edge : graph.edges().stream().sorted(Comparator.comparing(Edge::key)).toList()) {
            Node from = nodes.get(edge.from()), to = nodes.get(edge.to());
            String source = from.exit() != null && from.type() != StageType.WAIT ? "exit_" : "n_";
            String target = to.entry() != null ? "entry_" : "n_";
            flow(xml, "e_" + edge.key(), source + from.key(), target + to.key(), edge.condition());
        }
        xml.append("</process>\n</definitions>\n");
        String bpmn = xml.toString();
        return new JourneyRuntimePort.Artifact(versionId, process, VERSION, bpmn, hash(bpmn));
    }

    // Receive tasks are resumed only by the application adapter after the stored boolean condition passes.
    // They also guard entry/exit conditions; expression evaluation never calls configurable Java methods.
    private static void waitFor(StringBuilder xml, String id, Condition condition) {
        xml.append("<receiveTask id=\"").append(id).append("\"><documentation>")
                .append(condition.fact()).append('=').append(condition.equalsValue()).append("</documentation></receiveTask>\n");
    }
    private static void element(StringBuilder xml, String tag, String id, String label) {
        xml.append('<').append(tag).append(" id=\"").append(id).append("\" name=\"").append(escape(label)).append("\"/>\n");
    }
    private static void flow(StringBuilder xml, String id, String from, String to, Condition condition) {
        xml.append("<sequenceFlow id=\"").append(id).append("\" sourceRef=\"").append(from).append("\" targetRef=\"").append(to).append("\"");
        if (condition == null) xml.append("/>\n");
        else xml.append("><conditionExpression xsi:type=\"tFormalExpression\"><![CDATA[${execution.getVariable('")
                .append(condition.fact()).append("') == ").append(condition.equalsValue()).append("}]]></conditionExpression></sequenceFlow>\n");
    }
    private static String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
    }
    public static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static ApiException invalid(String message) { return new ApiException(400, "JOURNEY_COMPILE_FAILED", message); }
}
