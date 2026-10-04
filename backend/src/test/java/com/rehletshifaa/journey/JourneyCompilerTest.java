package com.rehletshifaa.journey;

import com.rehletshifaa.journey.application.JourneyCompiler;
import com.rehletshifaa.journey.application.JourneyActionDispatcher;
import com.rehletshifaa.journey.application.JourneyActionHandler;
import com.rehletshifaa.journey.domain.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;
import static org.assertj.core.api.Assertions.*;

class JourneyCompilerTest {
    final JourneyCompiler compiler = compiler();
    static JourneyCompiler compiler() {
        var implemented = List.of("REQUEST_INFORMATION", "PROVIDE_INFORMATION", "ASSIGN_CONSULTANT",
                "RECORD_CLINICAL_DECISION", "PREPARE_PROPOSAL", "RELEASE_PROPOSAL",
                "APPROVE_COMMERCIAL_TERMS", "UPDATE_TRAVEL_PLAN", "RESEND_PROPOSAL_LINK");
        var handlers = implemented.stream().map(JourneyCompilerTest::handler).toList();
        return new JourneyCompiler(new JourneyGraphValidator(new JourneyStageRegistry()), new JourneyActionDispatcher(handlers));
    }
    private static JourneyActionHandler handler(String key) {
        return new JourneyActionHandler() {
            @Override public String actionKey() { return key; }
            @Override public UUID open(OpenContext context) { throw new UnsupportedOperationException(); }
            @Override public void complete(CompleteContext context) { throw new UnsupportedOperationException(); }
        };
    }
    @Test void deterministicUnderInputReorderingAndEscapesBusinessLabels() {
        UUID version=UUID.randomUUID();
        var graph=JourneyGraphTest.linear();
        var nodes=new ArrayList<>(graph.nodes()); Collections.reverse(nodes);
        var edges=new ArrayList<>(graph.edges()); Collections.reverse(edges);
        var artifact=compiler.compile(version,graph);
        assertThat(compiler.compile(version,new Graph(nodes,edges))).isEqualTo(artifact);
        assertThat(artifact.hash()).hasSize(64);
        assertThat(artifact.bpmn()).contains("userTask", "n_review");
        nodes.set(1,new Node("review","Review <case> & \"plan\"",StageType.STAFF_TASK,"CONSULTANT","RECORD_CLINICAL_DECISION",null,null,null,null,true));
        assertThat(compiler.compile(version,new Graph(nodes,edges)).bpmn()).contains("&lt;case&gt; &amp; &quot;plan&quot;");
    }
    @Test void branchesUseOnlyRegisteredFacts() {
        assertThat(compiler.compile(UUID.randomUUID(),JourneyGraphTest.branch()).bpmn())
                .contains("exclusiveGateway","execution.getVariable('PROPOSAL_ACCEPTED') == true","execution.getVariable('PROPOSAL_ACCEPTED') == false");
    }
    @Test void invalidGraphAndUnimplementedExecutableActionsFailClosed() {
        assertThatThrownBy(()->compiler.compile(UUID.randomUUID(),new Graph(List.of(),List.of()))).hasMessageContaining("validation failed");
        var graph=JourneyGraphTest.linear();
        var notification=new Node("review","Review",StageType.PATIENT_ACTION,"PATIENT","REVIEW_PROPOSAL",null,null,null,null,false);
        var nodes=graph.nodes().stream().map(n->n.key().equals("review")?notification:n).toList();
        assertThatThrownBy(()->compiler.compile(UUID.randomUUID(),new Graph(nodes,graph.edges()))).hasMessageContaining("No runtime handler");
    }
    @Test void slaCannotBeSilentlyDiscarded() {
        var graph=JourneyGraphTest.linear();
        var nodes=graph.nodes().stream().map(n->n.key().equals("review")?new Node(n.key(),n.label(),n.type(),n.actorType(),n.action(),null,null,new Sla(60L,30L,90L),null,true):n).toList();
        // QA-04: an SLA is refused at validation, so it can never pass review and then fail at publication.
        assertThatThrownBy(()->compiler.compile(UUID.randomUUID(),new Graph(nodes,graph.edges()))).hasMessageContaining("SLA_NOT_SUPPORTED");
    }
    @Test void waitTimerAndConditionsCompile() {
        var graph=JourneyGraphTest.linear();
        for (StageType type:List.of(StageType.WAIT,StageType.TIMER)) {
            var node=new Node("review","Wait",type,"SYSTEM",null,new Condition("INFORMATION_COMPLETE",true),new Condition("PROFILE_COMPLETE",true),null,type==StageType.TIMER?5L:null,true);
            var nodes=graph.nodes().stream().map(n->n.key().equals("review")?node:n).toList();
            String xml=compiler.compile(UUID.randomUUID(),new Graph(nodes,graph.edges())).bpmn();
            assertThat(xml).contains("receiveTask","entry_review","PROFILE_COMPLETE=true");
            if (type==StageType.TIMER) assertThat(xml).contains("<timeDuration>PT5M</timeDuration>");
        }
    }
}
