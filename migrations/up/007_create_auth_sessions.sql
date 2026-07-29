CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    token_hash CHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    replaced_by_session_id UUID
        REFERENCES auth_sessions(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX auth_sessions_user_id_idx
    ON auth_sessions(user_id);

CREATE INDEX auth_sessions_active_lookup_idx
    ON auth_sessions(token_hash)
    WHERE revoked_at IS NULL;