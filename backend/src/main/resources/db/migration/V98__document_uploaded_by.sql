-- Who added a case document: the signed-in account (its subject) for an upload from My Care, or the channel for an
-- upload with no account behind it (INTAKE, SECURE_LINK, WHATSAPP). NULL only on rows from before this column.
-- Read by the stale-upload sweep to say who uploaded a file it cleared later.
ALTER TABLE medical_documents ADD COLUMN uploaded_by VARCHAR(255);
