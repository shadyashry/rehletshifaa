package com.rehletshifaa.journey.domain;

import org.springframework.stereotype.Component;
import java.util.*;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

/** Pure synthetic evaluator: intentionally has no repository, clock, notification or domain-action dependencies. */
@Component
public class JourneySimulator {
    private final JourneyGraphValidator validator;
    public JourneySimulator(JourneyGraphValidator validator){this.validator=validator;}
    public Simulation simulate(Graph graph,Map<String,Boolean> facts) {
        Validation validation=validator.validate(graph);
        if(!validation.valid())return new Simulation("INVALID",List.of(),validation);
        Map<String,Boolean> inputs=facts==null?Map.of():facts;
        if(inputs.entrySet().stream().anyMatch(e->!validFact(e.getKey()) || e.getValue()==null))
            return new Simulation("INVALID",List.of(),new Validation(List.of(new Issue("INVALID_INPUT",null,"Supply only supported boolean synthetic facts.")),validation.warnings()));
        Map<String,Node> nodes=new HashMap<>();graph.nodes().forEach(n->nodes.put(n.key(),n));
        Node current=graph.nodes().stream().filter(n->n.type()==StageType.START).findFirst().orElseThrow();
        List<Step> steps=new ArrayList<>();
        // A validated graph may now contain a bounded recovery cycle (technical-decisions.md §22). This
        // evaluator supplies one static fact set for the whole dry run, so a loop-back branch that the
        // supplied facts satisfy is retaken identically forever — the real runtime differs because a fact
        // like CONSULTANT_ACCEPTED is explicitly reset and re-signaled between passes. Cap total steps well
        // above any legitimate acyclic or once-around-the-loop path so an admin's synthetic fact choice can
        // never hang the server; report it as a distinct, honest outcome rather than a silent BLOCKED.
        int loopGuard=graph.nodes().size()*3+50;
        while(true) {
            if(steps.size()>loopGuard)return finish("LOOP_LIMIT_EXCEEDED",current,steps,validation);
            if(!matches(current.entry(),inputs))return finish("BLOCKED",current,steps,validation);
            if(current.type()==StageType.TIMER) steps.add(step(current,"WAITING_TIMER:"+current.timerMinutes()+"m"));
            else if(current.type()==StageType.WAIT) steps.add(step(current,"WAITING"));
            else steps.add(step(current,"EXPECTED"));
            if(!matches(current.exit(),inputs))return finish(current.type()==StageType.WAIT?"WAITING":"BLOCKED",current,steps,validation);
            if(current.type()==StageType.END)return new Simulation("COMPLETED",List.copyOf(steps),validation);
            String key=current.key();
            List<Edge> candidates=graph.edges().stream().filter(e->e.from().equals(key) && matches(e.condition(),inputs)).toList();
            if(candidates.size()!=1)return finish("BLOCKED",current,steps,validation);
            current=nodes.get(candidates.getFirst().to());
        }
    }
    private boolean validFact(String fact){try{Fact.valueOf(fact);return true;}catch(Exception e){return false;}}
    private boolean matches(Condition c,Map<String,Boolean> facts){return c==null || (facts.containsKey(c.fact()) && Objects.equals(facts.get(c.fact()),c.equalsValue()));}
    private Step step(Node n,String state){return new Step(n.key(),n.label(),n.actorType(),n.action(),state);}
    private Simulation finish(String state,Node n,List<Step> steps,Validation validation){steps.add(step(n,state));return new Simulation(state,List.copyOf(steps),validation);}
}
