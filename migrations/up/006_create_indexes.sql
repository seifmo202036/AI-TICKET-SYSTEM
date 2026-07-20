BEGIN;

CREATE INDEX users_role_status_idx
    ON users (role, account_status);

CREATE INDEX tickets_customer_status_idx
    ON tickets (customer_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX tickets_agent_status_idx
    ON tickets (assigned_agent_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX tickets_ai_recovery_idx
    ON tickets (ai_status, created_at)
    WHERE deleted_at IS NULL;

CREATE INDEX tickets_claim_queue_idx
    ON tickets (ai_score DESC, created_at ASC)
    WHERE status = 'open'
      AND assigned_agent_id IS NULL
      AND deleted_at IS NULL;

CREATE INDEX ticket_attachments_ticket_idx
    ON ticket_attachments (ticket_id);

CREATE INDEX ticket_messages_ticket_created_idx
    ON ticket_messages (ticket_id, created_at);

CREATE INDEX ticket_status_history_ticket_created_idx
    ON ticket_status_history (ticket_id, created_at);

COMMIT;
