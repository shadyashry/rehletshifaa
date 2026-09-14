CREATE TABLE journey_definitions (
 id UUID PRIMARY KEY, journey_key VARCHAR(60) NOT NULL UNIQUE CHECK(journey_key='INTERNATIONAL_CARE'),
 display_name VARCHAR(120) NOT NULL, created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE journey_versions (
 id UUID PRIMARY KEY, definition_id UUID NOT NULL REFERENCES journey_definitions(id), version_number INTEGER NOT NULL,
 status VARCHAR(30) NOT NULL CHECK(status IN ('DRAFT','VALIDATED','SIMULATED','PENDING_APPROVAL','PUBLISHED','RETIRED')),
 revision BIGINT NOT NULL DEFAULT 0, created_by VARCHAR(255) NOT NULL, created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 graph_snapshot TEXT NOT NULL, graph_hash VARCHAR(64) NOT NULL, validation_summary TEXT, simulation_summary TEXT,
 published_at TIMESTAMP WITH TIME ZONE, retired_at TIMESTAMP WITH TIME ZONE,
 UNIQUE(definition_id,version_number)
);
CREATE TABLE journey_nodes (
 version_id UUID NOT NULL REFERENCES journey_versions(id), node_key VARCHAR(60) NOT NULL,
 configuration TEXT NOT NULL, PRIMARY KEY(version_id,node_key)
);
-- Draft edges may be dangling so authoritative validation can explain repairable graph errors.
CREATE TABLE journey_edges (
 version_id UUID NOT NULL REFERENCES journey_versions(id), edge_key VARCHAR(60) NOT NULL,
 source_key VARCHAR(60) NOT NULL, target_key VARCHAR(60) NOT NULL, configuration TEXT NOT NULL,
 PRIMARY KEY(version_id,edge_key)
);
CREATE TABLE journey_version_editors (
 version_id UUID NOT NULL REFERENCES journey_versions(id), actor_subject VARCHAR(255) NOT NULL,
 PRIMARY KEY(version_id,actor_subject)
);
UPDATE permission_definitions SET executable=TRUE,allowed_scopes='PLATFORM',actor_types='GOVERNANCE',channels='ADMIN_WEB,API'
 WHERE permission_key LIKE 'journey.%' AND permission_key<>'journey.instance_migrate';
UPDATE permission_definitions SET recent_auth=TRUE WHERE permission_key IN ('journey.approve','journey.publish','journey.retire');
INSERT INTO role_template_versions SELECT '37000001-0000-0000-0000-000000000006',template_id,2,'PUBLISHED',0,'GOVERNANCE','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_template_versions WHERE id='31000001-0000-0000-0000-000000000006';
INSERT INTO role_permission_grants SELECT '37000001-0000-0000-0000-000000000006',permission_key,'PLATFORM',NULL FROM permission_definitions WHERE permission_key IN ('journey.view','journey.create','journey.edit_draft','journey.validate','journey.simulate','journey.submit');
INSERT INTO role_template_versions SELECT '37000001-0000-0000-0000-000000000007',template_id,2,'PUBLISHED',0,'GOVERNANCE','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_template_versions WHERE id='31000001-0000-0000-0000-000000000007';
INSERT INTO role_permission_grants SELECT '37000001-0000-0000-0000-000000000007',permission_key,'PLATFORM',NULL FROM permission_definitions WHERE permission_key IN ('journey.view','journey.approve','journey.publish','journey.retire');
INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
 SELECT permission_key,version_id,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_permission_grants WHERE version_id IN ('37000001-0000-0000-0000-000000000006','37000001-0000-0000-0000-000000000007');
