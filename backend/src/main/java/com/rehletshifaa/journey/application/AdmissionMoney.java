package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.domain.AdmissionVoucher.Split;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * P1-15 (owner decision D-B, 2026-10-15; design §6 rules 1 and 2): the one money rule of an admission voucher, in EGP.
 * <ol>
 *   <li>The coordination deposit the patient paid covers the platform's fee first (leg B is due at the final quote).</li>
 *   <li>What is left of the deposit is the credit the platform settles to the hospital (leg C's credit).</li>
 *   <li>The patient pays the hospital cashier the package less that credit.</li>
 *   <li>Any part of the fee the deposit did not cover (the deposit is capped, the fee is not) is a fee balance the patient owes
 *       the platform before admission, never the hospital: the hospital never collects the platform's money and the platform
 *       never holds the hospital's.</li>
 * </ol>
 * Worked example (package 100,000, fee 15% = 15,000, deposit 15% of the 115,000 total = 17,250): the deposit covers the fee,
 * 2,250 is credited to the hospital, the patient pays the hospital 97,750 and owes the platform nothing more; 17,250 + 97,750 =
 * 115,000. With the deposit capped at 10,000 instead: the fee takes all of it, nothing is credited, the patient pays the
 * hospital 100,000 and the platform a fee balance of 5,000.
 */
final class AdmissionMoney {
    private AdmissionMoney() {}

    /** Thrown when the deposit already exceeds what the package and the fee leave to pay (a case for Finance, never a voucher). */
    static final class DepositExceedsPackage extends RuntimeException {
        DepositExceedsPackage() { super("The deposit exceeds the package and the fee"); }
    }

    static Split split(BigDecimal packageTotalEgp, BigDecimal platformFeeEgp, BigDecimal depositPaidEgp) {
        BigDecimal pkg = money(packageTotalEgp), fee = money(platformFeeEgp), deposit = money(depositPaidEgp);
        BigDecimal feeCovered = fee.min(deposit);
        BigDecimal credit = deposit.subtract(feeCovered);
        BigDecimal feeBalance = fee.subtract(feeCovered);
        BigDecimal atFacility = pkg.subtract(credit);
        if (atFacility.signum() < 0) throw new DepositExceedsPackage();
        return new Split(pkg, fee, deposit, credit, feeBalance, atFacility);
    }

    private static BigDecimal money(BigDecimal value) {
        BigDecimal v = value == null ? BigDecimal.ZERO : value;
        if (v.signum() < 0) throw new IllegalArgumentException("A voucher amount cannot be negative");
        return v.setScale(2, RoundingMode.HALF_UP);
    }
}
