BEGIN;

/*
 * One roster row per zone: who audits it and who is audited, uploaded
 * once by the EHS Officer and used to generate every upcoming Monday's
 * patrol for that zone until 31 December of the upload year. A
 * re-upload replaces these rows (docs/14-weekly-roster-plan.md, D5).
 */
CREATE TABLE IF NOT EXISTS zone_audit_rosters (
    id BIGSERIAL PRIMARY KEY,

    plant_id BIGINT NOT NULL
        REFERENCES plants(id)
        ON DELETE RESTRICT,

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

    /* first Monday and 31 Dec of the upload that last set this row */
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,

    uploaded_by BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    source_file_name TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT zone_audit_rosters_zone_unique
        UNIQUE (zone_id),

    CONSTRAINT zone_audit_rosters_people_differ
        CHECK (auditor_id <> auditee_id),

    CONSTRAINT zone_audit_rosters_range_check
        CHECK (effective_from <= effective_to)
);

CREATE INDEX IF NOT EXISTS
    zone_audit_rosters_plant_index
ON zone_audit_rosters (plant_id);

/*
 * Which roster row generated a patrol; NULL for a patrol planned by hand
 * through the existing single-audit form. ON DELETE SET NULL: when a
 * zone drops out of a re-uploaded file its roster row is deleted but its
 * past patrols stay as history.
 */
ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS roster_id BIGINT
    REFERENCES zone_audit_rosters(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS
    patrols_roster_index
ON patrols (roster_id)
WHERE roster_id IS NOT NULL;

COMMIT;
