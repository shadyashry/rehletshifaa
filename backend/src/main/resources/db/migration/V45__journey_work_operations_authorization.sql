-- Extends journey.work.execute (V42) to the OPERATIONS actor type for UPDATE_TRAVEL_PLAN, mirroring
-- the existing COORDINATOR/CONSULTANT/FINANCE role templates exactly (same capability, same two scope
-- tiers). See technical-decisions.md for why a role_template_version's actor_type is a single value, so a
-- distinct version is needed per actor type rather than widening the existing ones.
INSERT INTO role_templates VALUES ('45000000-0000-0000-0000-000000000001','JOURNEY_WORK_OPERATIONS_PLATFORM','Journey Work (Operations, platform)','Journey Work (Operations, platform) default business template.','Complete Journey-projected travel-plan work for a case without a resolved provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('45000001-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',1,'PUBLISHED',0,'OPERATIONS','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('45000001-0000-0000-0000-000000000001','journey.work.execute','PLATFORM',NULL);

INSERT INTO role_templates VALUES ('45000000-0000-0000-0000-000000000002','JOURNEY_WORK_OPERATIONS_ORGANIZATION','Journey Work (Operations, organization)','Journey Work (Operations, organization) default business template.','Complete Journey-projected travel-plan work for a case resolved to this provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('45000001-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000002',1,'PUBLISHED',0,'OPERATIONS','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('45000001-0000-0000-0000-000000000002','journey.work.execute','ORGANIZATION',NULL);

INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
 VALUES ('journey.work.execute','45000001-0000-0000-0000-000000000001','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00'),
        ('journey.work.execute','45000001-0000-0000-0000-000000000002','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
