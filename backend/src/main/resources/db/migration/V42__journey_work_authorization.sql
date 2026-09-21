-- Real Journey-state + Access Governance intersection for completing Journey-projected business work
-- (Phase 4B item C). Distinct from the journey.* administration capabilities (view/create/.../publish)
-- which govern the JourneyVersion graph itself, not case-level business execution.
--
-- Two role templates give the same capability at two scopes, matching Phase 3's own
-- organization-scoped `assignment.receive` precedent (no per-case relationship gate in this slice):
--   JOURNEY_WORK_PLATFORM: for a case with no resolved provider organization yet (the common case
--     before a consultant is assigned) — the same verification-harness boundary already used elsewhere.
--   JOURNEY_WORK_ORGANIZATION: for a case whose provider organization is resolved (via the same
--     case_assignments/practitioner/clinician_onboarding provenance the Assignment Engine already uses)
--     — grants only apply within that organization, giving real tenant isolation.
INSERT INTO permission_definitions
SELECT 'journey.work.execute','Execute Journey work','Complete Journey-projected business work within approved scope.','journey_work','HIGH',
 'PLATFORM,ORGANIZATION','COORDINATOR','ADMIN_WEB,API','BUSINESS','','',TRUE,TRUE,FALSE,FALSE;

INSERT INTO role_templates VALUES ('42000000-0000-0000-0000-000000000001','JOURNEY_WORK_PLATFORM','Journey Work (platform)','Journey Work (platform) default business template.','Complete Journey-projected work for a case without a resolved provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('42000001-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001',1,'PUBLISHED',0,'COORDINATOR','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('42000001-0000-0000-0000-000000000001','journey.work.execute','PLATFORM',NULL);

INSERT INTO role_templates VALUES ('42000000-0000-0000-0000-000000000002','JOURNEY_WORK_ORGANIZATION','Journey Work (organization)','Journey Work (organization) default business template.','Complete Journey-projected work for a case resolved to this provider organization.','JOURNEY',TRUE,'00000000-0000-0000-0000-000000000001','ACTIVE',0,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_template_versions VALUES ('42000001-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000002',1,'PUBLISHED',0,'COORDINATOR','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('42000001-0000-0000-0000-000000000002','journey.work.execute','ORGANIZATION',NULL);

INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
 VALUES ('journey.work.execute','42000001-0000-0000-0000-000000000001','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00'),
        ('journey.work.execute','42000001-0000-0000-0000-000000000002','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-21 00:00:00+00');
