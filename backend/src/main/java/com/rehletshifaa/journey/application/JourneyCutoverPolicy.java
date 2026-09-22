package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.application.JourneyCutoverProperties.Scope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Immutable, validated snapshot of the Phase 7B cutover configuration: the production-intake master switch plus
 * the scoped policies. Built once at startup; {@link #revision()} is a content hash stored on every admission so
 * an operator can reconstruct exactly which configuration admitted a case.
 *
 * <p>The only scope dimension is the case's care category, because it is the one intake attribute that is both
 * present at submission and validated against a managed catalog (see implementation-status.md Phase 7B). There is
 * no deny rule and no precedence between overlapping rules: overlap is rejected. Any invalid configuration makes
 * the whole set invalid and every admission falls back to legacy with {@code POLICY_CONFLICT} — never "the first
 * matching row wins".
 */
public final class JourneyCutoverPolicy {
    public record Rule(String id, boolean enabled, Scope scope, List<String> careCategories) {}

    private static final Pattern ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,59}");
    private static final Pattern SLUG = Pattern.compile("[a-z0-9][a-z0-9-]{0,59}");

    private final boolean masterEnabled;
    private final List<Rule> rules;
    private final List<String> problems;
    private final String revision;

    private JourneyCutoverPolicy(boolean masterEnabled, List<Rule> rules, List<String> problems) {
        this.masterEnabled = masterEnabled; this.rules = List.copyOf(rules); this.problems = List.copyOf(problems);
        this.revision = hash(masterEnabled, this.rules);
    }

    public static JourneyCutoverPolicy of(boolean masterEnabled, List<JourneyCutoverProperties.Policy> configured) {
        List<Rule> rules = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (var p : configured) {
            String id = p.getId() == null ? "" : p.getId().trim();
            List<String> categories = p.getCareCategories().stream().map(c -> c == null ? "" : c.trim()).distinct().sorted().toList();
            if (!ID.matcher(id).matches()) problems.add("INVALID_POLICY_ID");
            else if (!ids.add(id)) problems.add("DUPLICATE_POLICY_ID:" + id);
            if (p.getScope() == null) problems.add("MISSING_SCOPE:" + id);
            else if (p.getScope() == Scope.CARE_CATEGORY && categories.isEmpty()) problems.add("EMPTY_CARE_CATEGORIES:" + id);
            else if (p.getScope() == Scope.ALL_NEW_CASES && !categories.isEmpty()) problems.add("UNEXPECTED_CARE_CATEGORIES:" + id);
            if (categories.stream().anyMatch(c -> !SLUG.matcher(c).matches())) problems.add("INVALID_CARE_CATEGORY:" + id);
            rules.add(new Rule(id, p.isEnabled(), p.getScope(), categories));
        }
        rules.sort(Comparator.comparing(Rule::id));
        var enabled = rules.stream().filter(Rule::enabled).toList();
        if (enabled.stream().anyMatch(r -> r.scope() == Scope.ALL_NEW_CASES) && enabled.size() > 1) problems.add("OVERLAP:ALL_NEW_CASES");
        Map<String, String> owner = new HashMap<>();
        for (Rule r : enabled) for (String c : r.careCategories()) {
            String previous = owner.putIfAbsent(c, r.id());
            if (previous != null) problems.add("OVERLAP:" + c);
        }
        return new JourneyCutoverPolicy(masterEnabled, rules, problems.stream().distinct().sorted().toList());
    }

    /** The single enabled rule covering this care category, if any. Only meaningful when {@link #valid()}. */
    public Optional<Rule> match(String careCategory) {
        return rules.stream().filter(Rule::enabled)
                .filter(r -> r.scope() == Scope.ALL_NEW_CASES || (careCategory != null && r.careCategories().contains(careCategory)))
                .findFirst(); // overlap is rejected by construction, so at most one rule can match
    }

    public boolean masterEnabled() { return masterEnabled; }
    public boolean valid() { return problems.isEmpty(); }
    public List<Rule> rules() { return rules; }
    public List<String> problems() { return problems; }
    public String revision() { return revision; }

    private static String hash(boolean master, List<Rule> rules) {
        StringBuilder canonical = new StringBuilder("master=").append(master);
        for (Rule r : rules) canonical.append('|').append(r.id()).append(';').append(r.enabled()).append(';').append(r.scope()).append(';').append(String.join(",", r.careCategories()));
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    @Configuration
    @EnableConfigurationProperties(JourneyCutoverProperties.class)
    static class Config {
        @Bean JourneyCutoverPolicy journeyCutoverPolicy(JourneyCutoverProperties properties,
                @Value("${app.journey.runtime.production-intake-enabled:false}") boolean masterEnabled) {
            return of(masterEnabled, properties.getPolicies());
        }
    }
}
