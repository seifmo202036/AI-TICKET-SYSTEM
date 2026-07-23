

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    user_name VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    role VARCHAR(20) NOT NULL,
    account_status VARCHAR(20) NOT NULL DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check
        CHECK (role IN ('customer', 'agent', 'admin')),

    CONSTRAINT users_account_status_check
        CHECK (account_status IN ('pending', 'active', 'suspended')),

    CONSTRAINT users_user_name_not_blank
        CHECK (char_length(trim(user_name)) >= 3),

    CONSTRAINT users_email_not_blank
        CHECK (char_length(trim(email)) > 0)
);


