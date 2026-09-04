package com.rehletshifaa.shared.config;

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
    private final JdbcClient jdbc; private final Clock clock; private final com.rehletshifaa.shared.crypto.CryptoService crypto;
    public LocalDemoDataSeeder(JdbcClient jdbc,Clock clock,com.rehletshifaa.shared.crypto.CryptoService crypto){this.jdbc=jdbc;this.clock=clock;this.crypto=crypto;}
    @Override public void run(ApplicationArguments args){Instant now=clock.instant();
        jdbc.sql("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0) ON CONFLICT (external_subject) DO UPDATE SET display_name_encrypted=EXCLUDED.display_name_encrypted,updated_at=EXCLUDED.updated_at").params(UUID.randomUUID(),COORDINATOR_SUBJECT,"COORDINATOR_LEAD",crypto.encrypt("Layla Hassan"),timestamp(now),timestamp(now)).update();
        jdbc.sql("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0) ON CONFLICT (external_subject) DO UPDATE SET staff_role=EXCLUDED.staff_role,display_name_encrypted=EXCLUDED.display_name_encrypted,updated_at=EXCLUDED.updated_at").params(UUID.randomUUID(),SECOND_COORDINATOR_SUBJECT,"COORDINATOR",crypto.encrypt("Omar Nasser"),timestamp(now),timestamp(now)).update();
        // One verified consultant per care category. The cardiology consultant reuses the
        // seeded doctor login (DOCTOR_SUBJECT) so the accept/review flow can be demonstrated.
        seedConsultant(DOCTOR_SUBJECT,"Dr Ahmed Alashry","General and Interventional Cardiology","Interventional cardiology","cardiology",now);
        seedConsultant("00000000-0000-0000-0000-000000000201","Dr Hanan Elshoura","Rheumatology, Rehabilitation and Physical Medicine","Adult & pediatric dysphagia rehabilitation","rheumatology-rehabilitation",now);
        seedConsultant("00000000-0000-0000-0000-000000000202","Dr Hossam Kibba","Orthopedics, Trauma and Joint Replacement","Hip & knee replacement, lower-extremity","orthopedics",now);
    }
    private void seedConsultant(String subject,String name,String specialty,String subspecialty,String category,Instant now){
        jdbc.sql("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,registration_number,specialty,subspecialty,care_category,practitioner_type,qualifications,languages,approved_procedures,contract_status,availability_status,expected_review_hours,credentialing_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) ON CONFLICT (external_subject) DO UPDATE SET display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,specialty=EXCLUDED.specialty,subspecialty=EXCLUDED.subspecialty,care_category=EXCLUDED.care_category,practitioner_type=EXCLUDED.practitioner_type,contract_status='ACTIVE',availability_status='AVAILABLE',expected_review_hours=EXCLUDED.expected_review_hours,credentialing_status='VERIFIED',updated_at=EXCLUDED.updated_at")
            .params(UUID.randomUUID(),subject,name,name,"LOCAL-"+subject.substring(subject.length()-3),specialty,subspecialty,category,"CONSULTANT","Local development profile","Arabic, English","Clinical review","ACTIVE","AVAILABLE",24,"VERIFIED",timestamp(now),timestamp(now)).update();
        jdbc.sql("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,reference_number,source,issued_at,verified_at,verified_by,status,created_at) SELECT ?,p.id,'LOCAL_DEMO_LICENSE',?,'Local development seed',?,?,?,'VERIFIED',? FROM practitioner_profiles p WHERE p.external_subject=? AND NOT EXISTS(SELECT 1 FROM practitioner_credentials pc WHERE pc.practitioner_id=p.id AND pc.status='VERIFIED' AND (pc.expires_at IS NULL OR pc.expires_at>?))")
            .params(UUID.randomUUID(),"LOCAL-DEMO-"+subject.substring(subject.length()-3),timestamp(now),timestamp(now),"local-demo-seeder",timestamp(now),subject,timestamp(now)).update();
    }
}
