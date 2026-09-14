package com.rehletshifaa.journey.domain;

import org.springframework.stereotype.Component;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

@Component
public class JourneyGraphValidator {
    private final JourneyStageRegistry registry;
    public JourneyGraphValidator(JourneyStageRegistry registry){this.registry=registry;}
    public Validation validate(Graph graph) {
        List<Issue> errors=new ArrayList<>(),warnings=new ArrayList<>();
        if(graph==null || graph.nodes().isEmpty() || graph.nodes().size()>200 || graph.edges().size()>400) {
            error(errors,"GRAPH_SIZE",null,"Use between 1 and 200 stages and at most 400 transitions.");
            return new Validation(errors,warnings);
        }
        Map<String,Node> nodes=new LinkedHashMap<>();
        for(Node n:graph.nodes()) {
            if(!key(n.key()) || nodes.putIfAbsent(n.key(),n)!=null) error(errors,"NODE_KEY",n.key(),"Each stage needs a unique stable key (letters, digits, underscore or hyphen).");
            if(n.label()==null || n.label().isBlank() || n.label().length()>120) error(errors,"NODE_LABEL",n.key(),"Give each stage a business name of at most 120 characters.");
            if(n.type()==null) {error(errors,"STAGE_TYPE",n.key(),"Choose a supported stage type.");continue;}
            ActorType actor=null;
            try {actor=ActorType.valueOf(n.actorType());}catch(Exception ignored){error(errors,"ACTOR_REQUIRED",n.key(),label(n)+" needs a supported actor type.");}
            boolean control=Set.of(StageType.START,StageType.END,StageType.DECISION,StageType.WAIT,StageType.TIMER).contains(n.type());
            if(control) {
                if(actor!=null && actor!=ActorType.SYSTEM) error(errors,"CONTROL_ACTOR",n.key(),label(n)+" must use the System actor.");
                if(n.action()!=null) error(errors,"CONTROL_ACTION",n.key(),label(n)+" cannot execute a business action.");
            } else {
                var cap=registry.find(n.action());
                if(cap.isEmpty()) error(errors,"UNSUPPORTED_ACTION",n.key(),label(n)+" needs a registered supported action.");
                else if(cap.get().stage()!=n.type() || actor==null || !cap.get().actors().contains(actor)) error(errors,"ACTION_COMPATIBILITY",n.key(),label(n)+" has an action incompatible with its stage or actor.");
            }
            condition(n.entry(),n.key(),errors);condition(n.exit(),n.key(),errors);
            if(n.type()==StageType.START || n.type()==StageType.END) {
                if(n.entry()!=null || n.exit()!=null || n.sla()!=null || n.timerMinutes()!=null) error(errors,"TERMINAL_METADATA",n.key(),label(n)+" cannot have blocking conditions, SLA or a timer.");
            }
            if(n.type()==StageType.TIMER ? !minutes(n.timerMinutes()) : n.timerMinutes()!=null) error(errors,"INVALID_TIMER",n.key(),label(n)+" needs a positive timer only on a Timer stage (maximum one year).");
            if(n.type()==StageType.WAIT && n.exit()==null) error(errors,"WAIT_CONDITION",n.key(),label(n)+" needs a registered exit condition describing the event to await.");
            if(n.sla()!=null) {
                Sla s=n.sla();
                if(!minutes(s.dueMinutes()) || (s.reminderMinutes()!=null && (!minutes(s.reminderMinutes()) || s.dueMinutes()==null || s.reminderMinutes()>=s.dueMinutes()))
                        || (s.escalationMinutes()!=null && (!minutes(s.escalationMinutes()) || s.dueMinutes()==null || s.escalationMinutes()<s.dueMinutes())))
                    error(errors,"INVALID_SLA",n.key(),label(n)+" needs a positive due time, a reminder before due and an escalation at or after due.");
            }
        }
        Map<String,List<Edge>> outgoing=new HashMap<>();Set<String> edgeKeys=new HashSet<>();
        for(Edge e:graph.edges()) {
            if(!key(e.key()) || !edgeKeys.add(e.key())) error(errors,"EDGE_KEY",e.from(),"Each transition needs a unique stable key.");
            if(!nodes.containsKey(e.from()) || !nodes.containsKey(e.to())) error(errors,"DANGLING_EDGE",e.from(),"Transition "+e.key()+" references a missing stage.");
            outgoing.computeIfAbsent(e.from(),k->new ArrayList<>()).add(e);condition(e.condition(),e.from(),errors);
        }
        List<Node> starts=nodes.values().stream().filter(n->n.type()==StageType.START).toList();
        if(starts.size()!=1) error(errors,"START_COUNT",null,"Choose exactly one Start stage.");
        for(Node n:nodes.values()) {
            var edges=outgoing.getOrDefault(n.key(),List.of());
            if(n.type()==StageType.START && graph.edges().stream().anyMatch(e->Objects.equals(e.to(),n.key()))) error(errors,"START_INCOMING",n.key(),"Start cannot have an incoming path.");
            if(n.type()==StageType.END) {if(!edges.isEmpty()) error(errors,"END_OUTGOING",n.key(),label(n)+" is an End stage and cannot have an outgoing path.");}
            else if(n.type()==StageType.DECISION) {
                if(edges.size()!=2 || edges.stream().anyMatch(e->e.condition()==null) || !complementary(edges)) error(errors,"DECISION_OUTCOMES",n.key(),label(n)+" needs both Yes and No paths for the same supported fact.");
            } else if(edges.size()!=1 || edges.getFirst().condition()!=null) error(errors,"OUTGOING_PATH",n.key(),label(n)+(edges.isEmpty()?" has no outgoing path.":" needs one unconditional outgoing path; use a Decision for branches."));
        }
        Set<String> reachable=new HashSet<>();
        if(starts.size()==1) walk(starts.getFirst().key(),outgoing,reachable);
        for(Node n:nodes.values()) if(!reachable.contains(n.key())) error(errors,"UNREACHABLE",n.key(),label(n)+" cannot be reached from Start.");
        Set<String> completable=new HashSet<>();nodes.values().stream().filter(n->n.type()==StageType.END).forEach(n->completable.add(n.key()));
        boolean changed;do {changed=false;for(Edge e:graph.edges()) if(completable.contains(e.to())) changed|=completable.add(e.from());}while(changed);
        for(Node n:nodes.values()) if(!completable.contains(n.key())) error(errors,"NO_COMPLETION",n.key(),label(n)+" has no path to completion.");
        Set<String> visited=new HashSet<>(),active=new HashSet<>();
        for(String k:nodes.keySet()) if(cycle(k,outgoing,visited,active)) {error(errors,"CYCLE",k,"This journey contains a loop. Phase 4A requires acyclic paths; recovery loops need a governed runtime policy.");break;}
        warnings.add(new Issue("RUNTIME_NOT_DEPLOYED",null,"This configuration is a dry-run domain model; existing cases continue using the current journey."));
        return new Validation(List.copyOf(errors),List.copyOf(warnings));
    }
    private boolean complementary(List<Edge> edges){
        if(edges.size()!=2 || edges.get(0).condition()==null || edges.get(1).condition()==null)return false;
        var a=edges.get(0).condition();var b=edges.get(1).condition();
        return Objects.equals(a.fact(),b.fact()) && a.equalsValue()!=null && b.equalsValue()!=null && !a.equalsValue().equals(b.equalsValue());
    }
    private void condition(Condition c,String node,List<Issue> errors){if(c==null)return;try{Fact.valueOf(c.fact());if(c.equalsValue()==null)throw new IllegalArgumentException();}catch(Exception ignored){error(errors,"INVALID_CONDITION",node,"Choose a supported business fact and a Yes or No value.");}}
    private static boolean key(String s){return s!=null && s.matches("[A-Za-z][A-Za-z0-9_-]{0,59}");}
    private static boolean minutes(Long n){return n!=null && n>0 && n<=525600;}
    private static String label(Node n){return n.label()==null?"Stage":n.label();}
    private static void error(List<Issue> errors,String code,String node,String message){errors.add(new Issue(code,node,message));}
    private void walk(String k,Map<String,List<Edge>> edges,Set<String> seen){if(!seen.add(k))return;for(Edge e:edges.getOrDefault(k,List.of()))walk(e.to(),edges,seen);}
    private boolean cycle(String k,Map<String,List<Edge>> edges,Set<String> visited,Set<String> active){
        if(active.contains(k))return true;if(!visited.add(k))return false;active.add(k);
        for(Edge e:edges.getOrDefault(k,List.of()))if(cycle(e.to(),edges,visited,active))return true;
        active.remove(k);return false;
    }
}
