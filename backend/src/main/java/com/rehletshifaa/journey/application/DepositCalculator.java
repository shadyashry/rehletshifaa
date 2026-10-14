package com.rehletshifaa.journey.application;

import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.currency.CurrencyService;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;

/**
 * The one calculation of the coordination deposit (review 2026-10-14 B-01, owner decision 2026-10-14), used for the
 * deposit itself, the amount the patient is told is due before it exists, and the proposal's "deposit due" line:
 * <ol>
 *   <li>the policy's share (15%) of the patient's medical total, the marked-up Consultant lines, travel excluded;</li>
 *   <li>at least the policy's minimum and at most its maximum, both set in US dollars and converted at the
 *       proposal's own exchange-rate date;</li>
 *   <li>never more than the medical total itself;</li>
 *   <li>rounded up in the patient's currency to a number that is easy to transfer or hand over in cash: the next 100
 *       in EGP, the next 10 in any other currency (still never above the medical total).</li>
 * </ol>
 * The EGP amount is derived from the rounded display amount, so the patient and Finance see the same figure.
 */
@Component
public class DepositCalculator {
    static final String BOUND_CURRENCY = "USD";
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(DepositCalculator.class);

    /** A deposit amount: EGP (the ledger's currency) and the same amount in the proposal's currency. */
    public record Amount(BigDecimal egp, BigDecimal display, String currency) {
        static Amount none(String currency) { return new Amount(BigDecimal.ZERO, BigDecimal.ZERO, currency); }
    }

    private final CurrencyService currencies;
    private final Clock clock;

    public DepositCalculator(CurrencyService currencies, Clock clock) { this.currencies = currencies; this.clock = clock; }

    /**
     * The deposit on a medical total quoted in {@code currency} at {@code displayPerEgp} (units of that currency per EGP,
     * 1 for EGP), whose rate is dated {@code fxDate} (null: today).
     */
    Amount quote(DepositQueryService.ActivePolicy policy, BigDecimal medicalTotalEgp, String currency, BigDecimal displayPerEgp, LocalDate fxDate) {
        String shown = currency == null ? CurrencyService.BASE : currency;
        if (policy == null || !policy.due() || medicalTotalEgp == null || medicalTotalEgp.signum() <= 0) return Amount.none(shown);
        BigDecimal rate = displayPerEgp == null ? BigDecimal.ONE : displayPerEgp;
        return compute(policy.rate(), policy.minimumUsd(), policy.maximumUsd(), medicalTotalEgp, shown, rate, usdPerEgp(policy, shown, rate, fxDate));
    }

    /**
     * The pure rule, for the service and its tests. {@code usdPerEgp} null applies no bounds (no dollar rate on the date:
     * the share alone is still a truthful deposit; refusing the patient's acceptance over a missing rate would not be).
     */
    static Amount compute(BigDecimal share, BigDecimal minimumUsd, BigDecimal maximumUsd, BigDecimal medicalTotalEgp,
                          String currency, BigDecimal displayPerEgp, BigDecimal usdPerEgp) {
        BigDecimal deposit = medicalTotalEgp.multiply(share);
        if (usdPerEgp != null && usdPerEgp.signum() > 0) {
            if (minimumUsd != null) deposit = deposit.max(minimumUsd.divide(usdPerEgp, 2, RoundingMode.HALF_UP));
            if (maximumUsd != null) deposit = deposit.min(maximumUsd.divide(usdPerEgp, 2, RoundingMode.HALF_UP));
        }
        deposit = deposit.min(medicalTotalEgp);
        BigDecimal step = CurrencyService.BASE.equals(currency) ? BigDecimal.valueOf(100) : BigDecimal.TEN;
        BigDecimal totalDisplay = medicalTotalEgp.multiply(displayPerEgp).setScale(2, RoundingMode.HALF_UP);
        BigDecimal display = deposit.multiply(displayPerEgp).divide(step, 0, RoundingMode.CEILING).multiply(step).setScale(2, RoundingMode.UNNECESSARY);
        if (display.compareTo(totalDisplay) > 0) display = totalDisplay;
        BigDecimal egp = display.divide(displayPerEgp, 2, RoundingMode.HALF_UP);
        return new Amount(egp, display, currency);
    }

    private BigDecimal usdPerEgp(DepositQueryService.ActivePolicy policy, String currency, BigDecimal displayPerEgp, LocalDate fxDate) {
        if (policy.minimumUsd() == null && policy.maximumUsd() == null) return null;
        if (BOUND_CURRENCY.equals(currency)) return displayPerEgp;
        try {
            return currencies.effectiveRate(BOUND_CURRENCY, fxDate == null ? LocalDate.now(clock) : fxDate);
        } catch (ApiException e) {
            log.warn("No USD rate for the deposit bounds; the share applies unbounded [event.code=DEPOSIT_BOUNDS_FX_UNAVAILABLE]");
            return null;
        }
    }
}
