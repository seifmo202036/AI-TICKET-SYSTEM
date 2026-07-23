

CREATE TABLE tickets (
    id BIGSERIAL PRIMARY KEY,

    customer_id BIGINT NOT NULL,
    assigned_agent_id BIGINT,

    customer_issue_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'triaging',

    ai_status VARCHAR(20) NOT NULL DEFAULT 'queued',
    ai_category VARCHAR(50),
    urgency VARCHAR(20),
    ai_score SMALLINT,
    ai_attempts SMALLINT NOT NULL DEFAULT 0,
    ai_error TEXT,
    ai_processed_at TIMESTAMPTZ,

    assigned_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,

    CONSTRAINT tickets_customer_fk
        FOREIGN KEY (customer_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT tickets_assigned_agent_fk
        FOREIGN KEY (assigned_agent_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT tickets_deleted_by_fk
        FOREIGN KEY (deleted_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT tickets_status_check
        CHECK (status IN ('triaging', 'open', 'assigned', 'resolved', 'closed')),

    CONSTRAINT tickets_ai_status_check
        CHECK (ai_status IN ('queued', 'processing', 'completed', 'failed')),

    CONSTRAINT tickets_ai_category_check
        CHECK (
            ai_category IS NULL
            OR ai_category IN (
                'billing',
                'technical_issue',
                'feature_request',
                'general_inquiry'
            )
        ),

    CONSTRAINT tickets_urgency_check
        CHECK (
            urgency IS NULL
            OR urgency IN ('low', 'medium', 'high', 'critical')
        ),

    CONSTRAINT tickets_ai_score_check
        CHECK (ai_score IS NULL OR ai_score BETWEEN 0 AND 100),

    CONSTRAINT tickets_ai_attempts_check
        CHECK (ai_attempts >= 0),

    CONSTRAINT tickets_issue_type_not_blank
        CHECK (char_length(trim(customer_issue_type)) > 0),

    CONSTRAINT tickets_description_not_blank
        CHECK (char_length(trim(description)) > 0)
);


