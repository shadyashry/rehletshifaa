package com.rehletshifaa.journey.application;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Deterministic action-key to {@link JourneyActionHandler} lookup, built once from every registered handler
 * bean. Two handlers registering the same action key fail application startup (ambiguous configuration),
 * never a runtime coin-flip. An action with no registered handler fails closed before any domain call or
 * runtime advancement — the caller (JourneyProjectionService) never opens a WorkItem/PatientAction or
 * advances the engine for it.
 */
@Component
public class JourneyActionDispatcher {
    private final Map<String, JourneyActionHandler> handlers;

    public JourneyActionDispatcher(List<JourneyActionHandler> registered) {
        this.handlers = registered.stream().collect(Collectors.toMap(JourneyActionHandler::actionKey, h -> h));
    }

    public UUID open(String actionKey, JourneyActionHandler.OpenContext context) {
        return handler(actionKey).open(context);
    }

    public void complete(String actionKey, JourneyActionHandler.CompleteContext context) {
        handler(actionKey).complete(context);
    }

    public boolean supports(String actionKey) {
        return handlers.containsKey(actionKey);
    }

    private JourneyActionHandler handler(String actionKey) {
        var handler = handlers.get(actionKey);
        if (handler == null)
            throw new ApiException(422, "JOURNEY_ACTION_HANDLER_MISSING", "No registered domain handler for Journey action " + actionKey + ".");
        return handler;
    }
}
