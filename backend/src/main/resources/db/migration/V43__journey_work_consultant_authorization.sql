-- Extends journey.work.execute (V42) to the CONSULTANT actor type for RECORD_CLINICAL_DECISION, mirroring
-- the existing COORDINATOR role templates exactly (same capability, same two scope tiers). See
-- technical-decisions.md for why a role_template_version's actor_type is a single value, so a distinct
-- version is needed per actor type rather than widening the existing COORDINATOR ones.
INSERT INTO role_templates VALUES ('43000000-0000-0000-0000-000000000001','JOURNEY_WORK_CONSULTANT_PLATFORM','Journey Work (Consultant, platform)','Journey Work (Consultant, platform) default business template.','Complete Journey-projected clinical work for a case without a resolved provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('43000001-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001',1,'PUBLISHED',0,'CONSULTANT','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('43000001-0000-0000-0000-000000000001','journey.work.execute','PLATFORM',NULL);

INSERT INTO role_templates VALUES ('43000000-0000-0000-0000-000000000002','JOURNEY_WORK_CONSULTANT_ORGANIZATION','Journey Work (Consultant, organization)','Journey Work (Consultant, organization) default business template.','Complete Journey-projected clinical work for a case resolved to this provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('43000001-0000-0000-0000-000000000002','43000000-0000-0000-0000-000000000002',1,'PUBLISHED',0,'CONSULTANT','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('43000001-0000-0000-0000-000000000002','journey.work.execute','ORGANIZATION',NULL);

INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
 VALUES ('journey.work.execute','43000001-0000-0000-0000-000000000001','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00'),
        ('journey.work.execute','43000001-0000-0000-0000-000000000002','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
