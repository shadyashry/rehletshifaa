-- P1-6 (review 2026-10-14, A-03): a Consultant offer has a deadline. A PENDING primary consultant assignment carries
-- the working-hours deadline computed by SlaPolicy when it is made (48 working hours; 24 on an URGENT case);
-- ConsultantOfferExpiryService declines it on the coordinator's behalf once the deadline has passed.
ALTER TABLE case_assignments ADD COLUMN offer_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_assignments_offer_expiry ON case_assignments(status, offer_expires_at);
