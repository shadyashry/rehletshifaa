-- S4 of patient WhatsApp communication: when the person sends their case, their intake conversation is linked to it and
-- its staged files become case documents; this records which document each file became.
ALTER TABLE conversation_media ADD COLUMN document_id UUID REFERENCES medical_documents(id);
