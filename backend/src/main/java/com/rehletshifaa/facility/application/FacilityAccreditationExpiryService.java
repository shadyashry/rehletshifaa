package com.rehletshifaa.facility.application;

import com.rehletshifaa.facility.infrastructure.FacilityAccreditationRepository;
import com.rehletshifaa.facility.infrastructure.FacilityRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Facility accreditation lifecycle in time: a current accreditation expires the day after its expiry date, a facility's
 * derived accreditation state follows its records, and renewal reminders go to the facility's business contact ahead of
 * expiry. A facility is never a user: no staff notification and no work item.
 */
@Service
public class FacilityAccreditationExpiryService {
    private final Clock clock;
    private final FacilityAccreditationRepository accreditations;
    private final FacilityRepository facilities;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private final CryptoService crypto;
    private final List<Integer> reminderDays;

    public FacilityAccreditationExpiryService(Clock clock, FacilityAccreditationRepository accreditations, FacilityRepository facilities,
            NotificationOutbox notificationOutbox, AuditTrail auditTrail, CryptoService crypto,
            @Value("${app.facilities.reminder-days:60,30,7}") List<Integer> reminderDays) {
        this.clock = clock;
        this.accreditations = accreditations;
        this.facilities = facilities;
        this.notificationOutbox = notificationOutbox;
        this.auditTrail = auditTrail;
        this.crypto = crypto;
        this.reminderDays = reminderDays.stream().filter(days -> days > 0).distinct().sorted(Comparator.reverseOrder()).toList();
    }

    @LeasedJob(maxHold = LeasedJob.EXPIRY_SCAN)
    @Scheduled(fixedDelayString = "${app.facilities.expiry-scan-ms:3600000}")
    @Transactional
    public void expireAccreditations() {
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        List<UUID> lapsed = accreditations.findFacilitiesWithLapsed(today);
        accreditations.expireLapsed(today);

        for (UUID facilityId : lapsed) {
            var facility = facilities.findById(facilityId).orElse(null);
            if (facility == null) continue;
            if (facility.accreditation(accreditations.hasCurrent(facilityId, today), accreditations.hasExpired(facilityId))) {
                facilities.saveAndFlush(facility);
                auditTrail.event("FACILITY_ACCREDITATION_LAPSED").actor("SYSTEM", "SYSTEM").entity("Facility", facilityId).action("EXPIRE").at(now).record();
            }
        }
        for (int days : reminderDays) enqueueReminders(now, today, days);
    }

    private void enqueueReminders(Instant now, LocalDate today, int days) {
        LocalDate boundary = today.plusDays(days);
        for (var due : accreditations.findExpiringWithContact(today, boundary)) {
            String key = "facility-accreditation-reminder:" + due.getAccreditationId() + ":" + due.getExpiresOn() + ":" + days;
            String data = "{\"days\":\"" + days + "\",\"facility\":\"" + escape(due.getFacilityName()) + "\",\"body\":\"" + escape(due.getBody()) + "\"}";
            notificationOutbox.enqueueOnce("FACILITY_ACCREDITATION", "EMAIL", due.getContactEmail(), "facility-accreditation-expiry", "enc:" + crypto.encrypt(data), key, now);
        }
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
