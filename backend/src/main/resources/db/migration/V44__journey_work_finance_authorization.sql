-- Extends journey.work.execute (V42) to the FINANCE actor type for APPROVE_COMMERCIAL_TERMS, mirroring
-- the existing COORDINATOR/CONSULTANT (V43) role templates exactly (same capability, same two scope
-- tiers). See technical-decisions.md for why a role_template_version's actor_type is a single value, so a
-- distinct version is needed per actor type rather than widening the existing ones.
INSERT INTO role_templates VALUES ('44000000-0000-0000-0000-000000000001','JOURNEY_WORK_FINANCE_PLATFORM','Journey Work (Finance, platform)','Journey Work (Finance, platform) default business template.','Complete Journey-projected commercial-approval work for a case without a resolved provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('44000001-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001',1,'PUBLISHED',0,'FINANCE','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('44000001-0000-0000-0000-000000000001','journey.work.execute','PLATFORM',NULL);

INSERT INTO role_templates VALUES ('44000000-0000-0000-0000-000000000002','JOURNEY_WORK_FINANCE_ORGANIZATION','Journey Work (Finance, organization)','Journey Work (Finance, organization) default business template.','Complete Journey-projected commercial-approval work for a case resolved to this provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('44000001-0000-0000-0000-000000000002','44000000-0000-0000-0000-000000000002',1,'PUBLISHED',0,'FINANCE','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('44000001-0000-0000-0000-000000000002','journey.work.execute','ORGANIZATION',NULL);

INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
 VALUES ('journey.work.execute','44000001-0000-0000-0000-000000000001','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00'),
        ('journey.work.execute','44000001-0000-0000-0000-000000000002','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
