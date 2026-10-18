package com.rehletshifaa.journey.application;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** P1-10 (D-A): the fee line's arithmetic against the per-line markup it replaced. */
class ProposalPricingTest {
    private static final BigDecimal RATE = new BigDecimal("0.15");

    private static BigDecimal legacyTotal(BigDecimal... prices) {
        BigDecimal total = BigDecimal.ZERO;
        for (BigDecimal p : prices) total = total.add(p.multiply(BigDecimal.ONE.add(RATE)).setScale(2, RoundingMode.HALF_UP));
        return total;
    }

    private static ProposalPricing.Totals priced(BigDecimal... prices) {
        return ProposalPricing.of(java.util.Arrays.stream(prices).map(p -> ProposalPricing.ProviderLine.of(p, null, null)).toList(), RATE);
    }

    @Test void wholePoundPricesGiveTheSameTotalAsTheOldMarkup() {
        BigDecimal[][] cases = {{new BigDecimal("390000")}, {new BigDecimal("10000"), new BigDecimal("2500")}, {new BigDecimal("1"), new BigDecimal("3"), new BigDecimal("7")},
                {new BigDecimal("12345"), new BigDecimal("678"), new BigDecimal("9")}};
        for (BigDecimal[] prices : cases) {
            var t = priced(prices);
            assertThat(t.patientExpected()).isEqualByComparingTo(legacyTotal(prices));
            assertThat(t.feeExpected()).isEqualByComparingTo(t.providerExpected().multiply(RATE).setScale(2, RoundingMode.HALF_UP));
        }
    }

    @Test void theFeeIsOnTheProviderTotalSoTheTotalAlwaysEqualsProviderPlusMargin() {
        // Two lines of 10.03: the old markup rounded each line (11.53 + 11.53 = 23.06) while its margin figure was 15% of 20.06 = 3.01,
        // so total and provider + margin disagreed by a cent. The fee line makes them one figure: 20.06 + 3.01 = 23.07.
        var t = priced(new BigDecimal("10.03"), new BigDecimal("10.03"));
        assertThat(legacyTotal(new BigDecimal("10.03"), new BigDecimal("10.03"))).isEqualByComparingTo("23.06");
        assertThat(t.feeExpected()).isEqualByComparingTo("3.01");
        assertThat(t.patientExpected()).isEqualByComparingTo("23.07");
    }

    @Test void theRangeCarriesItsOwnFee() {
        var t = ProposalPricing.of(List.of(ProposalPricing.ProviderLine.of(new BigDecimal("8000"), new BigDecimal("7000"), new BigDecimal("11000")),
                ProposalPricing.ProviderLine.of(new BigDecimal("2000"), null, null)), RATE);
        assertThat(t.providerMin()).isEqualByComparingTo("9000");
        assertThat(t.providerMax()).isEqualByComparingTo("13000");
        assertThat(t.feeMin()).isEqualByComparingTo("1350.00");
        assertThat(t.feeMax()).isEqualByComparingTo("1950.00");
        assertThat(t.patientMin()).isEqualByComparingTo("10350.00");
        assertThat(t.patientMax()).isEqualByComparingTo("14950.00");
        assertThat(ProposalPricing.fee(new BigDecimal("1000"), null)).isEqualByComparingTo("0.00");
    }

    @Test void theConfiguredMinimumAppliesToEveryPointInTheRange() {
        var t = ProposalPricing.of(List.of(ProposalPricing.ProviderLine.of(new BigDecimal("1000"), new BigDecimal("500"), new BigDecimal("3000"))),
                new BigDecimal("0.10"), new BigDecimal("250.00"));

        assertThat(t.feeMin()).isEqualByComparingTo("250.00");
        assertThat(t.feeExpected()).isEqualByComparingTo("250.00");
        assertThat(t.feeMax()).isEqualByComparingTo("300.00");
        assertThat(t.patientExpected()).isEqualByComparingTo("1250.00");
    }
}
