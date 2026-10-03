-- OPS-04: a deployment-generated restore id blocks workforce sessions until a passing POST_RESTORE comparison.

CREATE TABLE identity_restore_gate (
    id INTEGER PRIMARY KEY,
    restore_id VARCHAR(255),
    status VARCHAR(20) NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE,
    cleared_at TIMESTAMP WITH TIME ZONE,
    cleared_by_run_id UUID REFERENCES identity_reconciliation_runs(id),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_identity_restore_gate_singleton CHECK (id=1),
    CONSTRAINT ck_identity_restore_gate_status CHECK (status IN ('READY','BLOCKED','CLEARED')),
    CONSTRAINT ck_identity_restore_gate_state CHECK (
        (status='READY' AND restore_id IS NULL AND activated_at IS NULL AND cleared_at IS NULL AND cleared_by_run_id IS NULL)
        OR (status='BLOCKED' AND restore_id IS NOT NULL AND activated_at IS NOT NULL AND cleared_at IS NULL AND cleared_by_run_id IS NULL)
        OR (status='CLEARED' AND restore_id IS NOT NULL AND activated_at IS NOT NULL AND cleared_at IS NOT NULL AND cleared_by_run_id IS NOT NULL)
    )
);

INSERT INTO identity_restore_gate(id,status,revision) VALUES(1,'READY',0);
