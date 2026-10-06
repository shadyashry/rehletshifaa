package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.directory.infrastructure.PracticeManagerRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceInvitationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceIdentityReviewHistoryRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceIdentityReviewRepository;
import com.rehletshifaa.workforce.application.WorkforceEnrolment;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.StaffLifecycleStore;
import com.rehletshifaa.access.platform.infrastructure.WorkforceRoleAssignmentStore;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.IdentityProvisioningPort.EmailIdentity;
import com.rehletshifaa.identity.IdentityProvisioningPort.EmailResolution;
import com.rehletshifaa.identity.operations.IdentityOperationRequested;
import com.rehletshifaa.identity.operations.WorkforceIdentityConflictDetected;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.domain.WorkforceIdentityReview;
import com.rehletshifaa.workforce.domain.WorkforceIdentityReviewHistory;
import com.rehletshifaa.workforce.domain.WorkforceInvitation;
import org.springframework.data.domain.Limit;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** STF-04/05: provider resolution proposes a binding; only the authenticated holder can accept it. */
@Service
public class WorkforceIdentityReviewService {
    private final PatientProfileRepository patients;
    private final PracticeManagerRepository practiceManagers;
    private final WorkforceInvitationRepository invitations;
    private final WorkforceIdentityReviewHistoryRepository history;
    private final WorkforceIdentityReviewRepository reviews;
    private static final Set<String> OPEN=Set.of("PENDING_REVIEW","AWAITING_ACCEPTANCE");
    private final WorkforceEnrolment enrolment;
    private final StaffLifecycleStore staff;
    private final WorkforceRoleAssignmentStore roles;
    private final PlatformAccessRepository access;
    private final Authority authority;
    private final IdentityProvisioningPort identities;
    private final CryptoService crypto;
    private final GovernanceAuditLog audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public WorkforceIdentityReviewService(StaffLifecycleStore staff, WorkforceRoleAssignmentStore roles,
            PlatformAccessRepository access, Authority authority, IdentityProvisioningPort identities, CryptoService crypto,
            GovernanceAuditLog audit, ApplicationEventPublisher events, Clock clock, WorkforceEnrolment enrolment, WorkforceIdentityReviewRepository reviews, WorkforceIdentityReviewHistoryRepository history, WorkforceInvitationRepository invitations, PracticeManagerRepository practiceManagers, PatientProfileRepository patients) { this.patients = patients; this.practiceManagers = practiceManagers; this.invitations = invitations; this.history = history; this.reviews = reviews; this.enrolment = enrolment;
        this.staff=staff; this.roles=roles; this.access=access; this.authority=authority;
        this.identities=identities; this.crypto=crypto; this.audit=audit; this.events=events; this.clock=clock;
    }
    public record Decision(long revision, String outcome, String reason) {}
    public record Acceptance(long revision) {}
    public record History(String status, String actor, String reason, Instant at, long revision) {}
    public record Review(UUID id, UUID invitationId, String name, String email, String status, String subject,
                         String reviewer, String reason, long revision, List<History> history) {}

    /** Called under the governance lock, after the invitation is persisted. No authority is created here. */
    @Transactional
    public void open(UUID invitationId, EmailResolution resolution, String actor, String reason) {
        access.lockGovernance();
        if (reviews.existsByInvitationId(invitationId)) return;
        var invitation=staff.invitationForUpdate(invitationId);
        EmailIdentity match=exact(resolution, crypto.decrypt(invitation.emailEncrypted()));
        boolean otherPopulation=staff.emailKnownElsewhere(StaffLifecycleService.hash(crypto.decrypt(invitation.emailEncrypted())))
                || (match!=null && patientIdentity(match.subject()));
        String state=match!=null && !otherPopulation && compatible(match.subject(), invitation.roles())
                ? "AWAITING_ACCEPTANCE" : "PENDING_REVIEW";
        String subject="AWAITING_ACCEPTANCE".equals(state)?match.subject():null;
        UUID id=UUID.randomUUID();
        reviews.saveAndFlush(new WorkforceIdentityReview(id, invitationId, state, subject, reason, clock.instant()));
        staff.setInvitationState(invitationId, state);
        history(id,state,actor,reason,0);
        audit.record(actor,id.toString(),"WORKFORCE_IDENTITY_REVIEW_OPENED","SUCCESS","invitation="+invitationId+"; state="+state,reason);
    }

    @Transactional(readOnly=true)
    public List<Review> queue() {
        authority.require(Permission.WORKFORCE_ADMINISTER);
        return views(reviews.findNewest(Limit.of(200)));
    }

    @Transactional(readOnly=true)
    public List<Review> pendingAcceptance() {
        String subject=Principal.current().subject();
        return reviews.findAcceptableIds(subject,micros(clock.instant())).stream().map(this::holderView).toList();
    }

