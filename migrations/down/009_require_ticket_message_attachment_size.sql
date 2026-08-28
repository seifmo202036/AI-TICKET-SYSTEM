ALTER TABLE ticket_attachments
    ALTER COLUMN file_size_bytes DROP NOT NULL;

ALTER TABLE ticket_attachments
    ALTER COLUMN file_size_bytes TYPE INTEGER;
