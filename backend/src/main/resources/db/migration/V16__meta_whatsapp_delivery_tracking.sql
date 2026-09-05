-- Provider-accepted notifications remain DELIVERED in the outbox lifecycle. These fields track
-- the later Meta delivery receipt separately (sent/delivered/read/failed) without storing webhook
-- bodies, phone numbers, message content, or secrets.
ALTER TABLE notification_outbox ADD COLUMN provider_delivery_status VARCHAR(30);
ALTER TABLE notification_outbox ADD COLUMN provider_status_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notification_outbox ADD COLUMN provider_error_code VARCHAR(100);

CREATE TABLE whatsapp_delivery_events (
    id UUID PRIMARY KEY,
    provider VARCHAR(30) NOT NULL,
    provider_message_id VARCHAR(255) NOT NULL,
    delivery_status VARCHAR(30) NOT NULL,
    provider_event_at TIMESTAMP WITH TIME ZONE NOT NULL,
    error_code VARCHAR(100),
    payload_hash VARCHAR(64) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_whatsapp_delivery_event UNIQUE
        (provider, provider_message_id, delivery_status, provider_event_at)
);
CREATE INDEX idx_whatsapp_delivery_message ON whatsapp_delivery_events(provider_message_id, provider_event_at);
