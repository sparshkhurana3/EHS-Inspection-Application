BEGIN;

CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,

    /*
     * The application stores one display name and a separate login
     * username. Earlier revisions of this file declared first_name and
     * last_name, which contradicted the users_username_lower_unique
     * index below and made this migration fail on an empty database.
     * These two columns match the deployed schema.
     */
    full_name VARCHAR(150) NOT NULL,
    username VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    authentication_source VARCHAR(30)
        NOT NULL DEFAULT 'LOCAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_authentication_source_check
        CHECK (
            authentication_source IN (
                'LOCAL',
                'ENTRA'
            )
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS
    users_username_lower_unique
ON users (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS
    users_email_lower_unique
ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    role_id BIGINT NOT NULL
        REFERENCES roles(id)
        ON DELETE RESTRICT,

    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS authentication_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL,

    username_attempted VARCHAR(255),
    event_type VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT authentication_event_type_check
        CHECK (
            event_type IN (
                'SIGNUP',
                'LOGIN',
                'LOGOUT',
                'LOGIN_FAILURE'
            )
        )
);

INSERT INTO roles (
    code,
    name
)
VALUES
    (
        'USER',
        'Application User'
    ),
    (
        'EHS_OFFICER',
        'EHS Officer'
    ),
    (
        'HOD',
        'Head of Department'
    ),
    (
        'PLANT_HEAD',
        'Plant Head'
    ),
    (
        'ADMIN',
        'System Administrator'
    )
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name;

COMMIT;