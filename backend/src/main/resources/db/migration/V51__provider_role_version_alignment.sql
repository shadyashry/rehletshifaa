-- UX-5 (M-2): corrected provider clinician role versions for NEW invitations.
--
-- Consultant/Associate v3 carry the credential cutover but no own price/schedule view; v4 added own price/schedule view
-- but V35 approved the cutover only for the price/availability keys, so v4's credential grants evaluate to
-- INVALID_CONFIGURATION. Published versions are immutable, so neither is edited here: a new reviewed version (v5)
-- combines them, with the cutover approved for every gated key it grants, following the V34/V35 seeding pattern.
--
-- Consultant v5 also drops the organization-wide provider.relationship.manage grant (M-1): the approved data-access
-- matrix gives a consultant a read-only relationship summary, never relationship management.
--
-- Existing assignments stay pinned to the version they were granted (no assignment is rewritten); only new provider
-- invitations use v5 (ProviderOrganizationService.ROLE_VERSIONS).

INSERT INTO role_template_versions SELECT '51000001-0000-0000-0000-000000000013',template_id,5,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-23 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-23 00:00:00+00' FROM role_template_versions WHERE id='35000001-0000-0000-0000-000000000013';
INSERT INTO role_permission_grants SELECT '51000001-0000-0000-0000-000000000013',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='35000001-0000-0000-0000-000000000013' AND permission_key<>'provider.relationship.manage';

INSERT INTO role_template_versions SELECT '51000001-0000-0000-0000-000000000014',template_id,5,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-23 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-23 00:00:00+00' FROM role_template_versions WHERE id='35000001-0000-0000-0000-000000000014';
INSERT INTO role_permission_grants SELECT '51000001-0000-0000-0000-000000000014',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='35000001-0000-0000-0000-000000000014';

INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
SELECT permission_key,version_id,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-23 00:00:00+00'
FROM role_permission_grants
WHERE version_id IN ('51000001-0000-0000-0000-000000000013','51000001-0000-0000-0000-000000000014')
AND (permission_key LIKE 'credential.%' OR permission_key LIKE 'price_list.%' OR permission_key LIKE 'availability.%' OR permission_key LIKE 'service_catalog.%');
