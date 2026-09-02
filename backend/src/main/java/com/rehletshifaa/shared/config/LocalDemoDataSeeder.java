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
    private final JdbcClient jdbc; private final Clock clock;
    public LocalDemoDataSeeder(JdbcClient jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    @Override public void run(ApplicationArguments args){Instant now=clock.instant();
        // One verified consultant per care category. The cardiology consultant reuses the
        // seeded doctor login (DOCTOR_SUBJECT) so the accept/review flow can be demonstrated.
        seedConsultant(DOCTOR_SUBJECT,"Dr Ahmed Alashry","General and Interventional Cardiology","Interventional cardiology","cardiology",now);
        seedConsultant("00000000-0000-0000-0000-000000000201","Dr Hanan Elshoura","Rheumatology, Rehabilitation and Physical Medicine","Adult & pediatric dysphagia rehabilitation","rheumatology-rehabilitation",now);
        seedConsultant("00000000-0000-0000-0000-000000000202","Dr Hossam Kibba","Orthopedics, Trauma and Joint Replacement","Hip & knee replacement, lower-extremity","orthopedics",now);
    }
    private void seedConsultant(String subject,String name,String specialty,String subspecialty,String category,Instant now){
        jdbc.sql("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,registration_number,specialty,subspecialty,care_category,practitioner_type,qualifications,languages,approved_procedures,contract_status,availability_status,expected_review_hours,credentialing_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) ON CONFLICT (external_subject) DO UPDATE SET display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,specialty=EXCLUDED.specialty,subspecialty=EXCLUDED.subspecialty,care_category=EXCLUDED.care_category,practitioner_type=EXCLUDED.practitioner_type,credentialing_status='VERIFIED',updated_at=EXCLUDED.updated_at")
            .params(UUID.randomUUID(),subject,name,name,"LOCAL-"+subject.substring(subject.length()-3),specialty,subspecialty,category,"CONSULTANT","Local development profile","Arabic, English","Clinical review","ACTIVE","AVAILABLE",24,"VERIFIED",timestamp(now),timestamp(now)).update();
    }
}
