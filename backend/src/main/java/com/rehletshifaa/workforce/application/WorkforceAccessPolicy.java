package com.rehletshifaa.workforce.application;

/**
 * WF-15 port: the workforce module asks the platform authority resolver (implemented in {@code access.platform})
 * whether the current request may administer workforce data. Keeps {@code workforce} free of an access dependency.
 */
public interface WorkforceAccessPolicy {
    enum Action { READ }

    /** @param basis the database rule that granted the action, recorded in audit */
    record Authorized(String subject, String basis) {}

    /** Throws the endpoint's {@code ApiException} when denied. */
    Authorized require(Action action);

    /** WF-10: the current request is the manager of {@code function}; the function comes from server records, never the browser. */
    Authorized requireFunctionManager(String function);
}
