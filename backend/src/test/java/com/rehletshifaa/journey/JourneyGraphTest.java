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
 @Test void cycle(){var e=new ArrayList<>(linear().edges());e.add(edge("review","start"));errors(new Graph(linear().nodes(),e),"CYCLE");}
 @Test void invalidTerminal(){var e=new ArrayList<>(linear().edges());e.add(edge("end","review"));errors(new Graph(linear().nodes(),e),"END_OUTGOING");}
 @Test void incompatibleActor(){errors(replace(node("review",StageType.STAFF_TASK,"PATIENT","RECORD_CLINICAL_DECISION")),"ACTION_COMPATIBILITY");}
 @Test void timerSla(){errors(replace(new Node("review","Review",StageType.TIMER,"SYSTEM",null,null,null,new Sla(30L,40L,20L),-1L,true)),"INVALID_TIMER");errors(replace(new Node("review","Review",StageType.STAFF_TASK,"CONSULTANT","RECORD_CLINICAL_DECISION",null,null,new Sla(30L,40L,20L),null,true)),"INVALID_SLA");}
 @Test void conditions(){errors(new Graph(branch().nodes(),branch().edges().subList(0,2)),"DECISION_OUTCOMES");errors(replace(new Node("review","Review",StageType.STAFF_TASK,"CONSULTANT","RECORD_CLINICAL_DECISION",new Condition("sql",true),null,null,null,true)),"INVALID_CONDITION");}
 @Test void deterministicBranches(){var yes=simulator.simulate(branch(),Map.of("PROPOSAL_ACCEPTED",true));assertThat(yes.outcome()).isEqualTo("COMPLETED");assertThat(yes.steps()).extracting(Step::nodeKey).containsExactly("start","decision","yes");assertThat(simulator.simulate(branch(),Map.of("PROPOSAL_ACCEPTED",true))).isEqualTo(yes);assertThat(simulator.simulate(branch(),Map.of("PROPOSAL_ACCEPTED",false)).steps()).extracting(Step::nodeKey).containsExactly("start","decision","no");assertThat(simulator.simulate(branch(),Map.of()).outcome()).isEqualTo("BLOCKED");}
 @Test void waiting(){var w=replace(new Node("review","Wait",StageType.WAIT,"SYSTEM",null,null,new Condition("PROFILE_COMPLETE",true),null,null,true));assertThat(simulator.simulate(w,Map.of()).outcome()).isEqualTo("WAITING");assertThat(simulator.simulate(w,Map.of("PROFILE_COMPLETE",true)).outcome()).isEqualTo("COMPLETED");}
}
