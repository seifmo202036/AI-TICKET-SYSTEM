ALTER TABLE ticket_messages
    ALTER COLUMN body DROP NOT NULL;

ALTER TABLE ticket_messages
    DROP CONSTRAINT ticket_messages_body_not_blank;

ALTER TABLE ticket_messages
    ADD CONSTRAINT ticket_messages_body_not_blank
    CHECK (
        body IS NULL
        OR char_length(trim(body)) > 0
    );

DROP INDEX ticket_messages_ticket_created_idx;

CREATE INDEX ticket_messages_ticket_created_idx
    ON ticket_messages (ticket_id, created_at, id);

DROP TABLE ticket_attachments;

CREATE TABLE ticket_attachments (
    id BIGSERIAL PRIMARY KEY,

    message_id BIGINT NOT NULL,

    s3_key TEXT NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    file_size_bytes INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ticket_attachments_message_fk
        FOREIGN KEY (message_id)
        REFERENCES ticket_messages(id)
        ON DELETE CASCADE,

    CONSTRAINT ticket_attachments_s3_key_not_blank
        CHECK (char_length(trim(s3_key)) > 0),

    CONSTRAINT ticket_attachments_mime_type_check
        CHECK (
            mime_type IN (
                'image/jpeg',
                'image/png',
                'image/webp'
            )
        ),

    CONSTRAINT ticket_attachments_file_size_check
        CHECK (
            file_size_bytes IS NULL
            OR file_size_bytes > 0
        )
);

CREATE INDEX ticket_attachments_message_id_idx
    ON ticket_attachments (message_id);
