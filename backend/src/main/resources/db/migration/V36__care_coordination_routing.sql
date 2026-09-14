CREATE TABLE coordinator_teams (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 name VARCHAR(150) NOT NULL, configuration TEXT NOT NULL, revision BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_coordination_team_org ON coordinator_teams(organization_id);
CREATE TABLE coordinator_memberships (
 team_id UUID NOT NULL REFERENCES coordinator_teams(id), subject VARCHAR(255) NOT NULL REFERENCES access_subjects(subject),
 effective_from TIMESTAMP WITH TIME ZONE NOT NULL, effective_to TIMESTAMP WITH TIME ZONE,
 active BOOLEAN NOT NULL, team_lead BOOLEAN NOT NULL, revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(team_id,subject), CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE TABLE coordinator_capacity (
 organization_id UUID NOT NULL REFERENCES provider_organizations(id), subject VARCHAR(255) NOT NULL REFERENCES access_subjects(subject),
 maximum INTEGER NOT NULL CHECK(maximum>=0), on_duty BOOLEAN NOT NULL, languages VARCHAR(500) NOT NULL,
 care_areas VARCHAR(1000) NOT NULL, revision BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(organization_id,subject)
);
CREATE TABLE coordination_policy_versions (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES provider_organizations(id), version_number INTEGER NOT NULL,
 effective_from TIMESTAMP WITH TIME ZONE NOT NULL, effective_to TIMESTAMP WITH TIME ZONE,
 configuration TEXT NOT NULL, created_by VARCHAR(255) NOT NULL, created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 UNIQUE(organization_id,version_number), CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE TABLE consultant_routing_preferences (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 consultant_id UUID NOT NULL REFERENCES practitioner_profiles(id), version_number INTEGER NOT NULL,
 effective_from TIMESTAMP WITH TIME ZONE NOT NULL, effective_to TIMESTAMP WITH TIME ZONE,
 coordinator_subject VARCHAR(255) REFERENCES access_subjects(subject), team_id UUID REFERENCES coordinator_teams(id),
 fallback_team_id UUID REFERENCES coordinator_teams(id), created_by VARCHAR(255) NOT NULL,
 UNIQUE(organization_id,consultant_id,version_number), CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE TABLE coordination_case_routing (
 case_id UUID PRIMARY KEY REFERENCES medical_cases(id), organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 consultant_id UUID NOT NULL REFERENCES practitioner_profiles(id), mode VARCHAR(10) NOT NULL CHECK(mode IN ('SHADOW','LIVE')),
 revision BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE coordination_decisions (
 id UUID PRIMARY KEY, case_id UUID NOT NULL REFERENCES medical_cases(id), organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 actor_subject VARCHAR(255) NOT NULL, command_key VARCHAR(150) NOT NULL, request_data TEXT NOT NULL,
 policy_id UUID NOT NULL REFERENCES coordination_policy_versions(id), result_data TEXT NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL, UNIQUE(case_id,actor_subject,command_key)
);
ALTER TABLE case_tasks ADD COLUMN coordination_team_id UUID REFERENCES coordinator_teams(id);
ALTER TABLE case_tasks ADD COLUMN coordination_queue_reason VARCHAR(100);
ALTER TABLE case_tasks ADD COLUMN coordination_queued_at TIMESTAMP WITH TIME ZONE;

-- Registry projection for new registered capabilities; approved versions alone execute.
INSERT INTO permission_definitions
SELECT 'assignment.receive','Receive coordination work','Receive coordination work within approved provider scope.','assignment','LOW',
 'ORGANIZATION,ASSIGNED_ORGANIZATIONS,SPECIFIC_RESOURCE','COORDINATOR','ADMIN_WEB,API','BUSINESS','','',TRUE,TRUE,FALSE,FALSE;
INSERT INTO permission_definitions
SELECT 'assignment.preference.manage','Manage routing preferences','Manage provider Consultant routing preferences.','assignment','HIGH',
 'ORGANIZATION,ASSIGNED_ORGANIZATIONS,SPECIFIC_RESOURCE','COORDINATOR','ADMIN_WEB,API','BUSINESS','','',TRUE,TRUE,FALSE,FALSE;
INSERT INTO permission_definitions
SELECT 'assignment.queue.manage','Manage coordination queue','Resolve and escalate provider coordination queues.','assignment','HIGH',
 'ORGANIZATION,ASSIGNED_ORGANIZATIONS,SPECIFIC_RESOURCE','COORDINATOR','ADMIN_WEB,API','BUSINESS','','',TRUE,TRUE,FALSE,FALSE;
UPDATE permission_definitions SET executable=TRUE,actor_types='COORDINATOR',channels='ADMIN_WEB,API' WHERE permission_key LIKE 'assignment.%';
INSERT INTO role_template_versions SELECT '36000001-0000-0000-0000-000000000008',template_id,2,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_template_versions WHERE id='31000001-0000-0000-0000-000000000008';
INSERT INTO role_permission_grants SELECT '36000001-0000-0000-0000-000000000008',permission_key,'ORGANIZATION',NULL FROM permission_definitions WHERE permission_key LIKE 'assignment.%' AND permission_key<>'assignment.receive';
INSERT INTO role_template_versions SELECT '36000001-0000-0000-0000-000000000016',template_id,2,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_template_versions WHERE id='31000001-0000-0000-0000-000000000016';
INSERT INTO role_permission_grants VALUES ('36000001-0000-0000-0000-000000000016','assignment.receive','ORGANIZATION',NULL);
INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
SELECT permission_key,version_id,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_permission_grants WHERE version_id IN ('36000001-0000-0000-0000-000000000008','36000001-0000-0000-0000-000000000016');
