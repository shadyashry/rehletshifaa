package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.FirstConfirmedAppointmentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import static com.rehletshifaa.journey.api.JourneyDtos.*;

@RestController
@RequestMapping("/api/v1/cases/{caseId}/first-confirmed-appointment")
public class FirstConfirmedAppointmentController {
    private final FirstConfirmedAppointmentService appointments;
    public FirstConfirmedAppointmentController(FirstConfirmedAppointmentService appointments) { this.appointments = appointments; }
    @PostMapping
    public FirstConfirmedAppointmentView record(@PathVariable UUID caseId, @Valid @RequestBody FirstConfirmedAppointmentRequest request) {
        return appointments.record(caseId, request);
    }
}