    @Transactional
    public Review decide(UUID id, Decision command) {
        authority.require(Permission.WORKFORCE_ADMINISTER);
        access.lockGovernance();
        String actor=Principal.current().subject();
        String reason=reason(command.reason());
        Review review=locked(id);
        if (review.revision()!=command.revision() || !Set.of("PENDING_REVIEW","AWAITING_ACCEPTANCE").contains(review.status())) stale();
        var invitation=staff.invitationForUpdate(review.invitationId());
        if (!invitation.expiresAt().isAfter(clock.instant()) || !Set.of("PENDING_REVIEW","AWAITING_ACCEPTANCE").contains(invitation.status()))
            throw new ApiException(409,"INVITATION_NOT_VALID","The invitation has expired or was withdrawn");
        if ("REJECT".equals(command.outcome())) {
            transition(review,"REJECTED",null,actor,reason,false);
            staff.setInvitationStatus(invitation,"REJECTED",clock.instant());
        } else if ("RESOLVE".equals(command.outcome())) {
            EmailResolution resolution=identities.resolveEmail(review.email());
            if (resolution==null || !resolution.available()) throw new ApiException(503,"IDENTITY_PROVIDER_UNAVAILABLE","Try again when the identity directory is available");
            if (resolution.identities().isEmpty()) {
                if (staff.emailKnownElsewhere(StaffLifecycleService.hash(review.email()))) conflict();
                staff.setInvitationStatus(invitation,"QUEUED",clock.instant());
                transition(review,"RESOLVED",null,actor,reason,false);
                events.publishEvent(IdentityOperationRequested.create(UUID.randomUUID(),"workforce-reviewed-create:"+id+":"+review.revision(),
                        IdentityOperationRequested.Type.CREATE_STAFF,actor,reason,"WorkforceInvitation",invitation.id(),
                        Map.of("name",review.name(),"email",review.email(),"locale",invitation.locale())));
            } else {
                EmailIdentity match=exact(resolution,review.email());
                if (match==null) throw new ApiException(409,"IDENTITY_NOT_EXACT","Exactly one enabled identity with verified email is required; correct the identity directory and retry");
                if (!compatible(match.subject(),invitation.roles()) || prohibitedPopulation(match.subject())) conflict();
                transition(review,"AWAITING_ACCEPTANCE",match.subject(),actor,reason,false);
                staff.setInvitationStatus(invitation,"AWAITING_ACCEPTANCE",clock.instant());
            }
        } else throw new ApiException(400,"INVALID_REVIEW_OUTCOME","Resolve or reject this identity review");
        return view(id);
    }

    @Transactional
    public Review accept(UUID id, Acceptance command) {
        // Same lock as invitations, role grants, administrator decisions and lifecycle mutations.
        access.lockGovernance();
        String subject=Principal.current().subject();
        Review review=locked(id);
        if (!subject.equals(review.subject())) throw new ApiException(403,"IDENTITY_HOLDER_REQUIRED","Only the resolved identity holder can accept this invitation");
        if ("RESOLVED".equals(review.status())) return holderView(id); // safe replay for the same holder
        if (review.revision()!=command.revision() || !"AWAITING_ACCEPTANCE".equals(review.status())) stale();
        var invitation=staff.invitationForUpdate(review.invitationId());
        if (!"AWAITING_ACCEPTANCE".equals(invitation.status()) || !invitation.expiresAt().isAfter(clock.instant()))
            throw new ApiException(409,"INVITATION_NOT_VALID","The invitation has expired or was withdrawn");
        EmailIdentity match=exact(identities.resolveEmail(review.email()),review.email());
        if (match==null || !subject.equals(match.subject())) throw new ApiException(409,"IDENTITY_NOT_EXACT","The identity directory no longer confirms this holder and verified email");
        if (!compatible(subject,invitation.roles()) || prohibitedPopulation(subject)) conflict();
        bind(invitation,subject);
        transition(review,"RESOLVED",subject,subject,"Identity holder accepted the workforce invitation",true);
        audit.record(subject,id.toString(),"WORKFORCE_IDENTITY_ADOPTED","SUCCESS","invitation="+invitation.id());
        return holderView(id);
    }

    /** Durable CREATE_STAFF collision recovery: route the race into review rather than duplicating or auto-linking. */
    @EventListener
    @Transactional
    public void creationConflict(WorkforceIdentityConflictDetected event) {
        UUID invitationId=event.invitationId();
        access.lockGovernance();
        var invitation=staff.invitationForUpdate(invitationId);
        if (!"QUEUED".equals(invitation.status())) return;
        var existing=reviews.findByInvitationId(invitationId).map(WorkforceIdentityReview::getId);
        if (existing.isPresent()) {
            Review review=locked(existing.get());
            transition(review,"PENDING_REVIEW",null,"system","Identity creation collided with an existing account",false);
            staff.setInvitationStatus(invitation,"PENDING_REVIEW",clock.instant());
        } else open(invitationId,identities.resolveEmail(crypto.decrypt(invitation.emailEncrypted())),"system","Identity creation found an existing account");
    }

    public boolean adopted(UUID invitationId) {
        return invitations.findById(invitationId).orElseThrow().isIdentityAdopted();
    }

