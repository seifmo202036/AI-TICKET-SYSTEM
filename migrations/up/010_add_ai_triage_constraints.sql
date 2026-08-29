ALTER TABLE tickets
    DROP CONSTRAINT tickets_ai_status_check;

ALTER TABLE tickets
    ADD CONSTRAINT tickets_ai_status_check
        CHECK (ai_status IN ('queued', 'processing', 'completed', 'failed', 'disabled'));

ALTER TABLE tickets
    DROP CONSTRAINT tickets_ai_category_check;

UPDATE tickets
SET ai_category = CASE ai_category
    WHEN 'technical_issue' THEN 'technical'
    WHEN 'feature_request' THEN 'other'
    WHEN 'general_inquiry' THEN 'general'
    ELSE ai_category
END
WHERE ai_category IN ('technical_issue', 'feature_request', 'general_inquiry');

ALTER TABLE tickets
    ADD CONSTRAINT tickets_ai_category_check
        CHECK (
            ai_category IS NULL
            OR ai_category IN (
                'payment',
                'refund',
                'account',
                'subscription',
                'technical',
                'billing',
                'security',
                'general',
                'other'
            )
        );

DROP INDEX IF EXISTS tickets_claim_queue_idx;

CREATE INDEX tickets_claim_queue_idx
    ON tickets (ai_score DESC NULLS LAST, created_at ASC)
    WHERE status = 'open'
      AND assigned_agent_id IS NULL
      AND deleted_at IS NULL;
