package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository.OpenWorkRow;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.journey.api.WorkDtos.NotificationFeed;
import com.rehletshifaa.journey.api.WorkDtos.NotificationView;
import com.rehletshifaa.journey.api.WorkDtos.WorkItemView;
import com.rehletshifaa.journey.infrastructure.StaffNotificationRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The staff member's own read models: My Work and the notification centre.
 *
 * <p>Both are scoped to the signed-in subject. The work queue is assembled from a fixed number of queries whatever its
 * length — the open tasks with their case facts, then one batched lookup each for document counts, active coordinators
 * and the coordinators' names — never one query per row.
 */
@Service
public class StaffWorkQueryService {
    private static final int FEED_SIZE = 30;

    private final Authority authority;
    private final CaseTaskRepository tasks;
    private final CaseAssignmentRepository assignments;
    private final MedicalDocumentRepository documents;
    private final WorkforcePersonRepository people;
    private final StaffNotificationRepository notifications;
    private final CryptoService crypto;
    private final Clock clock;

    public StaffWorkQueryService(Authority authority, CaseTaskRepository tasks, CaseAssignmentRepository assignments,
                                 MedicalDocumentRepository documents, WorkforcePersonRepository people,
                                 StaffNotificationRepository notifications, CryptoService crypto, Clock clock) {
        this.authority = authority; this.tasks = tasks; this.assignments = assignments; this.documents = documents;
        this.people = people; this.notifications = notifications; this.crypto = crypto; this.clock = clock;
    }

    /** Work assigned to me right now, most urgent first, with the context needed to act. */
    @Transactional(readOnly = true)
    public List<WorkItemView> myWork() {
        var actor = authority.authorize(Permission.TASK_WORK);
        List<OpenWorkRow> rows = tasks.findOpenWorkOf(actor.subject());
        if (rows.isEmpty()) return List.of();
        Set<UUID> caseIds = rows.stream().map(OpenWorkRow::getCaseId).collect(Collectors.toSet());

        Map<UUID, Long> documentCounts = documents.countByCaseExcluding(caseIds, DocumentStatus.REJECTED).stream()
                .collect(Collectors.toMap(MedicalDocumentRepository.CaseDocumentCount::getCaseId,
                        MedicalDocumentRepository.CaseDocumentCount::getDocuments));
        Map<UUID, String> coordinators = new HashMap<>();
        for (var coordinator : assignments.findActiveCoordinators(caseIds))
            coordinators.putIfAbsent(coordinator.getCaseId(), coordinator.getSubject()); // newest assignment wins
        Map<String, String> names = staffDisplayNames(coordinators.values());

        Instant now = clock.instant();
        return rows.stream().map(row -> new WorkItemView(row.getId(), row.getCaseId(), row.getCaseNumber(), row.getPatientName(),
                row.getCaseStatus() == null ? null : row.getCaseStatus().name(), row.getWaitingOn(), row.getCareCategory(),
                names.get(coordinators.get(row.getCaseId())), documentCounts.getOrDefault(row.getCaseId(), 0L),
                row.getTaskType(), decrypt(row.getTitle()), decrypt(row.getDescription()), row.getPriority(), row.getStatus(),
                Boolean.TRUE.equals(row.getBlocking()), row.getDueAt(), row.getDueAt() != null && row.getDueAt().isBefore(now),
                row.getCreatedAt(), row.getVersion(), StaffWorkService.copyOf(crypto, row.getCopyCode(), row.getCopyParams()))).toList();
    }

    /** My latest notifications and how many are unread. Listing never marks anything read. */
    @Transactional(readOnly = true)
    public NotificationFeed myNotifications() {
        String subject = Principal.current().subject();
        List<NotificationView> items = notifications.findFeed(subject, Limit.of(FEED_SIZE)).stream()
                .map(n -> new NotificationView(n.getId(), n.getCaseId(), n.getCaseNumber(), n.getTaskId(), n.getEventType(),
                        decrypt(n.getTitle()), decrypt(n.getContext()), n.getCreatedAt(), n.getReadAt() != null,
                        StaffWorkService.copyOf(crypto, n.getCopyCode(), n.getCopyParams())))
                .toList();
        return new NotificationFeed((int) notifications.countByRecipientSubjectAndReadAtIsNull(subject), items);
    }

    /** Coordinator names come from the staff directory; a subject is never handed to the interface. */
    private Map<String, String> staffDisplayNames(java.util.Collection<String> subjects) {
        List<String> wanted = subjects.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
        Map<String, String> names = new HashMap<>();
        if (wanted.isEmpty()) return names;
        for (WorkforcePerson person : people.findAllById(wanted))
            if (person.getDisplayNameEncrypted() != null) names.put(person.getSubject(), crypto.decrypt(person.getDisplayNameEncrypted()));
        return names;
    }

    private String decrypt(String value) { return EncryptedText.decodeNullable(crypto, value); }
}
