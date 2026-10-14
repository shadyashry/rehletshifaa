package com.rehletshifaa.conversation.application;

import com.rehletshifaa.shared.metrics.AfterCommit;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * P1-8 (E-05): the conversation module's business meters, all registered here. Tags are low-cardinality only; never
 * conversation or case ids, phone numbers, subjects or names.
 * <ul>
 *   <li>{@code conversation.reply.timer.breach}: reply timers that passed their escalation deadline and escalated, by
 *       {@code conversation} (case: the patient's secure case thread, intake: a WhatsApp intake conversation) and {@code step}
 *       (lead: the owner's team lead was alerted, managers: nobody owns it or the owner has no lead, so the Care
 *       Coordination Managers were).</li>
 * </ul>
 * Counters count after commit, so a rolled-back sweep counts nothing.
 */
@Component
public class ConversationMetrics {
    public static final String CASE = "case", INTAKE = "intake", LEAD = "lead", MANAGERS = "managers";

    private final MeterRegistry registry;

    public ConversationMetrics(MeterRegistry registry) {
        this.registry = registry;
        for (String conversation : List.of(CASE, INTAKE)) for (String step : List.of(LEAD, MANAGERS)) breach(conversation, step);
    }

    /** {@code conversation}: case or intake; {@code step}: lead or managers. */
    public void replyTimerBreached(String conversation, String step) { Counter counter = breach(conversation, step); AfterCommit.run(counter::increment); }

    private Counter breach(String conversation, String step) {
        return Counter.builder("conversation.reply.timer.breach").description("Reply timers that passed their deadline and escalated")
                .tag("conversation", conversation).tag("step", step).register(registry);
    }
}
