package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The case's travel and arrival plan (one per case), maintained by Operations. {@code version} is managed explicitly. */
@Entity
@Table(name = "travel_plans")
public class TravelPlan extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false, unique = true) private UUID caseId;
    @Column(name = "planned_arrival") private Instant plannedArrival;
    @Column(name = "confirmed_arrival") private Instant confirmedArrival;
    @Column(name = "visa_status", length = 80) private String visaStatus;
    @Column(name = "flight_details", columnDefinition = "text") private String flightDetails;
    @Column(name = "airport_reception", columnDefinition = "text") private String airportReception;
    @Column(columnDefinition = "text") private String accommodation;
    @Column(name = "local_transport", columnDefinition = "text") private String localTransport;
    @Column(name = "companion_details", columnDefinition = "text") private String companionDetails;
    @Column(length = 300) private String facility;
    @Column(columnDefinition = "text") private String exceptions;
    @Column(name = "responsible_subject") private String responsibleSubject;
    @Column(nullable = false, length = 40) private String status;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected TravelPlan() {}

    public TravelPlan(UUID caseId) {
        super(UUID.randomUUID());
        this.caseId = caseId;
    }

    /** The plan as Operations entered it. */
    public record Details(Instant plannedArrival, Instant confirmedArrival, String visaStatus, String flightDetails, String airportReception,
                          String accommodation, String localTransport, String companionDetails, String facility, String exceptions) {}

    /** Replaces the plan; an existing plan moves to its next version. */
    public void record(Details d, String responsibleSubject, String status, Instant now) {
        plannedArrival = micros(d.plannedArrival()); confirmedArrival = micros(d.confirmedArrival()); visaStatus = d.visaStatus();
        flightDetails = d.flightDetails(); airportReception = d.airportReception(); accommodation = d.accommodation();
        localTransport = d.localTransport(); companionDetails = d.companionDetails(); facility = d.facility(); exceptions = d.exceptions();
        this.responsibleSubject = responsibleSubject; this.status = status; updatedAt = micros(now);
        if (!isNew()) version++;
    }
}