    /** Invitation withdrawal also closes pending reviews, retaining history without touching provider accounts. */
    public void close(UUID invitationId,String actor,String reason) {
        var ids=reviews.findByInvitationIdAndStatusIn(invitationId,OPEN).stream().map(WorkforceIdentityReview::getId).toList();
        for(UUID id:ids) transition(locked(id),"REJECTED",null,actor,reason,false);
    }

    private boolean patientIdentity(String subject) {
        return patients.existsByExternalSubject(subject);
    }
    private boolean prohibitedPopulation(String subject) {
        return roles.consultantIdentity(subject)
                || practiceManagers.existsByManagerSubject(subject);
    }
    private boolean compatible(String subject,List<String> requested) {
        if (roles.consultantIdentity(subject) || practiceManagers.existsByManagerSubject(subject)) return false;
        // Existing workforce relationships require the dedicated lifecycle workflow, never another adoption.
        if (roles.lifecycle(subject).isPresent()) return false;
        for(String role:requested) {
            if (PlatformAccessRepository.SYSTEM_ADMINISTRATOR.equals(role) || roles.activeRoleFunction(role).isEmpty()
                    || roles.conflict(subject,role,clock.instant(),null).isPresent()) return false;
            for(String other:requested) if(!role.equals(other) && roles.pairConflict(role,other).isPresent()) return false;
        }
        return true;
    }
    private EmailIdentity exact(EmailResolution resolution,String email) {
        if(resolution==null || !resolution.available() || resolution.identities().size()!=1) return null;
        EmailIdentity match=resolution.identities().getFirst();
        return match.subject()!=null && !match.subject().isBlank() && !"null".equals(match.subject())
                && email.equalsIgnoreCase(match.email()) && match.verified() && match.enabled()?match:null;
    }
    private void bind(StaffLifecycleStore.Invitation invitation,String subject) {
        enrolment.adopt(invitation.id(), subject, clock.instant());
    }
    private Review locked(UUID id) {
        reviews.lockById(id).orElseThrow(()->new ApiException(404,"IDENTITY_REVIEW_NOT_FOUND","Workforce identity review not found"));
        return view(id);
    }
    private Review holderView(UUID id) {
        Review r=view(id);
        return new Review(r.id(),r.invitationId(),r.name(),r.email(),r.status(),r.subject(),null,"Workforce invitation",r.revision(),List.of());
    }
    private Review view(UUID id) {
        return views(List.of(reviews.findById(id).orElseThrow())).getFirst();
    }
    /** Reviews with their invitation and history, loaded with one query per table rather than per review. */
    private List<Review> views(List<WorkforceIdentityReview> found) {
        if (found.isEmpty()) return List.of();
        Map<UUID,WorkforceInvitation> byId=invitations.findAllById(found.stream().map(WorkforceIdentityReview::getInvitationId).toList())
                .stream().collect(Collectors.toMap(WorkforceInvitation::getId,Function.identity()));
        Map<UUID,List<History>> histories=history.findByReviewIdInOrderByRevision(found.stream().map(WorkforceIdentityReview::getId).toList())
                .stream().collect(Collectors.groupingBy(WorkforceIdentityReviewHistory::getReviewId,
                        Collectors.mapping(h->new History(h.getStatus(),h.getActor(),h.getReason(),h.getRecordedAt(),h.getRevision()),Collectors.toList())));
        return found.stream().map(r->{
            WorkforceInvitation i=byId.get(r.getInvitationId());
            return new Review(r.getId(),r.getInvitationId(),crypto.decrypt(i.getDisplayNameEncrypted()),crypto.decrypt(i.getEmailEncrypted()),
                    r.getStatus(),r.getResolvedSubject(),r.getReviewedBy(),r.getReviewReason(),r.getRevision(),histories.getOrDefault(r.getId(),List.of()));
        }).toList();
    }
    private void transition(Review review,String status,String subject,String actor,String reason,boolean accepted) {
        Instant now=clock.instant();
        if(reviews.transition(review.id(),review.revision(),status,subject,accepted?review.reviewer():actor,reason,micros(now),accepted?micros(now):null)!=1) stale();
        history(review.id(),status,actor,reason,review.revision()+1);
        audit.record(actor,review.id().toString(),"WORKFORCE_IDENTITY_REVIEW_"+status,"SUCCESS","invitation="+review.invitationId(),reason);
    }
    private void history(UUID id,String status,String actor,String reason,long revision) {
        history.saveAndFlush(new WorkforceIdentityReviewHistory(id,status,actor,reason,clock.instant(),revision));
    }
    private static String reason(String value) {
        if(value==null || value.isBlank() || value.length()>1000) throw new ApiException(400,"REASON_REQUIRED","Give a review reason of up to 1000 characters");
        return value.trim();
    }
    private static void conflict() { throw new ApiException(409,"ROLE_CONFLICT","This identity has an incompatible platform population or role relationship"); }
    private static void stale() { throw new ApiException(409,"STALE_IDENTITY_REVIEW","This identity review changed; reload and try again"); }
}
