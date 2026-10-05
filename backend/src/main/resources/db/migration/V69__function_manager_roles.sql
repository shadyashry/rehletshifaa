-- QA-09: narrow function-management roles. These roles grant hierarchy/staffing authority only in code policy.

INSERT INTO workforce_role_catalogue VALUES
    ('OPERATIONS_MANAGER','Operations Manager','OPERATIONS',TRUE,TIMESTAMP WITH TIME ZONE '2026-10-05 00:00:00+00'),
    ('FINANCE_MANAGER','Finance Manager','FINANCE',TRUE,TIMESTAMP WITH TIME ZONE '2026-10-05 00:00:00+00'),
    ('CREDENTIALING_MANAGER','Credentialing Manager','CREDENTIALING',TRUE,TIMESTAMP WITH TIME ZONE '2026-10-05 00:00:00+00'),
    ('SUPPORT_MANAGER','Support Manager','SUPPORT',TRUE,TIMESTAMP WITH TIME ZONE '2026-10-05 00:00:00+00');

INSERT INTO workforce_role_conflicts(role_key,conflicting_role_key,rule_reason) VALUES
    ('COMPLIANCE_AUDITOR','OPERATIONS_MANAGER','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'),
    ('OPERATIONS_MANAGER','COMPLIANCE_AUDITOR','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'),
    ('COMPLIANCE_AUDITOR','FINANCE_MANAGER','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'),
    ('FINANCE_MANAGER','COMPLIANCE_AUDITOR','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'),
    ('COMPLIANCE_AUDITOR','CREDENTIALING_MANAGER','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'),
    ('CREDENTIALING_MANAGER','COMPLIANCE_AUDITOR','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'),
    ('COMPLIANCE_AUDITOR','SUPPORT_MANAGER','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'),
    ('SUPPORT_MANAGER','COMPLIANCE_AUDITOR','Compliance & Audit Reviewer is read-only and cannot hold a mutating role');
