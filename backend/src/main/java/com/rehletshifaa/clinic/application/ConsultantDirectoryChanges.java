package com.rehletshifaa.clinic.application;
import com.rehletshifaa.clinic.domain.*;
import com.rehletshifaa.clinic.infrastructure.ConsultantDirectoryRepository;
import com.rehletshifaa.directory.domain.PractitionerDirectoryFactsChanged;
import com.rehletshifaa.notification.application.NotificationOutbox;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import java.time.Clock;

/** Synchronous events persist the durable invalidation in the same transaction as the directory change. */
@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ConsultantDirectoryChanges {
    private final ConsultantDirectoryRepository profiles;
    private final NotificationOutbox outbox;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    public ConsultantDirectoryChanges(ConsultantDirectoryRepository profiles,NotificationOutbox outbox,ApplicationEventPublisher events,Clock clock) {
        this.profiles=profiles; this.outbox=outbox; this.events=events; this.clock=clock;
    }
    public void enqueue(ConsultantDirectoryProfile profile, String reason) {
        events.publishEvent(new ConsultantDirectoryChanged(profile.getPractitionerId(),profile.getSlug(),reason,profile.getVersion()));
    }
    @EventListener
    public void factsChanged(PractitionerDirectoryFactsChanged event) {
        profiles.lockById(event.practitionerId()).ifPresent(profile -> {
            profile.touch(clock.instant()); profiles.saveAndFlush(profile); enqueue(profile,"practitioner-facts");
        });
    }
    @EventListener
    public void directoryChanged(ConsultantDirectoryChanged event) {
        if (event.slug()==null || !event.slug().matches("[a-z0-9]+(?:-[a-z0-9]+)*") || event.slug().length()>80)
            throw new IllegalArgumentException("Invalid directory event slug");
        if (event.reason()==null || !event.reason().matches("[a-z-]{1,40}")) throw new IllegalArgumentException("Invalid directory event reason");
        outbox.enqueueOnce("CONSULTANT_DIRECTORY_CHANGED","REVALIDATION",event.slug(),"consultant-directory-revalidate",
                "{\"slug\":\""+event.slug()+"\",\"reason\":\""+event.reason()+"\"}","consultant-directory:"+event.practitionerId()+":"+event.version(),clock.instant());
    }
}
