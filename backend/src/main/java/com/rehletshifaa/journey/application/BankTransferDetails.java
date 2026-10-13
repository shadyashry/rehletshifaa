package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.BankTransferView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * The platform bank account patients transfer the coordination deposit to (DEP-3). Configuration only
 * ({@code app.payments.bank-transfer.*}): dummy values outside production, the real account set through the environment.
 * The case number is the payment reference the patient writes on the transfer so Finance can match it.
 */
@Component
public class BankTransferDetails {
    private final String accountName, bankName, accountNumber, iban, swift;

    public BankTransferDetails(@Value("${app.payments.bank-transfer.account-name:RehletShifaa Test Account}") String accountName,
                               @Value("${app.payments.bank-transfer.bank-name:Test Bank (dummy details)}") String bankName,
                               @Value("${app.payments.bank-transfer.account-number:0000000000000}") String accountNumber,
                               @Value("${app.payments.bank-transfer.iban:EG000000000000000000000000000}") String iban,
                               @Value("${app.payments.bank-transfer.swift:TESTEGCXXXX}") String swift, Environment environment) {
        this.accountName = accountName; this.bankName = bankName; this.accountNumber = accountNumber; this.iban = iban; this.swift = swift;
        // Production never tells a patient to pay into the dummy account: it refuses to start until the real one is set.
        if (environment.acceptsProfiles(Profiles.of("prod")) && (isBlankOrDummy(accountName, "RehletShifaa Test Account")
                || isBlankOrDummy(accountNumber, "0000000000000") || isBlankOrDummy(iban, "EG000000000000000000000000000")))
            throw new IllegalStateException("Set the platform bank account (PAYMENT_BANK_*) before running in production");
    }

    private static boolean isBlankOrDummy(String value, String dummy) { return value == null || value.isBlank() || value.equals(dummy); }

    BankTransferView forCase(String caseNumber) { return new BankTransferView(accountName, bankName, accountNumber, iban, swift, caseNumber); }
}
