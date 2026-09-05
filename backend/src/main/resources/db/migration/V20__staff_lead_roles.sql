-- Lead tiers for operations and finance, mirroring the existing coordinator lead. The Keycloak
-- OPERATIONS_LEAD / FINANCE_LEAD realm roles are composite and include their base role, so a lead
-- satisfies every base-role authorization; here we only widen the directory's staff_role check.
-- Named constraint is dropped and re-added (H2-safe, same pattern as V14).
ALTER TABLE staff_members DROP CONSTRAINT ck_staff_role;
ALTER TABLE staff_members ADD CONSTRAINT ck_staff_role CHECK (staff_role IN ('COORDINATOR','COORDINATOR_LEAD','OPERATIONS','OPERATIONS_LEAD','FINANCE','FINANCE_LEAD'));
