package com.rehletshifaa.journey.domain;

import org.springframework.stereotype.Component;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

@Component
public class JourneyGraphValidator {
    /** Stage service levels (due / reminder / escalation) are modelled but not projected by the runtime. */
    public static final boolean SLA_SUPPORTED = false;
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
                // QA-04: the runtime cannot project deadlines yet, so the designer must not accept one it can never compile.
                if(!SLA_SUPPORTED) error(errors,"SLA_NOT_SUPPORTED",n.key(),label(n)+" has a service level, but deadlines are not enforced by the runtime yet; remove it.");
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
        if(starts.size()==1) validateCycles(starts.getFirst().key(),outgoing,nodes,errors);
        if(starts.size()==1) validatePrerequisites(starts.getFirst().key(),nodes,graph.edges(),reachable,warnings);
        warnings.add(new Issue("RUNTIME_NOT_DEPLOYED",null,"This configuration is a dry-run domain model; existing cases continue using the current journey."));
        return new Validation(List.copyOf(errors),List.copyOf(warnings));
    }
    /**
     * Bounded recovery-cycle policy (technical-decisions.md §22). Phase 4A rejected every cycle outright; a
     * governed loop is now allowed only when it is an explicit, human-gated, escapable business recovery —
     * never a general scripting/looping construct. A back-edge (one whose target is still on the current
     * depth-first path, i.e. an ancestor of the node it is drawn from) is REJECTED unless all of:
     * <ul>
     * <li>it is not a self-loop (its source and target differ) — {@code CYCLE_SELF_LOOP};</li>
     * <li>it originates from a Decision stage on a supported business fact, so re-entry is an explicit
     * branch decided by an already-validated condition, never an unconditional/automatic transition —
     * {@code CYCLE_UNGATED};</li>
     * <li>the cycle (every node between the back-edge's target and its source, inclusive) contains at
     * least one Staff or Patient action, so a human business step is required before the loop can be
     * traversed again — a Decision-only or System-only loop could spin without any external input —
     * {@code CYCLE_NO_HUMAN_ACTION}.</li>
     * </ul>
     * A cycle that passes all three still needs an escape: that is already guaranteed by the existing
     * {@code NO_COMPLETION} backward-reachability check above, which requires every node (cycle members
     * included) to have a path to an End stage — a trap with no exit is rejected there, not here.
     */
    private void validateCycles(String start,Map<String,List<Edge>> outgoing,Map<String,Node> nodes,List<Issue> errors){
        Deque<String> stack=new ArrayDeque<>();Set<String> onStack=new HashSet<>(),visited=new HashSet<>();
        walkCycles(start,outgoing,nodes,stack,onStack,visited,errors);
    }
    private void walkCycles(String k,Map<String,List<Edge>> outgoing,Map<String,Node> nodes,
            Deque<String> stack,Set<String> onStack,Set<String> visited,List<Issue> errors){
        stack.push(k);onStack.add(k);visited.add(k);
        for(Edge e:outgoing.getOrDefault(k,List.of())){
            if(!nodes.containsKey(e.to()))continue;
            if(onStack.contains(e.to())) validateBackEdge(e,nodes,stack,errors);
            else if(!visited.contains(e.to())) walkCycles(e.to(),outgoing,nodes,stack,onStack,visited,errors);
        }
        stack.pop();onStack.remove(k);
    }
    private void validateBackEdge(Edge e,Map<String,Node> nodes,Deque<String> stack,List<Issue> errors){
        if(e.from().equals(e.to())) {error(errors,"CYCLE_SELF_LOOP",e.from(),label(nodes.get(e.from()))+" cannot transition back to itself.");return;}
        Node source=nodes.get(e.from());
        if(source.type()!=StageType.DECISION) {error(errors,"CYCLE_UNGATED",e.from(),"A recovery loop must branch from a Decision stage on a supported business fact; "+label(source)+" cannot re-enter an earlier stage directly.");return;}
        List<String> path=new ArrayList<>(stack);
        int toIndex=path.indexOf(e.to());
        boolean human=false;
        for(int i=0;i<=toIndex;i++){StageType t=nodes.get(path.get(i)).type();if(t==StageType.STAFF_TASK||t==StageType.PATIENT_ACTION){human=true;break;}}
        if(!human) error(errors,"CYCLE_NO_HUMAN_ACTION",e.from(),"A recovery loop must include at least one staff or patient action; an automatic loop between system/decision stages alone is not permitted.");
    }
    /**
     * QA-06: an action whose domain service needs an earlier action (a prepared proposal before release, a request
     * before the patient answers) is flagged unless that action is on every path from Start (a warning: see
     * {@link JourneyStageRegistry.Capability}). Must-happen-before is a forward
     * "available actions" analysis: the set guaranteed on entry to a stage is the intersection, over its incoming
     * transitions, of what its predecessor guarantees plus the predecessor's own action. Loops converge because the
     * sets only shrink.
     */
    private void validatePrerequisites(String start,Map<String,Node> nodes,List<Edge> edges,Set<String> reachableKeys,List<Issue> warnings){
        Set<String> reachable=new HashSet<>(reachableKeys);reachable.retainAll(nodes.keySet()); // a dangling edge is reported elsewhere
        Map<String,List<String>> incoming=new HashMap<>();
        for(Edge e:edges) if(nodes.containsKey(e.from()) && nodes.containsKey(e.to()) && reachable.contains(e.from())) incoming.computeIfAbsent(e.to(),k->new ArrayList<>()).add(e.from());
        Set<String> universe=new HashSet<>();nodes.values().forEach(n->{if(n.action()!=null)universe.add(n.action());});
        Map<String,Set<String>> before=new HashMap<>();
        for(String k:reachable) before.put(k,k.equals(start)?new HashSet<>():new HashSet<>(universe));
        boolean changed;
        do{changed=false;
            for(String k:reachable){
                if(k.equals(start))continue;
                Set<String> in=null;
                for(String p:incoming.getOrDefault(k,List.of())){
                    Set<String> out=new HashSet<>(before.get(p));
                    if(nodes.get(p).action()!=null)out.add(nodes.get(p).action());
                    if(in==null)in=out;else in.retainAll(out);
                }
                if(in==null)in=new HashSet<>();
                if(!in.equals(before.get(k))){before.put(k,in);changed=true;}
            }
        }while(changed);
        for(String k:reachable){
            Node n=nodes.get(k);
            if(n.action()==null)continue;
            var cap=registry.find(n.action());
            if(cap.isEmpty())continue;
            for(String needed:cap.get().dependsOn()) if(!before.get(k).contains(needed))
                warnings.add(new Issue("ACTION_PREREQUISITE",k,label(n)+" needs "+actionLabel(needed)+" to have happened first; it is not earlier on every path from Start, so a case will stop here unless that work is done outside this journey."));
        }
    }
    private String actionLabel(String key){return registry.find(key).map(c->"\""+c.label()+"\"").orElse(key);}
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
}
