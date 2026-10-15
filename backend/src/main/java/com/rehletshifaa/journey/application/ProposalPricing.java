package com.rehletshifaa.journey.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * P1-10 (review B-03, owner decision D-A 2026-10-15): the one price rule of a proposal version. Medical lines carry the
 * provider's own EGP price (Consultant and facility at their own prices); the platform charges the patient one disclosed
 * line, the coordination and guarantee fee, equal to the locked margin rate times the provider total, for the expected,
 * lowest and highest figures alike. The patient's totals are the provider totals plus that fee, and the margin Finance reads
 * is the expected fee, so the deposit (a share of the expected total) and the EGP ledger keep the figures they had when the
 * margin was baked into each line, for any case whose per-line markup did not round (whole-pound prices never do).
 */
final class ProposalPricing {
    /** The fee line's stored description; the patient-facing wording per language is a frontend concern (P1-10 session 2). */
    static final String FEE_DESCRIPTION = "Coordination and guarantee fee";

    private ProposalPricing() {}

    /** One provider line in EGP: expected price and its range (a missing bound is the expected price). */
    record ProviderLine(BigDecimal expected, BigDecimal min, BigDecimal max) {
        static ProviderLine of(BigDecimal expected, BigDecimal min, BigDecimal max) {
            return new ProviderLine(expected, min == null ? expected : min, max == null ? expected : max);
        }
    }

    /** Provider totals, the fee on each, and the patient's totals (provider + fee). */
    record Totals(BigDecimal providerExpected, BigDecimal providerMin, BigDecimal providerMax,
                  BigDecimal feeExpected, BigDecimal feeMin, BigDecimal feeMax) {
        BigDecimal patientExpected() { return providerExpected.add(feeExpected); }
        BigDecimal patientMin() { return providerMin.add(feeMin); }
        BigDecimal patientMax() { return providerMax.add(feeMax); }
    }

    static Totals of(List<ProviderLine> lines, BigDecimal marginRate) {
        BigDecimal expected = BigDecimal.ZERO, min = BigDecimal.ZERO, max = BigDecimal.ZERO;
        for (ProviderLine line : lines) { expected = expected.add(line.expected()); min = min.add(line.min()); max = max.add(line.max()); }
        return new Totals(expected, min, max, fee(expected, marginRate), fee(min, marginRate), fee(max, marginRate));
    }

    static BigDecimal fee(BigDecimal providerTotal, BigDecimal marginRate) {
        return providerTotal.multiply(marginRate == null ? BigDecimal.ZERO : marginRate).setScale(2, RoundingMode.HALF_UP);
    }

    static BigDecimal display(BigDecimal egp, BigDecimal rate) { return egp.multiply(rate).setScale(2, RoundingMode.HALF_UP); }
}
