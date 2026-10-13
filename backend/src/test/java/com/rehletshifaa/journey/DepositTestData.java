package com.rehletshifaa.journey;

import com.rehletshifaa.journey.api.JourneyDtos.DepositView;
import com.rehletshifaa.journey.api.JourneyDtos.RecordReceiptRequest;
import com.rehletshifaa.journey.application.PaymentService;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/** Deposit fixtures under DEP-3: Finance confirms only a transfer reference the patient entered. */
public final class DepositTestData {
    private DepositTestData() {}

    /** The patient entered this bank-transfer reference on the case's latest live deposit; it waits for Finance. */
    public static UUID reportTransfer(JdbcTemplate jdbc, UUID caseId, String reference) {
        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=? AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1", UUID.class, caseId);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO deposit_transfer_reports(id,case_id,deposit_id,method,transfer_reference,status,submitted_by,submitted_at,version) "
                + "VALUES(?,?,?,'BANK_TRANSFER',?,'SUBMITTED','TEST',?,0)", id, caseId, depositId, reference, Instant.now());
        return id;
    }

    /**
     * Finance (signed in by the caller) confirms {@code amount} against the patient's reference, entering one first when
     * none waits. On a deposit no longer open — a duplicate authoritative confirmation, as a replayed provider callback
     * would arrive — it goes straight through {@link PaymentService#confirmPayment}.
     */
    public static DepositView settle(JdbcTemplate jdbc, PaymentService payment, UUID caseId, UUID depositId, BigDecimal amount, String key) {
        String status = jdbc.queryForObject("SELECT status FROM deposits WHERE id=?", String.class, depositId);
        // The ledger key as Finance's confirmation writes it, so a replayed key is the same command.
        if (!Set.of("REQUESTED", "PARTIALLY_PAID").contains(status))
            return payment.confirmPayment(new PaymentService.ConfirmedPayment(caseId, depositId, "OFFLINE", "FT-DUPLICATE", "BANK_TRANSFER", amount, "TEST",
                    "receipt:" + depositId + ":" + key));
        Integer pending = jdbc.queryForObject("SELECT count(*) FROM deposit_transfer_reports WHERE deposit_id=? AND status='SUBMITTED'", Integer.class, depositId);
        if (pending == null || pending == 0) reportTransfer(jdbc, caseId, "FT" + Math.abs(key.hashCode()));
        return payment.recordReceipt(caseId, depositId, new RecordReceiptRequest(amount, key));
    }
}
