

CREATE TABLE ticket_status_history (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    changed_by BIGINT,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ticket_status_history_ticket_fk
        FOREIGN KEY (ticket_id)
        REFERENCES tickets(id)
        ON DELETE CASCADE,

    CONSTRAINT ticket_status_history_changed_by_fk
        FOREIGN KEY (changed_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT ticket_status_history_old_status_check
        CHECK (
            old_status IS NULL
            OR old_status IN ('triaging', 'open', 'assigned', 'resolved', 'closed')
        ),

    CONSTRAINT ticket_status_history_new_status_check
        CHECK (new_status IN ('triaging', 'open', 'assigned', 'resolved', 'closed'))
);

