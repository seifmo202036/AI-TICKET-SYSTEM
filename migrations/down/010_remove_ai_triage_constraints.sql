DROP INDEX IF EXISTS tickets_claim_queue_idx;

CREATE INDEX tickets_claim_queue_idx
    ON tickets (ai_score DESC, created_at ASC)
    WHERE status = 'open'
      AND assigned_agent_id IS NULL
      AND deleted_at IS NULL;

ALTER TABLE tickets
    DROP CONSTRAINT tickets_ai_category_check;

UPDATE tickets
SET ai_category = CASE ai_category
    WHEN 'billing' THEN 'billing'
    WHEN 'technical' THEN 'technical_issue'
    ELSE 'general_inquiry'
END
WHERE ai_category IS NOT NULL;

ALTER TABLE tickets
    ADD CONSTRAINT tickets_ai_category_check
        CHECK (
            ai_category IS NULL
            OR ai_category IN (
                'billing',
                'technical_issue',
                'feature_request',
                'general_inquiry'
            )
        );

ALTER TABLE tickets
    DROP CONSTRAINT tickets_ai_status_check;

UPDATE tickets
SET ai_status = 'failed'
WHERE ai_status = 'disabled';

ALTER TABLE tickets
    ADD CONSTRAINT tickets_ai_status_check
        CHECK (ai_status IN ('queued', 'processing', 'completed', 'failed'));
