package com.rehletshifaa.provider.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * The Clinicians directory's one read: every clinician enrolled in a provider organization the caller may view, with the
 * stored setup facts and a status-level credential summary. It replaces a per-organization and per-clinician fan-out
 * (organization detail, onboarding, credentials) with three bounded queries.
 *
 * Read-only, no new business rule: organizations come from {@link ProviderOrganizationService#list()} (the same
 * membership + {@code provider.view} filter as the organization list); the credential summary uses the same policy
 * selection and "effective verified" rule as {@code ProviderCredentialService.computeReadiness}. No evidence, submitted
 * facts, reviewer identity or free text is returned. Readiness is not computed here — the clinician page reads it.
 */
@Service
public class ProviderClinicianDirectoryService {
    private final JdbcClient jdbc;
    private final ProviderOrganizationService organizations;
    private final Clock clock;

    public ProviderClinicianDirectoryService(JdbcClient jdbc,ProviderOrganizationService organizations,Clock clock){this.jdbc=jdbc;this.organizations=organizations;this.clock=clock;}

    public List<ClinicianRow> list(UUID organizationId){
        var visible=organizations.list().stream().filter(o->organizationId==null||o.id().equals(organizationId))
                .collect(Collectors.toMap(ProviderOrganizationService.OrganizationView::id,o->o,(a,b)->a,LinkedHashMap::new));
        if(visible.isEmpty())return List.of();
        Instant now=clock.instant();
        var enrolled=jdbc.sql("SELECT o.organization_id,o.practitioner_id,o.clinician_type,o.status,o.jurisdiction,o.credential_policy_cutover_at,m.status member_status,p.display_name "
                        +"FROM clinician_onboardings o JOIN provider_membership_details d ON d.organization_id=o.organization_id AND d.practitioner_id=o.practitioner_id "
                        +"JOIN access_memberships m ON m.organization_id=d.organization_id AND m.subject=d.subject JOIN practitioner_profiles p ON p.id=o.practitioner_id "
                        +"WHERE o.organization_id IN (:organizations) ORDER BY p.display_name")
                .param("organizations",visible.keySet()).query(this::enrollment).list();
        if(enrolled.isEmpty())return List.of();
        Map<String,List<CredentialRevision>> revisions=jdbc.sql("SELECT d.organization_id,d.practitioner_id,d.credential_type,d.status dossier_status,r.revision_number,r.status,r.expires_at "
                        +"FROM provider_credential_dossiers d JOIN provider_credential_revisions r ON r.dossier_id=d.id WHERE d.organization_id IN (:organizations)")
                .param("organizations",visible.keySet()).query(this::revision).list().stream().collect(Collectors.groupingBy(CredentialRevision::key));
        Map<String,Set<String>> policies=policies(now);
        return enrolled.stream().map(e->{var org=visible.get(e.organizationId());var required=e.jurisdiction()==null?null:policies.get(e.clinicianType()+"|"+e.jurisdiction());
            return new ClinicianRow(e.organizationId(),org.displayName(),org.status(),org.legacyMappingStatus()!=null,e.practitionerId(),e.displayName(),e.clinicianType(),e.status(),e.membershipStatus(),e.providerCredentialing(),
                    required==null?null:required.size(),required==null?Map.of():credentialStatuses(e,required,revisions,now));}).toList();
    }

    /** Per required credential type: the same outcome readiness uses — MISSING, VERIFIED (an effective verified revision), EXPIRED, or the latest revision's status. */
    private Map<String,Integer> credentialStatuses(Enrollment e,Set<String> required,Map<String,List<CredentialRevision>> revisions,Instant now){
        Map<String,Integer> counts=new TreeMap<>();
        for(String type:required){
            var rows=revisions.getOrDefault(e.organizationId()+"|"+e.practitionerId()+"|"+type,List.of());
            String status;
            if(rows.isEmpty())status="MISSING";
            else if(rows.stream().anyMatch(r->r.dossierStatus().equals("SUSPENDED")))status="SUSPENDED"; // an explicit suspension invalidates the lineage until restored
            else if(rows.stream().anyMatch(r->CredentialValidity.effectiveVerified(r.status(),r.dossierStatus(),r.expiresAt(),now)))status="VERIFIED";
            else if(rows.stream().anyMatch(r->CredentialValidity.verifiedButExpired(r.status(),r.expiresAt(),now)))status="EXPIRED";
            else status=rows.stream().max(Comparator.comparingInt(CredentialRevision::revisionNumber)).orElseThrow().status();
            counts.merge(status,1,Integer::sum);
        }
        return counts;
    }

    /** The current published credential policy per clinician type and jurisdiction (highest effective version), as in ProviderCredentialService.policy. */
    private Map<String,Set<String>> policies(Instant now){
        record Row(String type,String jurisdiction,int version,String credentialType){}
        var rows=jdbc.sql("SELECT v.clinician_type,v.jurisdiction,v.version_number,q.credential_type FROM credential_policy_versions v LEFT JOIN credential_policy_requirements q ON q.policy_version_id=v.id "
                        +"WHERE v.status='PUBLISHED' AND v.effective_from<=:now AND (v.retired_at IS NULL OR v.retired_at>:now)")
                .param("now",timestamp(now)).query((r,n)->new Row(r.getString(1),r.getString(2),r.getInt(3),r.getString(4))).list();
        Map<String,Integer> latest=new HashMap<>();
        rows.forEach(r->latest.merge(r.type()+"|"+r.jurisdiction(),r.version(),Math::max));
        Map<String,Set<String>> out=new HashMap<>();
        rows.stream().filter(r->latest.get(r.type()+"|"+r.jurisdiction())==r.version()).forEach(r->{var types=out.computeIfAbsent(r.type()+"|"+r.jurisdiction(),k->new TreeSet<>());if(r.credentialType()!=null)types.add(r.credentialType());});
        return out;
    }

    private Enrollment enrollment(ResultSet r,int n)throws SQLException{return new Enrollment(r.getObject("organization_id",UUID.class),r.getObject("practitioner_id",UUID.class),r.getString("clinician_type"),r.getString("status"),r.getString("jurisdiction"),r.getTimestamp("credential_policy_cutover_at")!=null,r.getString("member_status"),r.getString("display_name"));}
    private CredentialRevision revision(ResultSet r,int n)throws SQLException{var expires=r.getTimestamp("expires_at");return new CredentialRevision(r.getObject("organization_id",UUID.class)+"|"+r.getObject("practitioner_id",UUID.class)+"|"+r.getString("credential_type"),r.getString("dossier_status"),r.getInt("revision_number"),r.getString("status"),expires==null?null:expires.toInstant());}

    private record Enrollment(UUID organizationId,UUID practitionerId,String clinicianType,String status,String jurisdiction,boolean providerCredentialing,String membershipStatus,String displayName){}
    private record CredentialRevision(String key,String dossierStatus,int revisionNumber,String status,Instant expiresAt){}
    /**
     * One enrolled clinician. {@code providerCredentialing} is the existing engagement switch ({@code credential_policy_cutover_at},
     * see ProviderCredentialEligibility.adopted): when false the enrollment is an unadopted legacy mapping and the Direct
     * case approval still applies. {@code credentialsRequired} is null when no credential policy applies yet.
     */
    public record ClinicianRow(UUID organizationId,String organizationName,String organizationStatus,boolean organizationLegacyMapping,UUID practitionerId,String displayName,String clinicianType,
                               String onboardingStatus,String membershipStatus,boolean providerCredentialing,Integer credentialsRequired,Map<String,Integer> credentialStatuses){}
}
