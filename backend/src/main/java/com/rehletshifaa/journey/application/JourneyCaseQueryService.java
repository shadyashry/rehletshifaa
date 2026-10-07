package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository.CaseRow;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.journey.api.JourneyDtos.AssignmentHistoryEntry;
import com.rehletshifaa.journey.api.JourneyDtos.CaseView;
import com.rehletshifaa.journey.api.JourneyDtos.StaffCaseCardView;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Cases as the queues, lists and case page show them, and the names of the people on them.
 *
 * <p>A list costs a fixed number of queries whatever its length: the case rows with their patient's name, then one
 * batched read of the coordinator and consultant assignments and one each for staff and consultant names. Queue cards
 * add one aggregate over the open work, one read of the viewer's own assignments and one document count. Nothing here
 * authorizes: {@link JourneyService} authorizes and then asks.
 */
@Service
public class JourneyCaseQueryService {
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final CaseTaskRepository tasks;
    private final MedicalDocumentRepository documents;
    private final PractitionerProfileRepository practitioners;
    private final WorkforcePersonRepository people;
    private final CryptoService crypto;

    public JourneyCaseQueryService(MedicalCaseRepository cases, CaseAssignmentRepository assignments, CaseTaskRepository tasks,
                                   MedicalDocumentRepository documents, PractitionerProfileRepository practitioners,
                                   WorkforcePersonRepository people, CryptoService crypto) {
        this.cases = cases; this.assignments = assignments; this.tasks = tasks; this.documents = documents;
        this.practitioners = practitioners; this.people = people; this.crypto = crypto;
    }

    /** The cases of the patient the subject is, or represents; latest change first. */
    List<CaseView> patientCases(String subject, Instant now) { return withAssignments(cases.findPatientCaseRows(subject, micros(now))); }

    /** Unowned submitted cases plus the cases the subjects coordinate; latest change first. */
    List<CaseView> coordinatorQueue(Set<String> subjects) { return withAssignments(cases.findCoordinatorQueueRows(subjects)); }

    /** Cases one of the subjects actively holds in the assignment role; least recently changed first. */
    List<CaseView> assignedCases(Set<String> subjects, String assignmentRole) {
        return withAssignments(cases.findAssignedCaseRows(subjects, assignmentRole));
    }

