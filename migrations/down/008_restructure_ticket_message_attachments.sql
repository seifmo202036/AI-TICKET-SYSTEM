DROP INDEX ticket_attachments_message_id_idx;

DROP TABLE ticket_attachments;

CREATE TABLE ticket_attachments (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    file_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ticket_attachments_ticket_fk
        FOREIGN KEY (ticket_id)
        REFERENCES tickets(id)
        ON DELETE CASCADE,

    CONSTRAINT ticket_attachments_file_url_not_blank
        CHECK (char_length(trim(file_url)) > 0)
);

CREATE INDEX ticket_attachments_ticket_idx
    ON ticket_attachments (ticket_id);

DROP INDEX ticket_messages_ticket_created_idx;

CREATE INDEX ticket_messages_ticket_created_idx
    ON ticket_messages (ticket_id, created_at);

ALTER TABLE ticket_messages
    DROP CONSTRAINT ticket_messages_body_not_blank;

ALTER TABLE ticket_messages
    ADD CONSTRAINT ticket_messages_body_not_blank
    CHECK (char_length(trim(body)) > 0);

ALTER TABLE ticket_messages
    ALTER COLUMN body SET NOT NULL;
