package com.rehletshifaa.shared.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.util.UUID;

@Component
@Profile("local")
public class LocalDemoDataSeeder implements ApplicationRunner {
    public static final String DOCTOR_SUBJECT="00000000-0000-0000-0000-000000000103";
    private final JdbcClient jdbc; private final Clock clock;
    public LocalDemoDataSeeder(JdbcClient jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    @Override public void run(ApplicationArguments args){Integer found=jdbc.sql("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?").param(DOCTOR_SUBJECT).query(Integer.class).single();if(found!=null&&found>0)return;var now=clock.instant();jdbc.sql("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,registration_number,specialty,subspecialty,qualifications,languages,approved_procedures,contract_status,availability_status,expected_review_hours,credentialing_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)").params(UUID.randomUUID(),DOCTOR_SUBJECT,"Dr Local Consultant","Dr Local Consultant","LOCAL-001","Cardiology","Interventional cardiology","Local development profile","Arabic, English","Clinical review","ACTIVE","AVAILABLE",24,"VERIFIED",now,now).update();}
}
