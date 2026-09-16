BEGIN;

CREATE TABLE IF NOT EXISTS plants (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
    id BIGSERIAL PRIMARY KEY,

    plant_id BIGINT NOT NULL
        REFERENCES plants(id)
        ON DELETE RESTRICT,

    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT units_plant_code_unique
        UNIQUE (plant_id, code)
);

CREATE TABLE IF NOT EXISTS zones (
    id BIGSERIAL PRIMARY KEY,

    unit_id BIGINT NOT NULL
        REFERENCES units(id)
        ON DELETE RESTRICT,

    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    area_detail TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT zones_unit_code_unique
        UNIQUE (unit_id, code)
);

CREATE TABLE IF NOT EXISTS patrols (
    id BIGSERIAL PRIMARY KEY,

    unit_id BIGINT NOT NULL
        REFERENCES units(id)
        ON DELETE RESTRICT,

    zone_id BIGINT NOT NULL
        REFERENCES zones(id)
        ON DELETE RESTRICT,

    auditor_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    auditee_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    scheduled_date DATE NOT NULL,

    status VARCHAR(50) NOT NULL
        DEFAULT 'SCHEDULED',

    created_by BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT patrol_status_check
        CHECK (
            status IN (
                'SCHEDULED',
                'IN_PROGRESS',
                'PENDING_AUDITEE_ACTION',
                'PENDING_EHS_APPROVAL',
                'REEXAMINATION_REQUIRED',
                'COMPLETED',
                'CANCELLED'
            )
        ),

    CONSTRAINT patrol_auditor_auditee_check
        CHECK (auditor_id <> auditee_id)
);

CREATE INDEX IF NOT EXISTS
    patrols_scheduled_date_index
ON patrols (scheduled_date);

CREATE INDEX IF NOT EXISTS
    patrols_auditor_date_index
ON patrols (auditor_id, scheduled_date);

CREATE INDEX IF NOT EXISTS
    patrols_auditee_date_index
ON patrols (auditee_id, scheduled_date);

CREATE INDEX IF NOT EXISTS
    patrols_zone_date_index
ON patrols (zone_id, scheduled_date);

CREATE TABLE IF NOT EXISTS observation_reports (
    id BIGSERIAL PRIMARY KEY,

    patrol_id BIGINT NOT NULL UNIQUE
        REFERENCES patrols(id)
        ON DELETE CASCADE,

    submitted_by BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    submitted_to BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    status VARCHAR(50) NOT NULL
        DEFAULT 'OPEN',

    submitted_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT observation_report_status_check
        CHECK (
            status IN (
                'OPEN',
                'PENDING_AUDITEE_ACTION',
                'PENDING_EHS_APPROVAL',
                'REEXAMINATION_REQUIRED',
                'CLOSED'
            )
        )
);

CREATE INDEX IF NOT EXISTS
    observation_reports_submitted_to_index
ON observation_reports (submitted_to, status);

CREATE TABLE IF NOT EXISTS closure_requests (
    id BIGSERIAL PRIMARY KEY,

    observation_report_id BIGINT NOT NULL
        REFERENCES observation_reports(id)
        ON DELETE CASCADE,

    patrol_id BIGINT NOT NULL
        REFERENCES patrols(id)
        ON DELETE CASCADE,

    requested_by BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    proposed_closure_date DATE,
    action_plan TEXT NOT NULL,

    status VARCHAR(50) NOT NULL
        DEFAULT 'REQUESTED',

    requested_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    reviewed_by BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL,

    reviewed_at TIMESTAMPTZ,
    review_comments TEXT,

    closed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT closure_request_status_check
        CHECK (
            status IN (
                'REQUESTED',
                'APPROVED',
                'REJECTED',
                'REEXAMINATION_REQUIRED'
            )
        )
);

CREATE INDEX IF NOT EXISTS
    closure_requests_requested_by_index
ON closure_requests (requested_by, requested_at);

CREATE INDEX IF NOT EXISTS
    closure_requests_patrol_index
ON closure_requests (patrol_id);

CREATE INDEX IF NOT EXISTS
    closure_requests_status_index
ON closure_requests (status);

COMMIT;