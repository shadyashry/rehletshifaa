-- Retires the provider-organization model (V32-V35) and the configurable permission-template engine (V31).
-- Authority now comes only from code policy over database facts (authority module); Consultants are direct platform
-- Consultants credentialed on their own record; care coordination is platform-wide (V61). Pre-production: nothing to
-- carry over. access_subjects stays: it is the identity anchor for workforce people and platform roles.

-- Journey governance serializes canonical-definition creation on its own lock (it borrowed access_bootstrap).
CREATE TABLE journey_governance_lock (id INTEGER PRIMARY KEY, CONSTRAINT ck_journey_governance_lock CHECK (id = 1));
INSERT INTO journey_governance_lock(id) VALUES (1);

-- Provider pricing and availability (V35).
DROP TABLE provider_price_versions;
DROP TABLE clinician_availability_exceptions;
DROP TABLE clinician_availability_slots;

-- Provider credentialing (V34).
DROP TABLE provider_credential_decisions;
DROP TABLE provider_credential_revision_evidence;
DROP TABLE provider_credential_revisions;
DROP TABLE provider_credential_evidence;
DROP TABLE provider_credential_dossiers;
DROP TABLE credential_policy_requirements;
DROP TABLE credential_policy_versions;
DROP TABLE provider_command_results;
DROP TABLE provider_domain_events;
DROP TABLE clinician_onboardings;
DROP TABLE permission_version_cutovers;

-- Provider organizations (V32, rebuilt in V59).
DROP TABLE provider_membership_details;
DROP TABLE provider_identity_operations;
DROP TABLE provider_organizations;

-- Permission-template engine (V31).
DROP TABLE resource_relationships;
DROP TABLE role_assignments;
DROP TABLE role_permission_grants;
DROP TABLE role_template_versions;
DROP TABLE role_templates;
DROP TABLE permission_definitions;
DROP TABLE access_memberships;
DROP TABLE access_bootstrap;
