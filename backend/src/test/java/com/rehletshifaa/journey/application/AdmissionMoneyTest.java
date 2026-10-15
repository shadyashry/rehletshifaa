package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.domain.AdmissionVoucher.Split;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-15 (owner decision D-B): the voucher's money rule, pure. The deposit covers the platform fee first, the rest is credited
 * to the hospital, the patient pays the hospital the package less that credit, and a fee the deposit did not cover is owed to
 * the platform. Whatever the inputs, the patient pays exactly the package plus the fee.
 */
class AdmissionMoneyTest {
    @Test void theWorkedExampleOfTheArchitecture() {
        // Package 100,000, fee 15% = 15,000, deposit 15% of the 115,000 total = 17,250.
        Split s = AdmissionMoney.split(egp("100000"), egp("15000"), egp("17250"));
        assertThat(s.depositCreditEgp()).isEqualByComparingTo("2250");
        assertThat(s.patientPaysAtFacilityEgp()).isEqualByComparingTo("97750");
        assertThat(s.feeBalanceEgp()).isEqualByComparingTo("0");
        assertPaysPackagePlusFee(s);
    }

    @Test void aCappedDepositLeavesAFeeBalanceOwedToThePlatformNeverToTheHospital() {
        Split s = AdmissionMoney.split(egp("100000"), egp("15000"), egp("10000"));
        assertThat(s.depositCreditEgp()).isEqualByComparingTo("0");
        assertThat(s.patientPaysAtFacilityEgp()).as("the hospital is paid its whole package").isEqualByComparingTo("100000");
        assertThat(s.feeBalanceEgp()).isEqualByComparingTo("5000");
        assertPaysPackagePlusFee(s);
    }

    @Test void noDepositMeansTheWholeFeeIsOwedAndNothingIsCredited() {
        Split s = AdmissionMoney.split(egp("50000"), egp("7500"), null);
        assertThat(s.depositCreditEgp()).isEqualByComparingTo("0");
        assertThat(s.feeBalanceEgp()).isEqualByComparingTo("7500");
        assertThat(s.patientPaysAtFacilityEgp()).isEqualByComparingTo("50000");
        assertPaysPackagePlusFee(s);
    }

    @Test void aDepositAboveThePackageAndTheFeeIsRefusedForFinance() {
        assertThatThrownBy(() -> AdmissionMoney.split(egp("1000"), egp("150"), egp("2000"))).isInstanceOf(AdmissionMoney.DepositExceedsPackage.class);
        assertThat(AdmissionMoney.split(egp("1000"), egp("150"), egp("1150")).patientPaysAtFacilityEgp()).as("exactly covered").isEqualByComparingTo("0");
    }

    @Test void amountsAreRoundedToPiastres() {
        Split s = AdmissionMoney.split(new BigDecimal("1000.005"), new BigDecimal("150.004"), new BigDecimal("200"));
        assertThat(s.packageTotalEgp().scale()).isEqualTo(2);
        assertThat(s.patientPaysAtFacilityEgp()).isEqualByComparingTo("950.01");
    }

    private static void assertPaysPackagePlusFee(Split s) {
        assertThat(s.depositPaidEgp().add(s.patientPaysAtFacilityEgp()).add(s.feeBalanceEgp()))
                .as("deposit + at the hospital + fee balance = package + fee").isEqualByComparingTo(s.packageTotalEgp().add(s.platformFeeEgp()));
    }

    private static BigDecimal egp(String v) { return new BigDecimal(v); }
}
