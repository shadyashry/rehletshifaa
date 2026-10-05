package com.rehletshifaa.access.platform.application;

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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** STF-04/05: provider resolution proposes a binding; only the authenticated holder can accept it. */
@Service
public class WorkforceIdentityReviewService {
    private final JdbcClient jdbc;
    private final StaffLifecycleStore staff;
    private final WorkforceRoleAssignmentStore roles;
    private final PlatformAccessRepository access;
    private final Authority authority;
    private final IdentityProvisioningPort identities;
    private final CryptoService crypto;
    private final GovernanceAuditLog audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public WorkforceIdentityReviewService(JdbcClient jdbc, StaffLifecycleStore staff, WorkforceRoleAssignmentStore roles,
            PlatformAccessRepository access, Authority authority, IdentityProvisioningPort identities, CryptoService crypto,
            GovernanceAuditLog audit, ApplicationEventPublisher events, Clock clock) {
        this.jdbc=jdbc; this.staff=staff; this.roles=roles; this.access=access; this.authority=authority;
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
        if (jdbc.sql("SELECT COUNT(*) FROM workforce_identity_reviews WHERE invitation_id=?").param(invitationId).query(Long.class).single()>0) return;
        var invitation=staff.invitationForUpdate(invitationId);
        EmailIdentity match=exact(resolution, crypto.decrypt(invitation.emailEncrypted()));
        boolean otherPopulation=staff.emailKnownElsewhere(StaffLifecycleService.hash(crypto.decrypt(invitation.emailEncrypted())))
                || (match!=null && patientIdentity(match.subject()));
        String state=match!=null && !otherPopulation && compatible(match.subject(), invitation.roles())
                ? "AWAITING_ACCEPTANCE" : "PENDING_REVIEW";
        String subject="AWAITING_ACCEPTANCE".equals(state)?match.subject():null;
        UUID id=UUID.randomUUID();
        jdbc.sql("INSERT INTO workforce_identity_reviews(id,invitation_id,status,resolved_subject,review_reason,created_at,updated_at,revision) VALUES(?,?,?,?,?,?,?,0)")
                .params(id, invitationId, state, subject, reason, timestamp(clock.instant()), timestamp(clock.instant())).update();
        jdbc.sql("UPDATE workforce_invitations SET status=?,revision=revision+1 WHERE id=?")
                .params(state,invitationId).update();
        history(id,state,actor,reason,0);
        audit.record(actor,id.toString(),"WORKFORCE_IDENTITY_REVIEW_OPENED","SUCCESS","invitation="+invitationId+"; state="+state,reason);
    }

    @Transactional(readOnly=true)
    public List<Review> queue() {
        authority.require(Permission.WORKFORCE_ADMINISTER);
        return jdbc.sql("SELECT id FROM workforce_identity_reviews ORDER BY created_at DESC,id LIMIT 200").query(UUID.class).list().stream().map(this::view).toList();
    }

    @Transactional(readOnly=true)
    public List<Review> pendingAcceptance() {
        String subject=Principal.current().subject();
        return jdbc.sql("SELECT r.id FROM workforce_identity_reviews r JOIN workforce_invitations i ON i.id=r.invitation_id "
                        + "WHERE r.resolved_subject=? AND r.status='AWAITING_ACCEPTANCE' AND i.status='AWAITING_ACCEPTANCE' AND i.expires_at>? ORDER BY r.created_at")
                .params(subject,timestamp(clock.instant())).query(UUID.class).list().stream().map(this::holderView).toList();
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
        var existing=jdbc.sql("SELECT id FROM workforce_identity_reviews WHERE invitation_id=?").param(invitationId).query(UUID.class).optional();
        if (existing.isPresent()) {
            Review review=locked(existing.get());
            transition(review,"PENDING_REVIEW",null,"system","Identity creation collided with an existing account",false);
            staff.setInvitationStatus(invitation,"PENDING_REVIEW",clock.instant());
        } else open(invitationId,identities.resolveEmail(crypto.decrypt(invitation.emailEncrypted())),"system","Identity creation found an existing account");
    }

    public boolean adopted(UUID invitationId) {
        return jdbc.sql("SELECT identity_adopted FROM workforce_invitations WHERE id=?").param(invitationId).query(Boolean.class).single();
    }

    /** Invitation withdrawal also closes pending reviews, retaining history without touching provider accounts. */
    public void close(UUID invitationId,String actor,String reason) {
        var ids=jdbc.sql("SELECT id FROM workforce_identity_reviews WHERE invitation_id=? AND status IN ('PENDING_REVIEW','AWAITING_ACCEPTANCE')")
                .param(invitationId).query(UUID.class).list();
        for(UUID id:ids) transition(locked(id),"REJECTED",null,actor,reason,false);
    }

