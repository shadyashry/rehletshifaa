package com.rehletshifaa.journey;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Phase 7A — the out-of-the-box default (no {@code app.journey.runtime.*} property set at all, matching a
 * real unconfigured deployment). Real public intake must behave exactly as it did before this session,
 * with zero Journey involvement, whether or not a {@code JourneyRuntimePort} bean even exists.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
class JourneyProductionIntakeDisabledTest {
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;

    @Test void defaultConfigurationLeavesRealIntakeCompletelyUnboundFromJourney() {
        var created = cases.create(new CreateCaseRequest("Real", "Patient", "AE", "+971500000003", "Default configuration intake", "en", true, null));
        var submitted = cases.submit(created.caseId());

        assertThat(submitted.status()).isEqualTo("RECEIVED"); // legacy behavior is fully intact
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_case_bindings WHERE case_id=?", Integer.class, created.caseId()))
                .as("no Journey binding is ever created when the intake flag is off (the default)").isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_case_admissions WHERE case_id=?", Integer.class, created.caseId()))
                .as("master off records no admission evidence either: legacy is unevaluated, not decided").isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action LIKE '%ADMISSION%'", Integer.class, created.caseId().toString())).isZero();
    }

    @Test void anonymousSubmissionRequiresTheExactUnconsumedCreatorGrant() {
        var created=cases.create(new CreateCaseRequest("Grant", "Bound", "AE", "+971500000004", "Grant security", "en", true, null));
        var foreign=cases.create(new CreateCaseRequest("Other", "Draft", "AE", "+971500000005", "Cross-case check", "en", true, null));
        assertThat(created.intakeGrant()).isNotBlank();
        assertThatThrownBy(()->cases.submitPublic(created.caseId(),"wrong-grant")).hasMessageContaining("not found");
        assertThatThrownBy(()->cases.submitPublic(foreign.caseId(),created.intakeGrant())).hasMessageContaining("not found");
        assertThat(cases.findById(created.caseId()).getStatus().name()).isEqualTo("DRAFT");
        assertThat(cases.submitPublic(created.caseId(),created.intakeGrant()).status()).isEqualTo("RECEIVED");
        assertThatThrownBy(()->cases.submitPublic(created.caseId(),created.intakeGrant())).hasMessageContaining("not found");
    }
}