    CaseView caseView(UUID caseId) {
        CaseRow row = cases.findCaseRow(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return withAssignments(List.of(row)).get(0);
    }

    /** The patient sees the people on their case by name only: staff identity subjects are internal identifiers. */
    static CaseView forPatient(CaseView view) {
        return new CaseView(view.id(), view.caseNumber(), view.status(), view.patientName(), view.country(), view.preferredLanguage(),
                view.careCategory(), view.createdAt(), view.updatedAt(), view.version(), null, null, view.coordinatorName(), view.doctorName(),
                view.travelPackageRequested(), view.waitingOn(), view.waitingReason());
    }

    /**
     * Case cards with the operational signals the queue orders by: overdue, blocking-overdue, high-priority, the next due
     * date and whether a patient response is waiting for staff review, plus the viewer's own assignment and the document
     * count. Nothing is persisted — attention is a view over work items, never a second status on the case.
     */
    List<StaffCaseCardView> staffCaseCards(List<CaseView> views, String subject, String assignmentRole, Instant now) {
        if (views.isEmpty()) return List.of();
        Set<UUID> ids = views.stream().map(CaseView::id).collect(Collectors.toSet());
        // Active before pending, oldest first, overwriting: the latest pending assignment wins, else the latest active one.
        Map<UUID, CaseAssignmentRepository.HeldAssignment> held = new HashMap<>();
        for (var assignment : assignments.findHeldBy(ids, subject, assignmentRole)) held.put(assignment.getCaseId(), assignment);
        Map<UUID, CaseTaskRepository.WorkSignals> signals = tasks.findWorkSignals(ids, micros(now)).stream()
                .collect(Collectors.toMap(CaseTaskRepository.WorkSignals::getCaseId, s -> s));
        Map<UUID, Long> documentCounts = documents.countByCaseExcluding(ids, DocumentStatus.REJECTED).stream()
                .collect(Collectors.toMap(MedicalDocumentRepository.CaseDocumentCount::getCaseId, MedicalDocumentRepository.CaseDocumentCount::getDocuments));
        return views.stream().map(view -> {
            var assignment = held.get(view.id());
            var s = signals.get(view.id());
            return new StaffCaseCardView(view, assignment == null ? null : assignment.getId(), assignment == null ? null : assignment.getStatus(),
                    s == null ? 0 : s.getOpenCount(), s == null ? 0 : s.getOverdueCount(), documentCounts.getOrDefault(view.id(), 0L),
                    s == null ? 0 : s.getBlockingOverdueCount(), s == null ? 0 : s.getHighPriorityCount(), s == null ? null : s.getNextDue(),
                    s != null && s.getPatientResponseCount() > 0);
        }).toList();
    }

    /** Every responsibility record on the case, newest first, with the names of the assignee and of the person who assigned. */
    List<AssignmentHistoryEntry> assignmentHistory(UUID caseId) {
        var rows = assignments.findHistoryOf(caseId);
        Names names = names(rows.stream().flatMap(r -> Stream.of(r.getSubject(), r.getAssignedBy())).toList());
        return rows.stream().map(row -> {
            String by = row.getAssignedBy();
            String kind = "ROUTING_ENGINE".equals(by) ? "ROUTING" : "SYSTEM".equals(by) ? "SYSTEM" : "PERSON";
            return new AssignmentHistoryEntry(row.getRole(), names.actor(row.getSubject(), row.getRole()), row.getStatus(), row.getAssignedAt(),
                    row.getEndedAt(), kind, "PERSON".equals(kind) ? names.person(by) : null, row.getReason());
        }).toList();
    }

    /** The display name of one actor (see {@link Names#actor}). */
    String actorName(String subject, String role) { return names(subject == null ? List.of() : List.of(subject)).actor(subject, role); }

    /** Staff and consultant names of the subjects, in two queries. */
    Names names(Collection<String> subjects) {
        List<String> wanted = subjects.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
        if (wanted.isEmpty()) return new Names(Map.of(), Map.of(), crypto);
        Map<String, String> staff = new HashMap<>();
        for (WorkforcePerson person : people.findAllById(wanted)) staff.put(person.getSubject(), person.getDisplayNameEncrypted());
        Map<String, String> consultants = new HashMap<>();
        for (var profile : practitioners.findDisplayNames(wanted)) consultants.put(profile.getSubject(), profile.getDisplayName());
        return new Names(staff, consultants, crypto);
    }

    /**
     * Names of a known set of people. Staff names come from the staff directory (decrypted when used), consultant names
     * from their profiles; the secure-link and system actors are named plainly so the journey never shows a raw subject.
     */
    static final class Names {
        private static final Set<String> STAFF_ROLES = Set.of("COORDINATOR", "COORDINATOR_LEAD", "OPERATIONS", "OPERATIONS_LEAD", "FINANCE", "FINANCE_LEAD");
        private final Map<String, String> staffEncrypted;
        private final Map<String, String> consultants;
        private final CryptoService crypto;

        private Names(Map<String, String> staffEncrypted, Map<String, String> consultants, CryptoService crypto) {
            this.staffEncrypted = staffEncrypted; this.consultants = consultants; this.crypto = crypto;
        }

        String staff(String subject) {
            String encrypted = subject == null ? null : staffEncrypted.get(subject);
            return encrypted == null ? null : crypto.decrypt(encrypted);
        }

        String consultant(String subject) { return subject == null ? null : consultants.get(subject); }

        /** A staff member, else a consultant. */
        String person(String subject) { String staff = staff(subject); return staff != null ? staff : consultant(subject); }

        /** A timeline or assignment actor. */
        String actor(String subject, String role) {
            if (subject == null || subject.isBlank()) return null;
            if ("SYSTEM".equals(subject) || "SYSTEM".equals(role)) return "System";
            if ("SECURE_LINK".equals(subject)) return "Patient";
            if ("DOCTOR".equals(role)) { String name = consultant(subject); if (name != null) return name; }
            String staff = staff(subject);
            if (staff != null) return staff;
            return "PATIENT".equals(role) || "PATIENT_REPRESENTATIVE".equals(role) ? "Patient" : null;
        }

        /** A message sender. */
        String sender(String subject, String role) {
            if ("DOCTOR".equals(role)) { String name = consultant(subject); return name != null ? name : "Doctor"; }
            if (STAFF_ROLES.contains(role)) return staff(subject);
            return "Patient";
        }
    }

    /**
     * Fills the coordinator and consultant of each case from one batched read. The consultant's subject is exposed only once
     * the assignment is ACTIVE; the name also covers a PENDING assignment so staff can see who a case is waiting on.
     */
    private List<CaseView> withAssignments(List<CaseRow> rows) {
        if (rows.isEmpty()) return List.of();
        Set<UUID> ids = rows.stream().map(CaseRow::getId).collect(Collectors.toSet());
        Map<UUID, String> coordinators = new HashMap<>(), activeDoctors = new HashMap<>(), namedDoctors = new HashMap<>();
        // Oldest first, overwriting: the latest assignment per case and role wins.
        for (var holder : assignments.findCaseHolders(ids)) {
            boolean active = "ACTIVE".equals(holder.getStatus());
            if ("COORDINATOR".equals(holder.getRole())) { if (active) coordinators.put(holder.getCaseId(), holder.getSubject()); }
            else { if (active) activeDoctors.put(holder.getCaseId(), holder.getSubject()); namedDoctors.put(holder.getCaseId(), holder.getSubject()); }
        }
        Set<String> subjects = new HashSet<>(coordinators.values());
        subjects.addAll(namedDoctors.values());
        Names names = names(subjects);
        return rows.stream().map(row -> {
            String coordinator = coordinators.get(row.getId());
            return new CaseView(row.getId(), row.getCaseNumber(), row.getStatus().name(), row.getPatientName(), row.getCountry(),
                    row.getPreferredLanguage(), row.getCareCategory(), row.getCreatedAt(), row.getUpdatedAt(), row.getVersion(), coordinator,
                    activeDoctors.get(row.getId()), names.staff(coordinator), names.consultant(namedDoctors.get(row.getId())),
                    Boolean.TRUE.equals(row.getTravelPackageRequested()), row.getWaitingOn(), row.getWaitingReason());
        }).toList();
    }
}
