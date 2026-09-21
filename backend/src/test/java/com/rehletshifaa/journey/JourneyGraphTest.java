package com.rehletshifaa.journey;
import com.rehletshifaa.journey.domain.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;
import static org.assertj.core.api.Assertions.*;
class JourneyGraphTest {
 final JourneyGraphValidator validator=new JourneyGraphValidator(new JourneyStageRegistry());
 final JourneySimulator simulator=new JourneySimulator(validator);
 static Node node(String k,StageType t,String a,String action){return new Node(k,k,t,a,action,null,null,null,null,true);}
 static Edge edge(String a,String b){return new Edge(a+"_"+b,a,b,null);}
 static Graph linear(){return new Graph(List.of(node("start",StageType.START,"SYSTEM",null),node("review",StageType.STAFF_TASK,"CONSULTANT","RECORD_CLINICAL_DECISION"),node("end",StageType.END,"SYSTEM",null)),List.of(edge("start","review"),edge("review","end")));}
 static Graph branch(){return new Graph(List.of(node("start",StageType.START,"SYSTEM",null),node("decision",StageType.DECISION,"SYSTEM",null),node("yes",StageType.END,"SYSTEM",null),node("no",StageType.END,"SYSTEM",null)),List.of(edge("start","decision"),new Edge("yes_path","decision","yes",new Condition("PROPOSAL_ACCEPTED",true)),new Edge("no_path","decision","no",new Condition("PROPOSAL_ACCEPTED",false))));}
 void errors(Graph g,String c){assertThat(validator.validate(g).errors()).extracting(Issue::code).contains(c);}
 Graph replace(Node r){return new Graph(linear().nodes().stream().map(n->n.key().equals(r.key())?r:n).toList(),linear().edges());}
 @Test void validLinear(){assertThat(validator.validate(linear()).valid()).isTrue();}
 @Test void validConditional(){assertThat(validator.validate(branch()).valid()).isTrue();}
 @Test void unreachable(){var n=new ArrayList<>(linear().nodes());n.add(node("orphan",StageType.END,"SYSTEM",null));errors(new Graph(n,linear().edges()),"UNREACHABLE");}
 @Test void dangling(){errors(new Graph(linear().nodes(),List.of(edge("start","absent"))),"DANGLING_EDGE");}
 @Test void missingActor(){errors(replace(node("review",StageType.STAFF_TASK,null,"RECORD_CLINICAL_DECISION")),"ACTOR_REQUIRED");}
 @Test void unsupportedAction(){errors(replace(node("review",StageType.STAFF_TASK,"CONSULTANT","java.lang.Runtime.exec")),"UNSUPPORTED_ACTION");}
 @Test void noCompletion(){errors(new Graph(linear().nodes().subList(0,2),List.of(edge("start","review"))),"NO_COMPLETION");}
 // A back-edge from a non-Decision stage straight to an ancestor is an ungated (automatic) loop — rejected
 // regardless of the bounded recovery-cycle policy (technical-decisions.md §22), which only ever permits a
 // loop that branches from an explicit Decision stage.
 @Test void cycleFromNonDecisionStageIsUngated(){var e=new ArrayList<>(linear().edges());e.add(edge("review","start"));errors(new Graph(linear().nodes(),e),"CYCLE_UNGATED");}
 @Test void cycleSelfLoopRejected(){var e=new ArrayList<>(linear().edges());e.add(edge("review","review"));errors(new Graph(linear().nodes(),e),"CYCLE_SELF_LOOP");}
 // A Decision-gated loop whose cycle contains no Staff/Patient action at all could spin without any human
 // input ever occurring — rejected even though the back-edge itself is properly gated.
 @Test void cycleWithNoHumanActionRejected(){
  var nodes=List.of(node("start",StageType.START,"SYSTEM",null),node("gate1",StageType.DECISION,"SYSTEM",null),
      node("gate2",StageType.DECISION,"SYSTEM",null),node("end",StageType.END,"SYSTEM",null));
  var edges=List.of(edge("start","gate1"),
      new Edge("g1_end","gate1","end",new Condition("PROPOSAL_ACCEPTED",true)),
      new Edge("g1_g2","gate1","gate2",new Condition("PROPOSAL_ACCEPTED",false)),
      new Edge("g2_end","gate2","end",new Condition("CONSULTANT_ACCEPTED",true)),
      new Edge("g2_g1","gate2","gate1",new Condition("CONSULTANT_ACCEPTED",false)));
  errors(new Graph(nodes,edges),"CYCLE_NO_HUMAN_ACTION");
 }
 // A well-formed bounded recovery loop — gated by a Decision, containing a real staff action, with an
 // existing exit to End — must validate successfully; Phase 4A's blanket cycle rejection no longer applies.
 static Graph boundedCycle(){
  return new Graph(List.of(node("start",StageType.START,"SYSTEM",null),
      node("task",StageType.STAFF_TASK,"CONSULTANT","RECORD_CLINICAL_DECISION"),
      node("gate",StageType.DECISION,"SYSTEM",null),node("end",StageType.END,"SYSTEM",null)),
    List.of(edge("start","task"),edge("task","gate"),
      new Edge("gate_yes","gate","end",new Condition("PROPOSAL_ACCEPTED",true)),
      new Edge("gate_no","gate","task",new Condition("PROPOSAL_ACCEPTED",false))));
 }
 @Test void validBoundedRecoveryCycle(){assertThat(validator.validate(boundedCycle()).valid()).isTrue();}
 @Test void invalidTerminal(){var e=new ArrayList<>(linear().edges());e.add(edge("end","review"));errors(new Graph(linear().nodes(),e),"END_OUTGOING");}
 @Test void incompatibleActor(){errors(replace(node("review",StageType.STAFF_TASK,"PATIENT","RECORD_CLINICAL_DECISION")),"ACTION_COMPATIBILITY");}
 @Test void timerSla(){errors(replace(new Node("review","Review",StageType.TIMER,"SYSTEM",null,null,null,new Sla(30L,40L,20L),-1L,true)),"INVALID_TIMER");errors(replace(new Node("review","Review",StageType.STAFF_TASK,"CONSULTANT","RECORD_CLINICAL_DECISION",null,null,new Sla(30L,40L,20L),null,true)),"INVALID_SLA");}
 @Test void conditions(){errors(new Graph(branch().nodes(),branch().edges().subList(0,2)),"DECISION_OUTCOMES");errors(replace(new Node("review","Review",StageType.STAFF_TASK,"CONSULTANT","RECORD_CLINICAL_DECISION",new Condition("sql",true),null,null,null,true)),"INVALID_CONDITION");}
 @Test void deterministicBranches(){var yes=simulator.simulate(branch(),Map.of("PROPOSAL_ACCEPTED",true));assertThat(yes.outcome()).isEqualTo("COMPLETED");assertThat(yes.steps()).extracting(Step::nodeKey).containsExactly("start","decision","yes");assertThat(simulator.simulate(branch(),Map.of("PROPOSAL_ACCEPTED",true))).isEqualTo(yes);assertThat(simulator.simulate(branch(),Map.of("PROPOSAL_ACCEPTED",false)).steps()).extracting(Step::nodeKey).containsExactly("start","decision","no");assertThat(simulator.simulate(branch(),Map.of()).outcome()).isEqualTo("BLOCKED");}
 @Test void waiting(){var w=replace(new Node("review","Wait",StageType.WAIT,"SYSTEM",null,null,new Condition("PROFILE_COMPLETE",true),null,null,true));assertThat(simulator.simulate(w,Map.of()).outcome()).isEqualTo("WAITING");assertThat(simulator.simulate(w,Map.of("PROFILE_COMPLETE",true)).outcome()).isEqualTo("COMPLETED");}
}
