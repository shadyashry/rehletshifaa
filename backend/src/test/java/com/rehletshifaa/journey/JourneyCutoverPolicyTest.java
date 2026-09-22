package com.rehletshifaa.journey;

import com.rehletshifaa.journey.application.JourneyCutoverPolicy;
import com.rehletshifaa.journey.application.JourneyCutoverProperties;
import com.rehletshifaa.journey.application.JourneyCutoverProperties.Scope;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** Phase 7B policy snapshot: validation, deterministic matching, overlap rejection, stable revision. */
class JourneyCutoverPolicyTest {
    static JourneyCutoverProperties.Policy policy(String id, boolean enabled, Scope scope, String... categories) {
        var p = new JourneyCutoverProperties.Policy();
        p.setId(id); p.setEnabled(enabled); p.setScope(scope); p.setCareCategories(List.of(categories));
        return p;
    }

    @Test void noPolicyMatchesNothing() {
        var set = JourneyCutoverPolicy.of(true, List.of());
        assertThat(set.valid()).isTrue();
        assertThat(set.match("cardiology")).isEmpty();
        assertThat(set.match(null)).isEmpty();
    }

    @Test void careCategoryPolicyMatchesOnlyItsEnabledCategories() {
        var set = JourneyCutoverPolicy.of(true, List.of(policy("cardio", true, Scope.CARE_CATEGORY, "cardiology"),
                policy("ortho", false, Scope.CARE_CATEGORY, "orthopedics")));
        assertThat(set.valid()).isTrue();
        assertThat(set.match("cardiology")).get().extracting(JourneyCutoverPolicy.Rule::id).isEqualTo("cardio");
        assertThat(set.match("orthopedics")).as("disabled policy never matches").isEmpty();
        assertThat(set.match("rheumatology-rehabilitation")).isEmpty();
        assertThat(set.match(null)).as("uncategorized case is not covered by a category policy").isEmpty();
    }

    @Test void allNewCasesCoversUncategorizedCases() {
        var set = JourneyCutoverPolicy.of(true, List.of(policy("all", true, Scope.ALL_NEW_CASES)));
        assertThat(set.match(null)).isPresent();
        assertThat(set.match("orthopedics")).isPresent();
    }

    @Test void overlappingEnabledPoliciesAreRejectedNotResolvedByOrder() {
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", true, Scope.CARE_CATEGORY, "cardiology"),
                policy("b", true, Scope.CARE_CATEGORY, "cardiology", "orthopedics"))).problems()).containsExactly("OVERLAP:cardiology");
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("all", true, Scope.ALL_NEW_CASES),
                policy("b", true, Scope.CARE_CATEGORY, "orthopedics"))).problems()).containsExactly("OVERLAP:ALL_NEW_CASES");
        // A disabled duplicate scope is not an overlap: only enabled policies can admit.
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", true, Scope.CARE_CATEGORY, "cardiology"),
                policy("b", false, Scope.CARE_CATEGORY, "cardiology"))).valid()).isTrue();
    }

    @Test void malformedConfigurationIsInvalid() {
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", true, Scope.CARE_CATEGORY, "x"), policy("a", false, Scope.CARE_CATEGORY, "y"))).problems())
                .containsExactly("DUPLICATE_POLICY_ID:a");
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("Bad Id", true, Scope.ALL_NEW_CASES))).problems()).containsExactly("INVALID_POLICY_ID");
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", true, null))).problems()).containsExactly("MISSING_SCOPE:a");
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", true, Scope.CARE_CATEGORY))).problems()).containsExactly("EMPTY_CARE_CATEGORIES:a");
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", true, Scope.ALL_NEW_CASES, "cardiology"))).problems()).containsExactly("UNEXPECTED_CARE_CATEGORIES:a");
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", true, Scope.CARE_CATEGORY, "DROP TABLE"))).problems()).containsExactly("INVALID_CARE_CATEGORY:a");
    }

    @Test void revisionIsContentAddressedAndOrderIndependent() {
        var one = JourneyCutoverPolicy.of(true, List.of(policy("a", true, Scope.CARE_CATEGORY, "cardiology", "orthopedics"), policy("b", false, Scope.ALL_NEW_CASES)));
        var same = JourneyCutoverPolicy.of(true, List.of(policy("b", false, Scope.ALL_NEW_CASES), policy("a", true, Scope.CARE_CATEGORY, "orthopedics", "cardiology")));
        assertThat(same.revision()).isEqualTo(one.revision()).hasSize(64);
        assertThat(JourneyCutoverPolicy.of(false, List.of(policy("a", true, Scope.CARE_CATEGORY, "cardiology", "orthopedics"), policy("b", false, Scope.ALL_NEW_CASES))).revision())
                .as("master switch is part of the revision").isNotEqualTo(one.revision());
        assertThat(JourneyCutoverPolicy.of(true, List.of(policy("a", false, Scope.CARE_CATEGORY, "cardiology", "orthopedics"), policy("b", false, Scope.ALL_NEW_CASES))).revision())
                .as("enabling/disabling changes the revision").isNotEqualTo(one.revision());
    }
}
