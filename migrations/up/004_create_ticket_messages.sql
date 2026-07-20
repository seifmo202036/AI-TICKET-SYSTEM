BEGIN;

CREATE TABLE ticket_messages (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ticket_messages_ticket_fk
        FOREIGN KEY (ticket_id)
        REFERENCES tickets(id)
        ON DELETE CASCADE,

    CONSTRAINT ticket_messages_sender_fk
        FOREIGN KEY (sender_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT ticket_messages_body_not_blank
        CHECK (char_length(trim(body)) > 0)
);

COMMIT;
