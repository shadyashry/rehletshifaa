package com.rehletshifaa.devdata;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Component
@Profile("local")
public class LocalDemoDataSeeder implements ApplicationRunner {
    public static final String DOCTOR_SUBJECT="00000000-0000-0000-0000-000000000103";
    public static final String COORDINATOR_SUBJECT="00000000-0000-0000-0000-000000000102";
    public static final String SECOND_COORDINATOR_SUBJECT="06d5980a-76fe-4e34-9900-89aef8a9d87a";
    // The realm's seeded operations / finance logins (infrastructure/keycloak/realm-rehletshifaa.json). They
    // are registered as staff members here so the coordinator's directory can assign them and the live
    // journeys can be exercised end to end with the QA identities alone — no ad-hoc data setup.
    public static final String OPERATIONS_SUBJECT="00000000-0000-0000-0000-000000000104";
    public static final String FINANCE_SUBJECT="00000000-0000-0000-0000-000000000105";
    private final JdbcClient jdbc; private final Clock clock; private final com.rehletshifaa.shared.crypto.CryptoService crypto;
    public LocalDemoDataSeeder(JdbcClient jdbc,Clock clock,com.rehletshifaa.shared.crypto.CryptoService crypto){this.jdbc=jdbc;this.clock=clock;this.crypto=crypto;}
    @Override public void run(ApplicationArguments args){Instant now=clock.instant();
        seedWorkforce(now);
        seedCoordinationRouting(now);
        // One verified consultant per care category. The cardiology consultant reuses the
        // seeded doctor login (DOCTOR_SUBJECT) so the accept/review flow can be demonstrated.
        seedConsultant(DOCTOR_SUBJECT,"Dr Ahmed Alashry","General and Interventional Cardiology","Interventional cardiology","cardiology",now);
        seedConsultant("00000000-0000-0000-0000-000000000201","Dr Hanan Elshoura","Rheumatology, Rehabilitation and Physical Medicine","Adult & pediatric dysphagia rehabilitation","rheumatology-rehabilitation",now);
        seedConsultant("00000000-0000-0000-0000-000000000202","Dr Hossam Kibba","Orthopedics, Trauma and Joint Replacement","Hip & knee replacement, lower-extremity","orthopedics",now);
        // Work addresses of the QA identities (the realm's seeded logins), so work emails reach the person
        // the work belongs to — a consultant's assignment must be visible under the consultant's address in
        // Mailpit, never under the coordination team's. Only rows still without an address are touched.
        seedPractitionerEmail(DOCTOR_SUBJECT,"doctor@local.test",now);
    }
    public static final String ADMIN_SUBJECT="00000000-0000-0000-0000-000000000106";
    private static final UUID COORDINATION_TEAM=UUID.fromString("00000000-0000-0000-0000-00000000c001");
    private static final UUID COORDINATION_SCOPE_TEAM=UUID.fromString("00000000-0000-0000-0000-00000000c002");