    private boolean patientIdentity(String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM patient_profiles WHERE external_subject=?").param(subject).query(Long.class).single()>0;
    }
    private boolean prohibitedPopulation(String subject) {
        return roles.consultantIdentity(subject)
                || jdbc.sql("SELECT COUNT(*) FROM practice_managers WHERE manager_subject=?").param(subject).query(Long.class).single()>0;
    }
    private boolean compatible(String subject,List<String> requested) {
        if (roles.consultantIdentity(subject) || jdbc.sql("SELECT COUNT(*) FROM practice_managers WHERE manager_subject=?").param(subject).query(Long.class).single()>0) return false;
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
        Instant now=clock.instant();
        jdbc.sql("INSERT INTO access_subjects(subject,active,revision) SELECT ?,FALSE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)").params(subject,subject).update();
        jdbc.sql("INSERT INTO workforce_people(subject,display_name_encrypted,email_encrypted,email_hash,locale,lifecycle_status,created_at,updated_at,revision) "
                        + "SELECT ?,display_name_encrypted,email_encrypted,email_hash,locale,'INVITED',created_at,?,0 FROM workforce_invitations WHERE id=?")
                .params(subject,timestamp(now),invitation.id()).update();
        for(String role:invitation.roles()) jdbc.sql("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                        + "SELECT ?,?,?,?,'ACTIVE','INVITATION',invited_by,reason,?,0 FROM workforce_invitations WHERE id=?")
                .params(UUID.randomUUID(),subject,role,timestamp(now),timestamp(now),invitation.id()).update();
        jdbc.sql("UPDATE workforce_invitations SET subject=?,status='SENT',identity_adopted=TRUE,revision=revision+1 WHERE id=?")
                .params(subject,invitation.id()).update();
    }
    private Review locked(UUID id) {
        jdbc.sql("SELECT id FROM workforce_identity_reviews WHERE id=? FOR UPDATE").param(id).query(UUID.class).optional()
                .orElseThrow(()->new ApiException(404,"IDENTITY_REVIEW_NOT_FOUND","Workforce identity review not found"));
        return view(id);
    }
    private Review holderView(UUID id) {
        Review r=view(id);
        return new Review(r.id(),r.invitationId(),r.name(),r.email(),r.status(),r.subject(),null,"Workforce invitation",r.revision(),List.of());
    }
    private Review view(UUID id) {
        var history=jdbc.sql("SELECT status,actor,reason,recorded_at,revision FROM workforce_identity_review_history WHERE review_id=? ORDER BY revision")
                .param(id).query((rs,n)->new History(rs.getString(1),rs.getString(2),rs.getString(3),rs.getTimestamp(4).toInstant(),rs.getLong(5))).list();
        return jdbc.sql("SELECT r.*,i.display_name_encrypted,i.email_encrypted FROM workforce_identity_reviews r JOIN workforce_invitations i ON i.id=r.invitation_id WHERE r.id=?")
                .param(id).query((rs,n)->new Review(id,rs.getObject("invitation_id",UUID.class),crypto.decrypt(rs.getString("display_name_encrypted")),
                        crypto.decrypt(rs.getString("email_encrypted")),rs.getString("status"),rs.getString("resolved_subject"),rs.getString("reviewed_by"),
                        rs.getString("review_reason"),rs.getLong("revision"),history)).single();
    }
    private void transition(Review review,String status,String subject,String actor,String reason,boolean accepted) {
        if(jdbc.sql("UPDATE workforce_identity_reviews SET status=?,resolved_subject=?,reviewed_by=?,review_reason=?,updated_at=?,accepted_at=?,revision=revision+1 WHERE id=? AND revision=?")
                .params(status,subject,accepted?review.reviewer():actor,reason,timestamp(clock.instant()),accepted?timestamp(clock.instant()):null,review.id(),review.revision()).update()!=1) stale();
        history(review.id(),status,actor,reason,review.revision()+1);
        audit.record(actor,review.id().toString(),"WORKFORCE_IDENTITY_REVIEW_"+status,"SUCCESS","invitation="+review.invitationId(),reason);
    }
    private void history(UUID id,String status,String actor,String reason,long revision) {
        jdbc.sql("INSERT INTO workforce_identity_review_history(id,review_id,status,actor,reason,recorded_at,revision) VALUES(?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(),id,status,actor,reason,timestamp(clock.instant()),revision).update();
    }
    private static String reason(String value) {
        if(value==null || value.isBlank() || value.length()>1000) throw new ApiException(400,"REASON_REQUIRED","Give a review reason of up to 1000 characters");
        return value.trim();
    }
    private static void conflict() { throw new ApiException(409,"ROLE_CONFLICT","This identity has an incompatible platform population or role relationship"); }
    private static void stale() { throw new ApiException(409,"STALE_IDENTITY_REVIEW","This identity review changed; reload and try again"); }
}
