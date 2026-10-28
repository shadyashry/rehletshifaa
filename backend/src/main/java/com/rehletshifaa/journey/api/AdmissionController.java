package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.AdmissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.rehletshifaa.journey.api.AdmissionDtos.*;
import static com.rehletshifaa.journey.api.JourneyDtos.IdResponse;

/**
 * P1-15 (D-B, D-C, D-D): admission, voucher and balance. Operations reserves and records; Finance checks and countersigns
 * (fresh sign-in); the Consultant records an emergency admission; the case team reads the panel; the patient sees where and
 * what to pay and confirms the arrival. Every method authorises through {@code Authority}; the prefixes only mirror the
 * workspace each caller works in.
 */
@RestController
@RequestMapping("/api/v1")
public class AdmissionController {
    private final AdmissionService admissions;

    public AdmissionController(AdmissionService admissions) { this.admissions = admissions; }

    // ---- the panel (case team and Finance) ----

    @GetMapping({"/operations/cases/{caseId}/admission", "/finance/cases/{caseId}/admission", "/coordinator/cases/{caseId}/admission",
            "/doctor/cases/{caseId}/admission"})
    public AdmissionView view(@PathVariable UUID caseId) { return admissions.view(caseId); }

    // ---- Operations ----

    @PostMapping("/operations/cases/{caseId}/admission")
    public AdmissionView reserve(@PathVariable UUID caseId, @Valid @RequestBody ReserveAdmissionRequest request) { return admissions.reserve(caseId, request); }

    @PostMapping("/operations/cases/{caseId}/admission/letter")
    public AdmissionView letter(@PathVariable UUID caseId, @Valid @RequestBody AdmissionLetterRequest request) { return admissions.recordLetter(caseId, request); }

    @PostMapping("/operations/cases/{caseId}/admission/voucher")
    public AdmissionView voucher(@PathVariable UUID caseId) { return admissions.issueVoucher(caseId); }

    @PostMapping("/operations/cases/{caseId}/admission/balance")
    public AdmissionView balance(@PathVariable UUID caseId, @Valid @RequestBody BalanceReceiptRequest request) { return admissions.recordBalance(caseId, request); }

    @PostMapping("/operations/cases/{caseId}/admission/point-of-no-return")
    public AdmissionView pointOfNoReturn(@PathVariable UUID caseId, @Valid @RequestBody PointOfNoReturnRequest request) {
        return admissions.setPointOfNoReturn(caseId, request);
    }

    @PostMapping("/operations/cases/{caseId}/admission/number")
    public AdmissionView admissionNumber(@PathVariable UUID caseId, @Valid @RequestBody AdmissionNumberRequest request) {
        return admissions.recordAdmissionNumber(caseId, request);
    }

    // ---- Finance (step-up) ----

    @PostMapping("/finance/cases/{caseId}/admission/letter/decision")
    public AdmissionView decideLetter(@PathVariable UUID caseId, @Valid @RequestBody LetterDecisionRequest request) { return admissions.decideLetter(caseId, request); }

    @PostMapping("/finance/cases/{caseId}/evidence/{evidenceId}/countersign")
    public AdmissionView countersign(@PathVariable UUID caseId, @PathVariable UUID evidenceId) { return admissions.countersign(caseId, evidenceId); }

    @PostMapping("/finance/cases/{caseId}/admission/fee-balance")
    public AdmissionView feeBalance(@PathVariable UUID caseId, @Valid @RequestBody FeeBalanceRequest request) { return admissions.recordFeeBalance(caseId, request); }

    // ---- Consultant ----

    @PostMapping("/doctor/cases/{caseId}/emergency-admission")
    public IdResponse emergencyAdmission(@PathVariable UUID caseId, @Valid @RequestBody EmergencyAdmissionRequest request) {
        return new IdResponse(admissions.emergencyAdmission(caseId, request), "EMERGENCY_ADMISSION_OVERRIDE");
    }

    /** B-3-1b: after an emergency admission the Consultant records the hospital's admission number, which starts treatment. */
    @PostMapping("/doctor/cases/{caseId}/admission/number")
    public AdmissionView emergencyAdmissionNumber(@PathVariable UUID caseId, @Valid @RequestBody AdmissionNumberRequest request) {
        return admissions.recordEmergencyAdmissionNumber(caseId, request);
    }

    // ---- patient ----

    @GetMapping("/patient/cases/{caseId}/admission")
    public PatientAdmissionView patientView(@PathVariable UUID caseId) { return admissions.patientView(caseId); }

    @PostMapping("/patient/cases/{caseId}/arrived")
    public void arrived(@PathVariable UUID caseId) { admissions.patientArrived(caseId); }
}
