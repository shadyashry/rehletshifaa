-- P1-8 session 2 (review 2026-10-14, E-04): scheduler leadership without ShedLock. Every sweep, expiry scan and daily cron
-- takes its row here before it runs, so with two backend instances one of them runs each tick. The row is taken with one
-- guarded update on the database clock (free when locked_until has passed) and released with locked_until moved to now plus
-- the job's minimum hold. A row is inserted the first time a job runs, already taken, so holder and the lock window are
-- always present. The last_* columns are the job's health record; last_succeeded_at feeds the scheduler.job.last.success gauge.
CREATE TABLE scheduler_leases (
    name VARCHAR(120) NOT NULL,
    holder VARCHAR(160) NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_until TIMESTAMP WITH TIME ZONE NOT NULL,
    last_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_succeeded_at TIMESTAMP WITH TIME ZONE,
    last_failed_at TIMESTAMP WITH TIME ZONE,
    last_error_code VARCHAR(120),
    CONSTRAINT pk_scheduler_leases PRIMARY KEY (name),
    CONSTRAINT ck_scheduler_leases_name CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT ck_scheduler_leases_window CHECK (locked_until >= locked_at),
    CONSTRAINT ck_scheduler_leases_error CHECK (last_error_code IS NULL OR last_failed_at IS NOT NULL)
);
