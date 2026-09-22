package com.rehletshifaa.journey.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Phase 7B cutover policies, deployment-controlled like every other {@code app.journey.runtime.*} switch.
 * Binding happens once at startup; a policy change is a reviewed configuration change plus restart, never a
 * runtime mutation, so one admission can never observe two policy states.
 *
 * <pre>
 * app.journey.cutover.policies[0].id=cardiology-pilot
 * app.journey.cutover.policies[0].enabled=true
 * app.journey.cutover.policies[0].scope=CARE_CATEGORY
 * app.journey.cutover.policies[0].care-categories=cardiology
 * </pre>
 */
@ConfigurationProperties(prefix = "app.journey.cutover")
public class JourneyCutoverProperties {
    public enum Scope { CARE_CATEGORY, ALL_NEW_CASES }

    private final List<Policy> policies = new ArrayList<>();

    public List<Policy> getPolicies() { return policies; }

    public static class Policy {
        private String id;
        private boolean enabled;
        private Scope scope;
        private List<String> careCategories = new ArrayList<>();

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public Scope getScope() { return scope; }
        public void setScope(Scope scope) { this.scope = scope; }
        public List<String> getCareCategories() { return careCategories; }
        public void setCareCategories(List<String> careCategories) { this.careCategories = careCategories == null ? new ArrayList<>() : careCategories; }
    }
}
