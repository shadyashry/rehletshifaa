-- S2 of patient WhatsApp communication (docs/patient-communication-whatsapp-design.md §4.4): a time-bounded cover hands
-- one coordinator's patient conversations to another while they are away. While a cover is active only the cover may
-- reply to those patients; the owner reads. Several overlapping covers resolve to the earliest created, so there is
-- always exactly one voice.
CREATE TABLE reply_covers (
    id UUID PRIMARY KEY,
    owner_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    cover_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reason VARCHAR(500),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by VARCHAR(255),
    CONSTRAINT ck_reply_cover_people CHECK (cover_subject <> owner_subject),
    CONSTRAINT ck_reply_cover_period CHECK (ends_at > starts_at)
);
CREATE INDEX ix_reply_covers_owner ON reply_covers(owner_subject, ends_at);
CREATE INDEX ix_reply_covers_cover ON reply_covers(cover_subject, ends_at);
