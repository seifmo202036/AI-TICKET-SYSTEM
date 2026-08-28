ALTER TABLE ticket_attachments
    ALTER COLUMN file_size_bytes TYPE BIGINT;

ALTER TABLE ticket_attachments
    ALTER COLUMN file_size_bytes SET NOT NULL;