    /**
     * Section 1 workforce model for the realm QA identities: one workforce person each, their database business
     * roles, the seeded System Administrator (local only: its MFA evidence flag is seeded so the one demo admin is
     * effective without a passkey ceremony), and one coordination team led by the coordinator. Idempotent.
     */
    private void seedWorkforce(Instant now){
        seedPerson(COORDINATOR_SUBJECT,"Layla Hassan","coordinator@local.test",now,"COORDINATOR");
        seedPerson(SECOND_COORDINATOR_SUBJECT,"Omar Nasser","coordinator2@local.test",now,"COORDINATOR");
        seedPerson(OPERATIONS_SUBJECT,"Mariam Soliman","operations@local.test",now,"OPERATIONS");
        seedPerson(FINANCE_SUBJECT,"Youssef Adel","finance@local.test",now,"FINANCE");
        seedPerson(ADMIN_SUBJECT,"Credential Administrator","credential-admin@local.test",now,"CREDENTIAL_VERIFIER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000301","Journey Manager","journey-manager@local.test",now,"JOURNEY_MANAGER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000302","Journey Approver","journey-approver@local.test",now,"JOURNEY_APPROVER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000303","Compliance Auditor","compliance-auditor@local.test",now,"COMPLIANCE_AUDITOR");
        seedInvitedPerson("00000000-0000-0000-0000-000000000304","Support Officer","support-officer@local.test",now,"SUPPORT_AGENT");
        seedInvitedPerson("00000000-0000-0000-0000-000000000305","Patient Identity Reviewer","patient-identity-reviewer@local.test",now,"PATIENT_IDENTITY_REVIEWER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000306","Operations Manager","operations-manager@local.test",now,"OPERATIONS_MANAGER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000307","Finance Manager","finance-manager@local.test",now,"FINANCE_MANAGER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000308","Credentialing Manager","credentialing-manager@local.test",now,"CREDENTIALING_MANAGER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000309","Support Manager","support-manager@local.test",now,"SUPPORT_MANAGER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000310","Care Coordination Manager","care-manager@local.test",now,"CARE_COORDINATION_MANAGER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000311","Consultant Operations Manager","consultant-operations-manager@local.test",now,"CONSULTANT_OPERATIONS_MANAGER");
        seedInvitedPerson("00000000-0000-0000-0000-000000000312","Scope Test Coordinator","coordinator-scope@local.test",now,"COORDINATOR");
        seedInvitedPerson("00000000-0000-0000-0000-000000000313","Scope Test Care Manager","care-manager-scope@local.test",now,"CARE_COORDINATION_MANAGER");
        // IAM-17: the one technical client the backend uses, recorded with an owner and scopes; it holds no business role.
        jdbc.sql("INSERT INTO service_accounts(client_id,owner_subject,purpose,scopes,secret_rotated_at,status,registered_by,registered_at,revision) "
                +"VALUES('staff-identity-admin',?,'Keycloak user administration for workforce and consultant identity operations','realm-management: manage-users view-users query-users view-realm',?,'ACTIVE','local-demo-seeder',?,0) ON CONFLICT (client_id) DO NOTHING")
            .params(ADMIN_SUBJECT,timestamp(now),timestamp(now)).update();
        jdbc.sql("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject=?").param(ADMIN_SUBJECT).update();
        jdbc.sql("INSERT INTO platform_role_assignments(id,subject,role_key,effective_from,status,assigned_by,reason,created_at,revision) "
                +"SELECT ?,?,'SYSTEM_ADMINISTRATOR',?,'ACTIVE','local-demo-seeder','Local demo administrator',?,0 "
                +"WHERE NOT EXISTS(SELECT 1 FROM platform_role_assignments WHERE subject=? AND role_key='SYSTEM_ADMINISTRATOR')")
            .params(UUID.randomUUID(),ADMIN_SUBJECT,timestamp(now),timestamp(now),ADMIN_SUBJECT).update();
        jdbc.sql("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,'CARE_COORDINATION','Coordination team','ACTIVE','local-demo-seeder',?,?,0) ON CONFLICT (id) DO NOTHING")
            .params(COORDINATION_TEAM,timestamp(now),timestamp(now)).update();
        for(String subject:new String[]{COORDINATOR_SUBJECT,SECOND_COORDINATOR_SUBJECT})
            jdbc.sql("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) SELECT ?,?,?,?,'ACTIVE','local-demo-seeder','Local demo team',0 "
                    +"WHERE NOT EXISTS(SELECT 1 FROM workforce_team_memberships WHERE team_id=? AND subject=?)")
                .params(UUID.randomUUID(),COORDINATION_TEAM,subject,timestamp(now),COORDINATION_TEAM,subject).update();
        jdbc.sql("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) SELECT ?,?,?,?,'ACTIVE','local-demo-seeder','Local demo lead',0 "
                +"WHERE NOT EXISTS(SELECT 1 FROM workforce_lead_designations WHERE team_id=? AND subject=?)")
            .params(UUID.randomUUID(),COORDINATION_TEAM,COORDINATOR_SUBJECT,timestamp(now),COORDINATION_TEAM,COORDINATOR_SUBJECT).update();
        seedTeamRelation(COORDINATION_TEAM,"00000000-0000-0000-0000-000000000310",now,true);
        jdbc.sql("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,'CARE_COORDINATION','Coordination scope-denial team','ACTIVE','local-demo-seeder',?,?,0) ON CONFLICT (id) DO NOTHING")
            .params(COORDINATION_SCOPE_TEAM,timestamp(now),timestamp(now)).update();
        seedTeamRelation(COORDINATION_SCOPE_TEAM,"00000000-0000-0000-0000-000000000312",now,false);
        seedTeamRelation(COORDINATION_SCOPE_TEAM,"00000000-0000-0000-0000-000000000313",now,true);
        if(jdbc.sql("SELECT COUNT(*) FROM workforce_current_managers WHERE function_key='CARE_COORDINATION' AND staff_subject=?").param(SECOND_COORDINATOR_SUBJECT).query(Long.class).single()==0){
            UUID line=UUID.randomUUID();
            jdbc.sql("INSERT INTO workforce_reporting_lines(id,function_key,staff_subject,manager_subject,effective_from,status,created_by,reason,revision) VALUES(?,'CARE_COORDINATION',?,?,?,'ACTIVE','local-demo-seeder','Local demo reporting line',0)")
                .params(line,SECOND_COORDINATOR_SUBJECT,COORDINATOR_SUBJECT,timestamp(now)).update();
            jdbc.sql("INSERT INTO workforce_current_managers(function_key,staff_subject,manager_subject,reporting_line_id) VALUES('CARE_COORDINATION',?,?,?)")
                .params(SECOND_COORDINATOR_SUBJECT,COORDINATOR_SUBJECT,line).update();
        }
    }
    /**
     * Routing configuration a claim needs (Control Center → Coordination): the coordination team serves every care area
     * in English and Arabic, both seeded coordinators are on duty with capacity, and one routing policy sends every care
     * area to that team. Without an effective policy a claim is refused (ROUTING_POLICY_MISSING), so a fresh local
     * database could not run the live journeys. Idempotent, and a policy already published in the Control Center wins.
     */
    private void seedCoordinationRouting(Instant now){
        jdbc.sql("INSERT INTO coordination_team_profiles(team_id,care_areas,languages,updated_by,updated_at,revision) SELECT ?,'','en,ar','local-demo-seeder',?,0 "
                +"WHERE NOT EXISTS(SELECT 1 FROM coordination_team_profiles WHERE team_id=?)")
            .params(COORDINATION_TEAM,timestamp(now),COORDINATION_TEAM).update();
        for(String subject:new String[]{COORDINATOR_SUBJECT,SECOND_COORDINATOR_SUBJECT})
            jdbc.sql("INSERT INTO coordinator_capacity(subject,maximum,on_duty,languages,care_areas,updated_by,updated_at,revision) SELECT ?,100,TRUE,'en,ar','','local-demo-seeder',?,0 "
                    +"WHERE NOT EXISTS(SELECT 1 FROM coordinator_capacity WHERE subject=?)")
                .params(subject,timestamp(now),subject).update();
        if(jdbc.sql("SELECT COUNT(*) FROM coordination_policy_versions").query(Long.class).single()==0){
            String configuration="""
                    {"capacityWeight":80,"languageWeight":20,"requireOnDuty":true,"mandatoryLanguage":true,
                     "careAreaTeams":{},"defaultTeam":"%s","fallbackTeam":null,"queueHours":24}""".formatted(COORDINATION_TEAM);
            jdbc.sql("INSERT INTO coordination_policy_versions(id,version_number,effective_from,configuration,created_by,created_at) VALUES(?,1,?,?,'local-demo-seeder',?)")
                .params(UUID.randomUUID(),timestamp(now),configuration,timestamp(now)).update();
        }
    }
    private void seedTeamRelation(UUID team,String subject,Instant now,boolean lead){
        jdbc.sql("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) SELECT ?,?,?,?,'ACTIVE','local-demo-seeder','Local demo team',0 WHERE NOT EXISTS(SELECT 1 FROM workforce_team_memberships WHERE team_id=? AND subject=? AND status='ACTIVE')")
            .params(UUID.randomUUID(),team,subject,timestamp(now),team,subject).update();
        if(lead) jdbc.sql("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) SELECT ?,?,?,?,'ACTIVE','local-demo-seeder','Local demo lead',0 WHERE NOT EXISTS(SELECT 1 FROM workforce_lead_designations WHERE team_id=? AND subject=? AND status='ACTIVE')")
            .params(UUID.randomUUID(),team,subject,timestamp(now),team,subject).update();
    }
    private void seedPerson(String subject,String name,String email,Instant now,String role){
        jdbc.sql("INSERT INTO access_subjects(subject,active,revision) VALUES(?,TRUE,0) ON CONFLICT (subject) DO NOTHING").param(subject).update();
        jdbc.sql("INSERT INTO workforce_people(subject,display_name_encrypted,email_encrypted,email_hash,lifecycle_status,activated_at,created_at,updated_at,revision) "
                +"VALUES(?,?,?,?,'ACTIVE',?,?,?,0) ON CONFLICT (subject) DO NOTHING")
            .params(subject,crypto.encrypt(name),crypto.encrypt(email),emailHash(email),timestamp(now),timestamp(now),timestamp(now)).update();
        jdbc.sql("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                +"SELECT ?,?,?,?,'ACTIVE','GRANT','local-demo-seeder','Local demo role',?,0 "
                +"WHERE NOT EXISTS(SELECT 1 FROM workforce_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE')")
            .params(UUID.randomUUID(),subject,role,timestamp(now),timestamp(now),subject,role).update();
    }
    /** Seeded UAT users have no source-controlled password and no fabricated MFA evidence. */
    private void seedInvitedPerson(String subject,String name,String email,Instant now,String role){
        jdbc.sql("INSERT INTO access_subjects(subject,active,revision) VALUES(?,TRUE,0) ON CONFLICT (subject) DO NOTHING").param(subject).update();
        jdbc.sql("INSERT INTO workforce_people(subject,display_name_encrypted,email_encrypted,email_hash,lifecycle_status,created_at,updated_at,revision) VALUES(?,?,?,?,'INVITED',?,?,0) ON CONFLICT (subject) DO NOTHING")
            .params(subject,crypto.encrypt(name),crypto.encrypt(email),emailHash(email),timestamp(now),timestamp(now)).update();
        UUID invitation=jdbc.sql("SELECT id FROM workforce_invitations WHERE subject=? AND status IN ('SENT','ACCEPTED') ORDER BY created_at DESC LIMIT 1")
            .param(subject).query(UUID.class).optional().orElseGet(()->{
                UUID id=UUID.randomUUID();
                jdbc.sql("INSERT INTO workforce_invitations(id,display_name_encrypted,email_encrypted,email_hash,locale,status,subject,invited_by,reason,created_at,expires_at,revision) VALUES(?,?,?,?,?,'SENT',?,'local-demo-seeder','Development UAT identity',?,?,0)")
                    .params(id,crypto.encrypt(name),crypto.encrypt(email),emailHash(email),"en",subject,timestamp(now),timestamp(now.plusSeconds(315360000))).update();
                return id;
            });
        jdbc.sql("INSERT INTO workforce_invitation_roles(invitation_id,role_key) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM workforce_invitation_roles WHERE invitation_id=? AND role_key=?)")
            .params(invitation,role,invitation,role).update();
        jdbc.sql("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) SELECT ?,?,?,?,'ACTIVE','INVITATION','local-demo-seeder','Development UAT role',?,0 WHERE NOT EXISTS(SELECT 1 FROM workforce_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE')")
            .params(UUID.randomUUID(),subject,role,timestamp(now),timestamp(now),subject,role).update();
    }
    private void seedPractitionerEmail(String subject,String email,Instant now){
        jdbc.sql("UPDATE practitioner_profiles SET email_encrypted=?,email_hash=?,updated_at=? WHERE external_subject=? AND email_hash IS NULL AND NOT EXISTS(SELECT 1 FROM practitioner_profiles p WHERE p.email_hash=?)")
            .params(crypto.encrypt(email),emailHash(email),timestamp(now),subject,emailHash(email)).update();
    }
    /** Same normalisation as the invite paths: SHA-256 of the lower-cased address. */
    private static String emailHash(String email){
        try{return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(email.trim().toLowerCase(java.util.Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
        catch(Exception e){throw new IllegalStateException("Unable to hash seed email",e);}
    }
    private void seedConsultant(String subject,String name,String specialty,String subspecialty,String category,Instant now){
        jdbc.sql("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,registration_number,specialty,subspecialty,care_category,practitioner_type,qualifications,languages,approved_procedures,contract_status,availability_status,expected_review_hours,credentialing_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) ON CONFLICT (external_subject) DO UPDATE SET display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,specialty=EXCLUDED.specialty,subspecialty=EXCLUDED.subspecialty,care_category=EXCLUDED.care_category,practitioner_type=EXCLUDED.practitioner_type,contract_status='ACTIVE',availability_status='AVAILABLE',expected_review_hours=EXCLUDED.expected_review_hours,credentialing_status='VERIFIED',updated_at=EXCLUDED.updated_at")
            .params(UUID.randomUUID(),subject,name,name,"LOCAL-"+subject.substring(subject.length()-3),specialty,subspecialty,category,"CONSULTANT","Local development profile","Arabic, English","Clinical review","ACTIVE","AVAILABLE",24,"VERIFIED",timestamp(now),timestamp(now)).update();
        jdbc.sql("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,reference_number,source,issued_at,verified_at,verified_by,status,created_at) SELECT ?,p.id,'LOCAL_DEMO_LICENSE',?,'Local development seed',?,?,?,'VERIFIED',? FROM practitioner_profiles p WHERE p.external_subject=? AND NOT EXISTS(SELECT 1 FROM practitioner_credentials pc WHERE pc.practitioner_id=p.id AND pc.status='VERIFIED' AND (pc.expires_at IS NULL OR pc.expires_at>?))")
            .params(UUID.randomUUID(),"LOCAL-DEMO-"+subject.substring(subject.length()-3),timestamp(now),timestamp(now),"local-demo-seeder",timestamp(now),subject,timestamp(now)).update();
        // Derive the consultant's price list from their care-area template so the doctor
        // portal shows the approved multi-select out of the box (idempotent by service_code).
        jdbc.sql("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) "
                +"SELECT gen_random_uuid(),p.id,i.service_code,i.service_name,i.category,COALESCE(i.suggested_price_egp,0),TRUE,'local-demo-seeder',?,?,0 "
                +"FROM practitioner_profiles p JOIN service_templates t ON t.care_category=p.care_category AND t.active JOIN service_template_items i ON i.template_id=t.id "
                +"WHERE p.external_subject=? AND NOT EXISTS(SELECT 1 FROM consultant_service_catalog c WHERE c.practitioner_id=p.id AND c.service_code=i.service_code)")
            .params(timestamp(now),timestamp(now),subject).update();
    }
}
