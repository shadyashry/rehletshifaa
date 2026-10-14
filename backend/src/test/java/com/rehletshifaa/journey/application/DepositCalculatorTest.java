package com.rehletshifaa.journey.application;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P0-4 (review 2026-10-14 B-01, owner decision 2026-10-14): one deposit, 15% of the medical total, at least USD 200 and
 * at most USD 1,500, never above the total, rounded up to a figure that is easy to transfer or hand over in cash.
 * Rates are units per EGP, as the proposal snapshot stores them: 0.02 USD per EGP (EGP 50 to the dollar).
 */
class DepositCalculatorTest {
    static final BigDecimal SHARE = new BigDecimal("0.15"), MIN = new BigDecimal("200"), MAX = new BigDecimal("1500");
    static final BigDecimal USD = new BigDecimal("0.02"), EUR = new BigDecimal("0.0184");

    static DepositCalculator.Amount usd(String medicalTotalUsd) {
        BigDecimal egp = new BigDecimal(medicalTotalUsd).divide(USD);
        return DepositCalculator.compute(SHARE, MIN, MAX, egp, "USD", USD, USD);
    }

    @Test void theOwnersWorkedExamplesInDollars() {
        assertThat(usd("800").display()).isEqualByComparingTo("200");     // 120 -> the minimum
        assertThat(usd("3000").display()).isEqualByComparingTo("450");
        assertThat(usd("8000").display()).isEqualByComparingTo("1200");
        assertThat(usd("20000").display()).isEqualByComparingTo("1500");  // 3,000 -> the maximum
        // The ledger amount is the rounded figure's, so patient and Finance read the same number.
        assertThat(usd("20000").egp()).isEqualByComparingTo("75000.00");
        assertThat(usd("20000").currency()).isEqualTo("USD");
    }

    @Test void roundsUpToTheNextTenInForeignCurrencyAndTheNextHundredInPounds() {
        assertThat(usd("8970").display()).isEqualByComparingTo("1350");    // 1,345.50 -> 1,350
        var pounds = DepositCalculator.compute(SHARE, MIN, MAX, new BigDecimal("100333"), "EGP", BigDecimal.ONE, USD);
        assertThat(pounds.display()).isEqualByComparingTo("15100");        // 15,049.95 -> 15,100
        assertThat(pounds.egp()).isEqualByComparingTo("15100");
    }

    @Test void neverAsksForMoreThanTheMedicalTotal() {
        // A USD 150 case: the USD 200 minimum would exceed the whole bill, so the deposit is the bill.
        assertThat(usd("150").display()).isEqualByComparingTo("150");
        // Rounding up never crosses the total either: USD 205 total, minimum 200 -> 200 exactly, then not 210.
        assertThat(usd("205").display()).isEqualByComparingTo("200");
        var odd = DepositCalculator.compute(SHARE, new BigDecimal("199.5"), MAX, new BigDecimal("9990"), "USD", USD, USD);
        assertThat(odd.display()).isEqualByComparingTo("199.80"); // 199.50 rounds to 200, above the 199.80 total
    }

    @Test void boundsAreDollarsConvertedAtTheProposalRateWhateverItsCurrency() {
        // EUR proposal of EGP 1,000,000: the USD 1,500 maximum is EGP 75,000 = EUR 1,380.
        var euro = DepositCalculator.compute(SHARE, MIN, MAX, new BigDecimal("1000000"), "EUR", EUR, USD);
        assertThat(euro.display()).isEqualByComparingTo("1380");
        // EGP proposal of EGP 40,000: 15% is EGP 6,000, below the USD 200 minimum of EGP 10,000.
        var pounds = DepositCalculator.compute(SHARE, MIN, MAX, new BigDecimal("40000"), "EGP", BigDecimal.ONE, USD);
        assertThat(pounds.display()).isEqualByComparingTo("10000");
    }

    @Test void withoutADollarRateOrBoundsTheShareAppliesAlone() {
        var unbounded = DepositCalculator.compute(SHARE, MIN, MAX, new BigDecimal("40000"), "EGP", BigDecimal.ONE, null);
        assertThat(unbounded.display()).isEqualByComparingTo("6000");
        var noBounds = DepositCalculator.compute(SHARE, null, null, new BigDecimal("1000000"), "USD", USD, USD);
        assertThat(noBounds.display()).isEqualByComparingTo("3000");
    }
}
