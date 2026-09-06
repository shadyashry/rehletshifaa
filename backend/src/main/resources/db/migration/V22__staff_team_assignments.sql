-- A staff member belongs to at most one lead's team. Multiple leads can exist for
-- each function, with each lead owning a distinct set of direct reports.
CREATE TABLE staff_team_assignments (
    staff_subject VARCHAR(255) PRIMARY KEY,
    lead_subject VARCHAR(255) NOT NULL,
    staff_function VARCHAR(20) NOT NULL,
    assigned_by VARCHAR(255) NOT NULL,
    assignment_reason VARCHAR(500) NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_staff_team_member FOREIGN KEY (staff_subject) REFERENCES staff_members(external_subject),
    CONSTRAINT fk_staff_team_lead FOREIGN KEY (lead_subject) REFERENCES staff_members(external_subject),
    CONSTRAINT ck_staff_team_not_self CHECK (staff_subject <> lead_subject),
    CONSTRAINT ck_staff_team_function CHECK (staff_function IN ('COORDINATOR','OPERATIONS','FINANCE'))
);

CREATE INDEX ix_staff_team_lead ON staff_team_assignments(lead_subject, staff_function);

-- Preserve coordinator relationships created before teams were generalized.
INSERT INTO staff_team_assignments(staff_subject,lead_subject,staff_function,assigned_by,assignment_reason,assigned_at,updated_at)
SELECT external_subject,manager_subject,'COORDINATOR','migration:v22','Migrated existing coordinator reporting relationship',updated_at,updated_at
FROM staff_members
WHERE manager_subject IS NOT NULL
  AND external_subject IS NOT NULL
  AND staff_role IN ('COORDINATOR','COORDINATOR_LEAD');
