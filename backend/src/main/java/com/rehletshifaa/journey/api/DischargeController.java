package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.DischargeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.rehletshifaa.journey.api.DischargeDtos.*;
import static com.rehletshifaa.journey.api.PublicCaseDtos.CaseAccessRequest;

/**
 * P1-17 (D-F): discharge. The Consultant records the pack and generates the handover letter; Operations records the hospital's
 * final invoice, confirms the return travel (a flight only with a valid fit-to-fly) and the departure; the case team and Finance
 * read the "Discharge" panel; the patient reads "Going home" in My Care or on the verified secure link. Every method authorises
 * through {@code Authority} (the public one through the link's verified grant); the prefixes only mirror each caller's workspace.
 */
@RestController
@RequestMapping("/api/v1")
public class DischargeController {
    private final DischargeService discharge;

    public DischargeController(DischargeService discharge) { this.discharge = discharge; }

    @GetMapping({"/operations/cases/{caseId}/discharge", "/finance/cases/{caseId}/discharge", "/coordinator/cases/{caseId}/discharge",
            "/doctor/cases/{caseId}/discharge"})
    public DischargeView view(@PathVariable UUID caseId) { return discharge.view(caseId); }

    // ---- the Consultant ----

    @PostMapping("/doctor/cases/{caseId}/discharge/pack")
    public DischargeView packItem(@PathVariable UUID caseId, @Valid @RequestBody PackItemRequest request) { return discharge.recordPackItem(caseId, request); }

    @PostMapping("/doctor/cases/{caseId}/discharge/handover-letter")
    public DischargeView handoverLetter(@PathVariable UUID caseId) { return discharge.generateHandoverLetter(caseId); }

    // ---- Operations ----

    @PostMapping("/operations/cases/{caseId}/discharge/final-invoice")
    public DischargeView finalInvoice(@PathVariable UUID caseId, @Valid @RequestBody FinalInvoiceRequest request) { return discharge.recordFinalInvoice(caseId, request); }

    @PostMapping("/operations/cases/{caseId}/discharge/return")
    public DischargeView confirmReturn(@PathVariable UUID caseId, @Valid @RequestBody ReturnTravelRequest request) { return discharge.confirmReturn(caseId, request); }

    @PostMapping("/operations/cases/{caseId}/discharge/departure")
    public DischargeView departure(@PathVariable UUID caseId, @Valid @RequestBody DepartureRequest request) { return discharge.confirmDeparture(caseId, request); }

    // ---- the patient ----

    @GetMapping("/patient/cases/{caseId}/discharge")
    public PatientDischargeView patientView(@PathVariable UUID caseId) { return discharge.patientView(caseId); }

    @PostMapping("/public/cases/{token}/discharge")
    public PatientDischargeView publicView(@PathVariable String token, @Valid @RequestBody CaseAccessRequest request) {
        return discharge.viewFromLink(token, request.grant());
    }
}
