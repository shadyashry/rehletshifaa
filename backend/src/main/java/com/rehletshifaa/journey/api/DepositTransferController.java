package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.DepositTransferService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.rehletshifaa.journey.api.JourneyDtos.*;

/** The deposit's bank-transfer step (DEP-3): the patient enters the reference, Finance rejects one it cannot confirm, the coordinator sends the link. */
@RestController
@RequestMapping("/api/v1")
public class DepositTransferController {
    private final DepositTransferService transfers;

    public DepositTransferController(DepositTransferService transfers) { this.transfers = transfers; }

    @PostMapping("/patient/cases/{caseId}/deposit/transfer-reference")
    public DepositView submitReference(@PathVariable UUID caseId, @Valid @RequestBody TransferReferenceRequest request) {
        return transfers.submitReference(caseId, request);
    }

    @PostMapping("/finance/cases/{caseId}/deposits/{depositId}/transfers/{transferId}/reject")
    public DepositView reject(@PathVariable UUID caseId, @PathVariable UUID depositId, @PathVariable UUID transferId,
                              @Valid @RequestBody TransferRejectionRequest request) {
        return transfers.reject(caseId, depositId, transferId, request);
    }

    @PostMapping("/coordinator/cases/{caseId}/deposit/payment-link")
    public IdResponse sendPaymentLink(@PathVariable UUID caseId) { return transfers.sendPaymentLink(caseId); }
}
