package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.api.ApiException;

/**
 * P1-10 session 1 (review B-03, A-08, B-05; owner decisions 2026-10-15): the coordination and guarantee fee as its own line with the
 * totals and deposit unchanged, the no-surprise cap compared in EGP, the 24-hour cooling period on both decision paths, final-quote
 * validity from the commercial policy, and the FX band with Finance's re-approval.
 */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class FinalQuoteRulesTest {
    @Autowired CaseService cases;
    @Autowired JourneyService journey;
    @Autowired ProposalQueryService proposalQueries;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager entityManager;
    @Autowired CommercialPolicyService commercialPolicies;
    @Autowired com.rehletshifaa.casemanagement.application.IntakeLifecycleService intakeLifecycle;
    @Autowired ObjectMapper json;

    private static final AtomicInteger COUNTER = new AtomicInteger(1000);

    @AfterEach void clearSecurity(){SecurityContextHolder.clearContext();}

    record Estimate(UUID caseId, UUID versionId, List<UUID> serviceIds) {}

    @Test void fixtureBuildsAnAcceptedEstimateAndAFinalAssessment() {
        Estimate estimate = acceptedEstimate("EGP", new BigDecimal("10000.00"), new BigDecimal("5000.00"));
        UUID reviewId = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        assertThat(reviewId).isNotNull();
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, estimate.versionId())).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, estimate.caseId())).isEqualTo("ARRIVAL_CONFIRMED");
    }

    // --- 1. Fee line (D-A) ---

    /** The rule this phase replaced: every line marked up by (1 + rate) and rounded, the totals summed from the marked-up lines. */
    private static BigDecimal[] legacyTotals(BigDecimal rate, BigDecimal... prices) {
        BigDecimal markup = BigDecimal.ONE.add(rate), total = BigDecimal.ZERO, provider = BigDecimal.ZERO;
        for (BigDecimal p : prices) { total = total.add(p.multiply(markup).setScale(2, java.math.RoundingMode.HALF_UP)); provider = provider.add(p); }
        return new BigDecimal[]{total, provider.multiply(rate).setScale(2, java.math.RoundingMode.HALF_UP)};
    }

    @Test void theFeeIsItsOwnLastLineAndTheTotalsMarginAndDepositStayAsBefore() {
        BigDecimal a = new BigDecimal("10000.00"), b = new BigDecimal("2500.00");
        Estimate estimate = acceptedEstimate("EGP", a, b);
        var rows = lines(estimate.versionId());
        assertThat(rows).hasSize(3);
        // Medical lines at the provider's own price (unit = provider = range).
        for (int i = 0; i < 2; i++) {
            var row = rows.get(i);
            assertThat(row.get("CATEGORY")).isEqualTo("MEDICAL");
            assertThat((BigDecimal) row.get("UNIT_PRICE_EGP")).isEqualByComparingTo((BigDecimal) row.get("PROVIDER_PRICE_EGP"));
            assertThat((BigDecimal) row.get("UNIT_PRICE_MIN_EGP")).isEqualByComparingTo((BigDecimal) row.get("PROVIDER_PRICE_EGP"));
            assertThat((BigDecimal) row.get("UNIT_PRICE_MAX_EGP")).isEqualByComparingTo((BigDecimal) row.get("PROVIDER_PRICE_EGP"));
        }
        assertThat((BigDecimal) rows.get(0).get("UNIT_PRICE_EGP")).isEqualByComparingTo(a);
        // One fee line, sorted last, never optional: 15% of the provider total (12,500).
        var fee = rows.get(2);
        assertThat(fee.get("CATEGORY")).isEqualTo("PLATFORM_FEE");
        assertThat(fee.get("SOURCE")).isEqualTo("PLATFORM");
        assertThat(fee.get("DESCRIPTION")).isEqualTo("Coordination and guarantee fee");
        assertThat(fee.get("OPTIONAL")).isEqualTo(false);
        assertThat((BigDecimal) fee.get("UNIT_PRICE_EGP")).isEqualByComparingTo("1875.00");
        assertThat((BigDecimal) fee.get("UNIT_PRICE_MIN_EGP")).isEqualByComparingTo("1875.00");
        assertThat((BigDecimal) fee.get("UNIT_PRICE_MAX_EGP")).isEqualByComparingTo("1875.00");
        assertThat((BigDecimal) fee.get("PROVIDER_PRICE_EGP")).isEqualByComparingTo("0");
        // Before/after on the same inputs: the patient total and the margin are the figures the old per-line markup produced.
        BigDecimal[] before = legacyTotals(new BigDecimal("0.15"), a, b);
        assertThat(egpColumn(estimate.versionId(), "patient_total_expected_egp")).isEqualByComparingTo(before[0]).isEqualByComparingTo("14375.00");
        assertThat(egpColumn(estimate.versionId(), "patient_total_min_egp")).isEqualByComparingTo(before[0]);
        assertThat(egpColumn(estimate.versionId(), "patient_total_max_egp")).isEqualByComparingTo(before[0]);
        assertThat(egpColumn(estimate.versionId(), "margin_amount_egp")).isEqualByComparingTo(before[1]).isEqualByComparingTo("1875.00");
        assertThat(egpColumn(estimate.versionId(), "provider_net_egp")).isEqualByComparingTo("12500.00");
        // The deposit is a share of that same expected total, so it is the figure it was (15% of 14,375 → 2,200 after rounding up to EGP 100).
        var depositBefore = DepositCalculator.compute(new BigDecimal("0.15"), null, null, before[0], "EGP", BigDecimal.ONE, null);
        var depositAfter = DepositCalculator.compute(new BigDecimal("0.15"), null, null, egpColumn(estimate.versionId(), "patient_total_expected_egp"), "EGP", BigDecimal.ONE, null);
        assertThat(depositAfter.egp()).isEqualByComparingTo(depositBefore.egp()).isEqualByComparingTo("2200.00");
    }

    @Test void aRangeAndAForeignCurrencyKeepTheirFiguresAndTheConsultantSeesOnlyTheirOwnPrice() {
        Estimate estimate = acceptedEstimate("USD", new BigDecimal("8000.00"));
        jdbc.update("UPDATE proposal_items SET unit_price_min_egp=7000.00, unit_price_max_egp=11000.00 WHERE proposal_version_id=? AND category='MEDICAL'", estimate.versionId());
        assertThat(ProposalPricing.of(List.of(ProposalPricing.ProviderLine.of(new BigDecimal("8000.00"), new BigDecimal("7000.00"), new BigDecimal("11000.00"))), new BigDecimal("0.15")))
                .satisfies(t -> {
                    assertThat(t.patientMin()).isEqualByComparingTo(legacyTotals(new BigDecimal("0.15"), new BigDecimal("7000.00"))[0]);
                    assertThat(t.patientExpected()).isEqualByComparingTo(legacyTotals(new BigDecimal("0.15"), new BigDecimal("8000.00"))[0]);
                    assertThat(t.patientMax()).isEqualByComparingTo(legacyTotals(new BigDecimal("0.15"), new BigDecimal("11000.00"))[0]);
                });
        // USD display at 0.02: 8,000 → 160.00 and the fee 1,200 → 24.00, summing to the 184.00 the marked-up line showed (9,200 × 0.02).
        var rows = lines(estimate.versionId());
        assertThat((BigDecimal) rows.get(0).get("UNIT_PRICE")).isEqualByComparingTo("160.00");
        assertThat((BigDecimal) rows.get(1).get("UNIT_PRICE")).isEqualByComparingTo("24.00");
        // Staff see the fee line; the Consultant sees only their own line at their own price.
        asCoordinator();
        assertThat(journey.workspace(estimate.caseId()).proposal().items()).extracting(ProposalItemView::category).containsExactly("MEDICAL", "PLATFORM_FEE");
        asDoctor();
        var consultantItems = journey.workspace(estimate.caseId()).proposal().items();
        assertThat(consultantItems).extracting(ProposalItemView::category).containsExactly("MEDICAL");
        assertThat(consultantItems.get(0).unitPrice()).isEqualByComparingTo("160.00");
    }

    @Test void theReleasedFinalQuoteDocumentListsTheFee() {
        Estimate estimate = acceptedEstimate("EGP", new BigDecimal("10000.00"));
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", null, null));
        journey.releaseFinalQuote(estimate.caseId(), fq.versionId());
        String html = jdbc.queryForObject("SELECT html_snapshot FROM proposal_versions WHERE id=?", String.class, fq.versionId());
        assertThat(html).contains("<li>Coordination and guarantee fee — 1500.0000 EGP</li>");
        assertThat(egpColumn(fq.versionId(), "patient_total_expected_egp")).isEqualByComparingTo("11500.00");
    }

    // --- 2. No-surprise cap and cooling period (A-08) ---

    @Test void aFinalQuoteAboveTheAcceptedMaximumNeedsAScopeChangeReasonWhichThePatientSees() {
        Estimate estimate = acceptedEstimate("EGP", new BigDecimal("10000.00")); // maximum 11,500
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("12000.00")); // 13,800 expected
        asCoordinator();
        var refused = catchThrowableOfType(() -> journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", "  ", null)), ApiException.class);
        assertThat(refused.status()).isEqualTo(409);
        assertThat(refused.code()).isEqualTo("SCOPE_CHANGE_REASON_REQUIRED");
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", "A second stent is needed after the angiogram", null));
        assertThat(jdbc.queryForObject("SELECT above_estimate_maximum FROM proposal_versions WHERE id=?", Boolean.class, fq.versionId())).isTrue();
        assertThat(fq.scopeChangeReason()).isEqualTo("A second stent is needed after the angiogram");
        // At or under the maximum, no reason is needed and nothing is flagged.
        UUID lower = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        var within = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(lower, "EGP", null, null));
        assertThat(jdbc.queryForObject("SELECT above_estimate_maximum FROM proposal_versions WHERE id=?", Boolean.class, within.versionId())).isFalse();
    }

    @Test void theCapIsComparedInEgpSoACurrencyMoveAloneNeverTripsIt() {
        Estimate estimate = acceptedEstimate("USD", new BigDecimal("10000.00")); // 230.00 USD at 0.02, EGP maximum 11,500
        rate("USD", "0.03"); // the pound weakened: the same EGP total is 345.00 USD today
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "USD", null, null));
        assertThat(jdbc.queryForObject("SELECT above_estimate_maximum FROM proposal_versions WHERE id=?", Boolean.class, fq.versionId())).isFalse();
    }

    @Test void aQuoteAboveTheMaximumOpensForSignedInAcceptanceTwentyFourHoursAfterRelease() {
        var fq = releasedAboveMaximum();
        asPatient();
        var early = catchThrowableOfType(() -> journey.decideProposal(fq.caseId(), fq.versionId(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)), ApiException.class);
        assertThat(early.status()).isEqualTo(409);
        assertThat(early.code()).isEqualTo("COOLING_PERIOD");
        Instant opens = jdbc.queryForObject("SELECT released_at FROM proposal_versions WHERE id=?", java.sql.Timestamp.class, fq.versionId()).toInstant().plus(java.time.Duration.ofHours(24));
        assertThat(early.getMessage()).contains(opens.toString());
        asCoordinator();
        assertThat(journey.workspace(fq.caseId()).proposal().acceptableFrom()).isEqualTo(opens);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, fq.versionId())).isEqualTo("RELEASED");
        releasedHoursAgo(fq.versionId(), 25);
        asPatient();
        assertThat(journey.decideProposal(fq.caseId(), fq.versionId(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)).status()).isEqualTo("ACCEPTED");
    }

    @Test void theCoolingPeriodHoldsOnTheSecureLinkToo() throws Exception {
        var fq = releasedAboveMaximum();
        String token = finalQuoteToken(fq.versionId(), "final-quote-ready:" + fq.versionId());
        String grant = grant(token);
        var early = catchThrowableOfType(() -> journey.decideProposalPublic(token, grant, new PublicProposalDecisionRequest(grant, "ACCEPTED", null, true)), ApiException.class);
        assertThat(early.code()).isEqualTo("COOLING_PERIOD");
        assertThat(journey.viewProposal(token, grant).acceptableFrom()).isNotNull();
        releasedHoursAgo(fq.versionId(), 25);
        assertThat(journey.decideProposalPublic(token, grant, new PublicProposalDecisionRequest(grant, "ACCEPTED", null, true)).status()).isEqualTo("ACCEPTED");
    }

    // --- 3. Validity (B-05) ---

    @Test void aFinalQuoteStaysOpenFourteenDaysByDefaultAShorterDateIsKeptAndALongerOneRefused() {
        Estimate estimate = acceptedEstimate("EGP", new BigDecimal("10000.00"));
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        var tooLong = catchThrowableOfType(() -> journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", null, Instant.now().plus(java.time.Duration.ofDays(20)))), ApiException.class);
        assertThat(tooLong.status()).isEqualTo(400);
        assertThat(tooLong.code()).isEqualTo("QUOTE_VALIDITY_TOO_LONG");
        // Default: release + 14 days; the link never outlives the quote.
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", null, null));
        Instant before = Instant.now();
        var released = journey.releaseFinalQuote(estimate.caseId(), fq.versionId());
        assertThat(released.validUntil()).isBetween(before.plus(java.time.Duration.ofDays(14)).minusSeconds(5), Instant.now().plus(java.time.Duration.ofDays(14)).plusSeconds(5));
        Instant linkExpiry = jdbc.queryForObject("SELECT MAX(expires_at) FROM proposal_share_tokens WHERE proposal_version_id=?", java.sql.Timestamp.class, fq.versionId()).toInstant();
        assertThat(linkExpiry).isBeforeOrEqualTo(released.validUntil());
        // A coordinator's earlier date is kept, and the link ends with it.
        UUID again = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        Instant threeDays = Instant.now().plus(java.time.Duration.ofDays(3)).truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        var shorter = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(again, "EGP", null, threeDays));
        var shortReleased = journey.releaseFinalQuote(estimate.caseId(), shorter.versionId());
        assertThat(shortReleased.validUntil()).isEqualTo(threeDays);
        assertThat(jdbc.queryForObject("SELECT MAX(expires_at) FROM proposal_share_tokens WHERE proposal_version_id=?", java.sql.Timestamp.class, shorter.versionId()).toInstant()).isEqualTo(threeDays);
    }

    @Test void aShorterValidityOnThePolicyShortensTheQuote() {
        asFinanceManager();
        commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15"), null, 7, null));
        Estimate estimate = acceptedEstimate("EGP", new BigDecimal("10000.00"));
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        assertThat(catchThrowableOfType(() -> journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", null, Instant.now().plus(java.time.Duration.ofDays(10)))), ApiException.class).code())
                .isEqualTo("QUOTE_VALIDITY_TOO_LONG");
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", null, null));
        var released = journey.releaseFinalQuote(estimate.caseId(), fq.versionId());
        assertThat(released.validUntil()).isBefore(Instant.now().plus(java.time.Duration.ofDays(7)).plusSeconds(5));
    }

    @Test void onlyCommercialPolicyManagersSetTheValidityAndTheBandAndOmittedValuesCarryOver() {
        for (Runnable who : List.<Runnable>of(this::asCoordinator, this::asFinance, this::asDoctor)) {
            who.run();
            var denied = catchThrowableOfType(() -> commercialPolicies.configure(new CommercialPolicyRequest("X", null, new BigDecimal("0.15"), null, 10, new BigDecimal("0.05"))), ApiException.class);
            assertThat(denied.status()).isEqualTo(403);
        }
        // The holders of COMMERCIAL_POLICY_MANAGE: System Administrators and Finance Managers.
        asSystemAdministrator();
        assertThat(commercialPolicies.configure(new CommercialPolicyRequest("Platform", null, new BigDecimal("0.15"), null, 14, new BigDecimal("0.03"))).finalQuoteValidityDays()).isEqualTo(14);
        asFinanceManager();
        var set = commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15"), null, 10, new BigDecimal("0.05")));
        assertThat(set.finalQuoteValidityDays()).isEqualTo(10);
        assertThat(set.fxToleranceRate()).isEqualByComparingTo("0.05");
        var revised = commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.12")));
        assertThat(revised.finalQuoteValidityDays()).isEqualTo(10);
        assertThat(revised.fxToleranceRate()).isEqualByComparingTo("0.05");
        assertThat(revised.version()).isEqualTo(set.version() + 1);
        assertThat(catchThrowableOfType(() -> commercialPolicies.configure(new CommercialPolicyRequest("Bad", "cardiology", new BigDecimal("0.15"), null, 0, null)), ApiException.class).code()).isEqualTo("QUOTE_VALIDITY_INVALID");
        assertThat(catchThrowableOfType(() -> commercialPolicies.configure(new CommercialPolicyRequest("Bad", "cardiology", new BigDecimal("0.15"), null, null, new BigDecimal("0.6"))), ApiException.class).code()).isEqualTo("FX_TOLERANCE_INVALID");
        // The platform default carries the owner's values from V96.
        assertThat(commercialPolicies.activePolicyFor(null).quoteValidityDays()).isEqualTo(14);
        assertThat(commercialPolicies.activePolicyFor(null).fxTolerance()).isEqualByComparingTo("0.03");
    }

    // --- 4. FX band (B-05) ---

    @Test void insideTheBandTheQuoteIsAcceptedAtItsFrozenRate() {
        var fq = releasedUsdQuote();
        rate("USD", "0.0205"); // +2.5%
        asPatient();
        assertThat(journey.decideProposal(fq.caseId(), fq.versionId(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)).status()).isEqualTo("ACCEPTED");
    }

    @Test void outsideTheBandAcceptancePausesForFinanceWhoMayKeepTheFrozenRate() {
        var fq = releasedUsdQuote();
        rate("USD", "0.0190"); // -5%: the band applies in either direction
        asPatient();
        var paused = catchThrowableOfType(() -> journey.decideProposal(fq.caseId(), fq.versionId(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)), ApiException.class);
        assertThat(paused.status()).isEqualTo(409);
        assertThat(paused.code()).isEqualTo("FX_REAPPROVAL_REQUIRED");
        assertThat(paused.getMessage()).contains("Finance team is checking");
        assertThat(jdbc.queryForObject("SELECT fx_reapproval_status FROM proposal_versions WHERE id=?", String.class, fq.versionId())).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, fq.versionId())).isEqualTo("RELEASED");
        assertThat(openTasks(fq.caseId(), "FX_REAPPROVAL")).isEqualTo(1);
        assertThat(audits(fq.caseId(), "FINAL_QUOTE_FX_REAPPROVAL_REQUESTED")).isEqualTo(1);
        // Finance's commercial view carries the rate that tripped the band and the quote total at it, beside the frozen total.
        var commercial = proposalQueries.commercial(fq.versionId());
        assertThat(commercial.fxReapprovalRate()).isEqualByComparingTo("0.0190");
        assertThat(commercial.fxReapprovalTotal()).isNotNull().isLessThan(commercial.displayTotal());
        // A second attempt while Finance checks opens nothing new.
        asPatient();
        assertThat(catchThrowableOfType(() -> journey.decideProposal(fq.caseId(), fq.versionId(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)), ApiException.class).code()).isEqualTo("FX_REAPPROVAL_REQUIRED");
        assertThat(openTasks(fq.caseId(), "FX_REAPPROVAL")).isEqualTo(1);
        // Finance keeps the frozen rate; the acceptance proceeds at it.
        assignFinance(fq.caseId());
        assertThat(journey.confirmFinalQuoteFxRate(fq.caseId(), fq.versionId()).fxReapprovalStatus()).isEqualTo("CONFIRMED");
        assertThat(openTasks(fq.caseId(), "FX_REAPPROVAL")).isZero();
        assertThat(audits(fq.caseId(), "FINAL_QUOTE_FX_RATE_CONFIRMED")).isEqualTo(1);
        assertThat(proposalQueries.commercial(fq.versionId()).fxReapprovalRate()).isNull();
        asPatient();
        assertThat(journey.decideProposal(fq.caseId(), fq.versionId(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)).status()).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT fx_rate FROM proposal_versions WHERE id=?", BigDecimal.class, fq.versionId())).isEqualByComparingTo("0.02");
    }

    @Test void financeMayReReleaseAtTodaysRateAndThePatientThenAccepts() throws Exception {
        var fq = releasedUsdQuote();
        rate("USD", "0.0210"); // +5%
        String token = finalQuoteToken(fq.versionId(), "final-quote-ready:" + fq.versionId());
        String grant = grant(token);
        var paused = catchThrowableOfType(() -> journey.decideProposalPublic(token, grant, new PublicProposalDecisionRequest(grant, "ACCEPTED", null, true)), ApiException.class);
        assertThat(paused.code()).isEqualTo("FX_REAPPROVAL_REQUIRED");
        assertThat(audits(fq.caseId(), "FINAL_QUOTE_FX_REAPPROVAL_REQUESTED")).isEqualTo(1);
        asCoordinator();
        assertThat(catchThrowableOfType(() -> journey.confirmFinalQuoteFxRate(fq.caseId(), fq.versionId()), ApiException.class).status()).isEqualTo(403);
        assignFinance(fq.caseId());
        var repriced = journey.repriceFinalQuoteAtTodaysRate(fq.caseId(), fq.versionId());
        assertThat(repriced.fxReapprovalStatus()).isNull();
        assertThat(jdbc.queryForObject("SELECT fx_rate FROM proposal_versions WHERE id=?", BigDecimal.class, fq.versionId())).isEqualByComparingTo("0.021");
        // 10,000 → 210.00 USD and the fee 1,500 → 31.50 at the new rate; the EGP figures are unchanged.
        assertThat(repriced.items()).extracting(ProposalItemView::unitPrice).usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("210.00"), new BigDecimal("31.50"));
        assertThat(egpColumn(fq.versionId(), "patient_total_expected_egp")).isEqualByComparingTo("11500.00");
        assertThat(openTasks(fq.caseId(), "FX_REAPPROVAL")).isZero();
        assertThat(audits(fq.caseId(), "FINAL_QUOTE_REPRICED")).isEqualTo(1);
        // The patient gets a fresh link to the re-released quote and accepts it.
        String fresh = finalQuoteToken(fq.versionId(), null);
        assertThat(fresh).isNotEqualTo(token);
        String freshGrant = grant(fresh);
        assertThat(journey.decideProposalPublic(fresh, freshGrant, new PublicProposalDecisionRequest(freshGrant, "ACCEPTED", null, true)).status()).isEqualTo("ACCEPTED");
    }

    @Test void anEgpQuoteSkipsTheBand() {
        Estimate estimate = acceptedEstimate("EGP", new BigDecimal("10000.00"));
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", null, null));
        journey.releaseFinalQuote(estimate.caseId(), fq.versionId());
        rate("USD", "0.05");
        asPatient();
        assertThat(journey.decideProposal(estimate.caseId(), fq.versionId(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)).status()).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT fx_reapproval_status FROM proposal_versions WHERE id=?", String.class, fq.versionId())).isNull();
    }

    // --- helpers for the rules ---

    record Released(UUID caseId, UUID versionId) {}

    /** An EGP final quote above the accepted estimate's maximum, with the Consultant's reason, released. */
    private Released releasedAboveMaximum() {
        Estimate estimate = acceptedEstimate("EGP", new BigDecimal("10000.00"));
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("12000.00"));
        asCoordinator();
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "EGP", "A second stent is needed after the angiogram", null));
        journey.releaseFinalQuote(estimate.caseId(), fq.versionId());
        entityManager.flush();
        return new Released(estimate.caseId(), fq.versionId());
    }

    /** A USD final quote within the cap, released with the rate frozen at 0.02. */
    private Released releasedUsdQuote() {
        Estimate estimate = acceptedEstimate("USD", new BigDecimal("10000.00"));
        UUID review = finalAssessment(estimate.caseId(), estimate.serviceIds(), new BigDecimal("10000.00"));
        asCoordinator();
        var fq = journey.createFinalQuote(estimate.caseId(), finalQuoteRequest(review, "USD", null, null));
        journey.releaseFinalQuote(estimate.caseId(), fq.versionId());
        entityManager.flush();
        return new Released(estimate.caseId(), fq.versionId());
    }

    private void releasedHoursAgo(UUID versionId, int hours) {
        jdbc.update("UPDATE proposal_versions SET released_at=? WHERE id=?", java.sql.Timestamp.from(Instant.now().minus(java.time.Duration.ofHours(hours))), versionId);
        entityManager.clear();
    }

    /** The token of the latest final-quote notification (by idempotency key, or the newest for the version when null). */
    private String finalQuoteToken(UUID versionId, String key) throws Exception {
        String stored = key != null
                ? jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, key)
                : jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key LIKE ? ORDER BY created_at DESC LIMIT 1", String.class, "final-quote-repriced:" + versionId + ":%");
        return json.readValue(payload(stored), new TypeReference<Map<String, String>>() {}).get("token");
    }

    /** The patient verifies the link with the code sent to their WhatsApp and gets a view grant. */
    private String grant(String token) throws Exception {
        SecurityContextHolder.clearContext();
        journey.requestProposalAccess(token, "WHATSAPP");
        entityManager.flush();
        String raw = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN proposal_access_challenges ch ON o.idempotency_key='proposal-access:'||ch.id JOIN proposal_share_tokens st ON st.id=ch.share_token_id WHERE st.token_hash=? ORDER BY o.created_at DESC LIMIT 1", String.class, intakeLifecycle.hash(token)));
        String code = json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
        return journey.verifyProposalAccess(token, code).grant();
    }

    /** Names take letters only: 1001 -> "baab". */
    private static String letters(int n) { StringBuilder b = new StringBuilder(); for (char c : Integer.toString(n).toCharArray()) b.append((char) ('a' + (c - '0'))); return b.toString(); }

    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }

    private int openTasks(UUID caseId, String type) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type=? AND status IN ('OPEN','IN_PROGRESS')", Integer.class, caseId, type);
        return n == null ? 0 : n;
    }

    private int audits(UUID caseId, String type) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type=?", Integer.class, caseId, type);
        return n == null ? 0 : n;
    }

    /** A cardiology case with an ACCEPTED preliminary estimate (one catalog service per price) and arrival confirmed. */
    Estimate acceptedEstimate(String currency, BigDecimal... providerPricesEgp) {
        int n = COUNTER.incrementAndGet();
        var created = cases.create(new CreateCaseRequest("Quote" + letters(n), "Patient", "Kenya", "+2547" + String.format("%08d", n), "Cardiac reports", "en", true, null, "fqr" + n + "@local.test", "Africa/Nairobi", "cardiology"));
        UUID caseId = created.caseId();
        cases.submit(caseId);
        entityManager.flush();
        entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", "patient-subject", caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, caseId, "coordinator-subject")) journey.claimCoordinatorCase(caseId, "cardiac-pod");
        long v = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Intake complete", v));

        List<UUID> practitioners = jdbc.queryForList("SELECT id FROM practitioner_profiles WHERE external_subject=?", UUID.class, "doctor-subject");
        UUID practitionerId;
        if (practitioners.isEmpty()) {
            practitionerId = UUID.randomUUID();
            jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", practitionerId, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
            jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), practitionerId, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now()); com.rehletshifaa.clinic.ClinicTestData.declareAll(jdbc);
        } else {
            practitionerId = practitioners.get(0);
        }
        List<UUID> serviceIds = new ArrayList<>();
        for (int i = 0; i < providerPricesEgp.length; i++) {
            UUID svc = UUID.randomUUID();
            serviceIds.add(svc);
            jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", svc, practitionerId, "SVC-" + n + "-" + i, "Service " + i, "Consultation", providerPricesEgp[i], true, "admin-subject", Instant.now(), Instant.now());
        }
        var doctorAssignment = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, doctorAssignment.id(), new AssignmentDecisionRequest(true, null));
        var review = journey.saveClinicalReview(caseId, new ClinicalReviewRequest("Reviewed", "SUITABLE", null, "Imaging", "Recommended", "Alt", "Risks", "Seq", "7 days", "Follow-up"));
        journey.approveClinicalReview(caseId, review.id());
        List<ProposalItemRequest> items = new ArrayList<>();
        for (int i = 0; i < providerPricesEgp.length; i++) {
            jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)", UUID.randomUUID(), review.id(), "Service " + i, providerPricesEgp[i], "EGP", i, serviceIds.get(i), providerPricesEgp[i], providerPricesEgp[i], providerPricesEgp[i], false);
            items.add(new ProposalItemRequest("MEDICAL", "Service " + i, BigDecimal.ONE, providerPricesEgp[i], false, i));
        }
        if (!"EGP".equals(currency)) rate(currency, "0.02");
        authenticate("coordinator-subject", Role.COORDINATOR);
        var proposal = journey.createProposal(caseId, new ProposalDraftRequest(review.id(), "en", "Plan", currency, "Incl", "Excl", "Deposit", "Refund", "Consent", Instant.now().plusSeconds(86400), items, null));
        // Skip release/decide: mark the preliminary accepted and the patient arrived.
        jdbc.update("UPDATE proposal_versions SET status='ACCEPTED', released_at=? WHERE id=?", java.sql.Timestamp.from(Instant.now()), proposal.versionId());
        jdbc.update("UPDATE medical_cases SET status='ARRIVAL_CONFIRMED' WHERE id=?", caseId);
        return new Estimate(caseId, proposal.versionId(), serviceIds);
    }

    /** Inserts today's EGP -> currency rate (display units per 1 EGP), replacing any existing row for today. */
    void rate(String currency, String displayPerEgp) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        jdbc.update("DELETE FROM fx_rates WHERE base_currency='EGP' AND quote_currency=? AND rate_date=?", currency, today);
        jdbc.update("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,?)", UUID.randomUUID(), "EGP", currency, new BigDecimal(displayPerEgp), today, "API", Instant.now());
    }

    /** Doctor's final assessment; the catalog price is authoritative, so differing prices are written to the catalog first. */
    UUID finalAssessment(UUID caseId, List<UUID> serviceIds, BigDecimal... providerPricesEgp) {
        List<CostEstimateItem> items = new ArrayList<>();
        for (int i = 0; i < providerPricesEgp.length; i++) {
            jdbc.update("UPDATE consultant_service_catalog SET price_egp=? WHERE id=?", providerPricesEgp[i], serviceIds.get(i));
            items.add(new CostEstimateItem("Service " + i, providerPricesEgp[i], "EGP", serviceIds.get(i)));
        }
        asDoctor();
        return journey.saveFinalAssessment(caseId, new FinalAssessmentRequest("Scope confirmed on examination", "Standard risks", items)).id();
    }

    FinalQuoteRequest finalQuoteRequest(UUID reviewId, String currency, String scopeChangeReason, Instant validUntil) {
        return new FinalQuoteRequest(reviewId, currency, scopeChangeReason, "Excl", "Deposit", "Refund", "Consent", validUntil, null);
    }

    void asCoordinator() { authenticate("coordinator-subject", Role.COORDINATOR); }
    void asPatient() { authenticate("patient-subject", Role.PATIENT); }
    void asDoctor() { authenticate("doctor-subject", Role.CONSULTANT); }
    void asFinance() { authenticate("finance-subject", Role.FINANCE); }
    void asFinanceManager() { authenticate("finance-manager-subject", Role.FINANCE_MANAGER); }
    void asSystemAdministrator() { authenticate("sysadmin-subject", Role.SYSTEM_ADMINISTRATOR); }

    /** Gives Finance case access the way JourneyServiceIntegrationTest does: staff row, then assign + accept. Leaves Finance signed in. */
    void assignFinance(UUID caseId) {
        // The final quote's case is ARRIVAL_CONFIRMED, where no new Finance assignment is offered; Finance is on the case from the estimate.
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-subject", "FINANCE", crypto.encrypt("Finance One"));
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), caseId, "finance-subject", "FINANCE", "PRIMARY", "ACTIVE", "Commercial approval", "coordinator-subject", Instant.now(), Instant.now());
        asFinance();
    }

    BigDecimal egpColumn(UUID versionId, String column) {
        return jdbc.queryForObject("SELECT " + column + " FROM proposal_versions WHERE id=?", BigDecimal.class, versionId);
    }

    List<Map<String, Object>> lines(UUID versionId) {
        return jdbc.queryForList("SELECT category,source,description,unit_price,unit_price_egp,provider_price_egp,unit_price_min_egp,unit_price_max_egp,optional,sort_order FROM proposal_items WHERE proposal_version_id=? ORDER BY sort_order", versionId);
    }

    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
}
