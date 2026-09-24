package com.rehletshifaa.journey.application;

import com.rehletshifaa.access.application.AccessIdentity;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.util.PatientNames;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * V-3 (UX-4): the Provider Workspace's only case read — the caller's OWN assigned cases, as a minimum-necessary summary.
 *
 * <p>Relationship: exactly the one {@code JourneyService.authorizeRead} accepts for staff actors — a {@code case_assignments}
 * row with {@code assignee_subject} = caller in {@code PENDING} (offered, awaiting the clinician's accept/decline) or
 * {@code ACTIVE}. {@code DECLINED} and {@code ENDED} rows never qualify. It is narrowed further, never widened: only a
 * clinician ({@code DOCTOR}) assignment, reached through the caller's own provider enrollment (the same
 * case_assignments → practitioner → clinician_onboardings provenance the Assignment Engine uses), in an organization
 * that is not offboarded, where the caller's membership is active now. Organization membership, MANAGES, ASSISTS and
 * SUPERVISES are not inputs, so a practice manager, assistant, owner or supervising consultant receives nothing.
 *
 * <p>Response (S-ID + S-STATUS + S-PROP, matrix §2): case number, patient display name, case status, own assignment status
 * and date, proposal stage and document type. No internal ids, contact details, clinical content, amounts, messages,
 * tasks, travel or free text. Read-only, paged with a hard cap, never cached; there is no per-case lookup, so an
 * unrelated case is indistinguishable from a missing one. No total is returned.
 */
@Service
public class ProviderCaseSummaryService {
    static final int PAGE_SIZE=20;
    static final int MAX_PAGE=500;
    private final JdbcClient jdbc;
    private final AccessIdentity identity;
    private final Clock clock;

    public ProviderCaseSummaryService(JdbcClient jdbc,AccessIdentity identity,Clock clock){this.jdbc=jdbc;this.identity=identity;this.clock=clock;}

    @Transactional(readOnly=true)
    public CasePage mine(int page){
        if(page<0||page>MAX_PAGE)throw new ApiException(400,"INVALID_PAGE","Choose a valid page");
        var actor=identity.current();
        if(actor==null||actor.subject()==null||actor.subject().isBlank())return new CasePage(List.of(),page,false);
        Instant now=clock.instant();
        var rows=jdbc.sql("SELECT c.id,c.case_number,COALESCE("+PatientNames.DISPLAY_SQL+",c.full_name) patient_name,c.status case_status,a.status assignment_status,a.assigned_at "
                        +"FROM case_assignments a JOIN medical_cases c ON c.id=a.case_id LEFT JOIN patient_profiles p ON p.id=c.patient_id "
                        +"WHERE a.assignee_subject=:subject AND a.assignee_role='DOCTOR' AND a.status IN ('PENDING','ACTIVE') AND c.status<>'DRAFT' "
                        +"AND EXISTS(SELECT 1 FROM practitioner_profiles pp JOIN clinician_onboardings o ON o.practitioner_id=pp.id AND o.status NOT IN ('OFFBOARDED','SUSPENDED') "
                        +"JOIN provider_organizations po ON po.id=o.organization_id AND po.status<>'OFFBOARDED' "
                        +"JOIN access_memberships m ON m.organization_id=o.organization_id AND m.subject=pp.external_subject AND m.status='ACTIVE' AND m.effective_from<=:now AND (m.effective_to IS NULL OR m.effective_to>:now) "
                        +"JOIN access_subjects s ON s.subject=m.subject AND s.active=TRUE WHERE pp.external_subject=a.assignee_subject) "
                        +"ORDER BY a.assigned_at DESC,c.case_number LIMIT :limit OFFSET :offset")
                .param("subject",actor.subject()).param("now",timestamp(now)).param("limit",PAGE_SIZE+1).param("offset",page*PAGE_SIZE)
                .query((r,n)->new Row(r.getObject("id",UUID.class),r.getString("case_number"),r.getString("patient_name"),r.getString("case_status"),r.getString("assignment_status"),r.getTimestamp("assigned_at").toInstant()))
                .list();
        boolean more=rows.size()>PAGE_SIZE;
        var shown=more?rows.subList(0,PAGE_SIZE):rows;
        Map<UUID,Proposal> proposals=latestProposals(shown.stream().map(Row::caseId).toList());
        var items=shown.stream().map(r->{var p=proposals.get(r.caseId());
            return new CaseSummary(r.caseNumber(),r.patientName(),r.caseStatus(),r.assignmentStatus(),r.assignedAt(),p==null?"NONE":stage(p.status()),p==null?null:p.documentType());}).toList();
        return new CasePage(items,page,more);
    }

    /** The latest (highest-numbered, not superseded) proposal version per case — status and document type only. */
    private Map<UUID,Proposal> latestProposals(List<UUID> cases){
        if(cases.isEmpty())return Map.of();
        Map<UUID,Proposal> latest=new HashMap<>();
        jdbc.sql("SELECT pr.case_id,pv.version_number,pv.status,pv.document_type FROM proposals pr JOIN proposal_versions pv ON pv.proposal_id=pr.id WHERE pr.case_id IN (:cases) AND pv.status<>'SUPERSEDED'")
                .param("cases",cases).query((r,n)->new Proposal(r.getObject(1,UUID.class),r.getInt(2),r.getString(3),r.getString(4))).list()
                .forEach(p->latest.merge(p.caseId(),p,(a,b)->a.version()>=b.version()?a:b));
        return latest;
    }

    /** S-PROP stage: the internal approval steps collapse to IN_PREPARATION and a viewed proposal is still RELEASED. */
    static String stage(String status){
        return switch(status){
            case "CLINICAL_DRAFT","CLINICALLY_APPROVED","OPERATIONS_COMPLETED","FINANCE_APPROVED"->"IN_PREPARATION";
            case "RELEASED","VIEWED"->"RELEASED";
            case "ACCEPTED","DECLINED","REVISION_REQUESTED","EXPIRED"->status;
            default->"IN_PREPARATION";
        };
    }

    private record Row(UUID caseId,String caseNumber,String patientName,String caseStatus,String assignmentStatus,Instant assignedAt){}
    private record Proposal(UUID caseId,int version,String status,String documentType){}
    /** One assigned case, S-ID + S-STATUS + S-PROP only. {@code proposalDocumentType} is null when {@code proposalStage} is NONE. */
    public record CaseSummary(String caseNumber,String patientDisplayName,String caseStatus,String assignmentStatus,Instant assignedAt,String proposalStage,String proposalDocumentType){}
    /** A page of the caller's own assigned cases; {@code hasMore} instead of a total. */
    public record CasePage(List<CaseSummary> items,int page,boolean hasMore){}
}
