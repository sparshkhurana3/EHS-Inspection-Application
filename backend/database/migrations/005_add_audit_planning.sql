BEGIN;

/*
 * Add audit-planning fields required by the patrol module.
 */

ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS
    plant_location VARCHAR(50);

ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS
    area_detail VARCHAR(100);

ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS
    created_by BIGINT;

ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS
    ehs_officer_id BIGINT;

ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW();


/*
 * Add foreign-key constraints only when they are missing.
 */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid =
              'patrols'::regclass
          AND conname =
              'patrols_created_by_fkey'
    ) THEN
        ALTER TABLE patrols
        ADD CONSTRAINT
            patrols_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES users (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid =
              'patrols'::regclass
          AND conname =
              'patrols_ehs_officer_id_fkey'
    ) THEN
        ALTER TABLE patrols
        ADD CONSTRAINT
            patrols_ehs_officer_id_fkey
        FOREIGN KEY (ehs_officer_id)
        REFERENCES users (id);
    END IF;
END
$$;


/*
 * Restrict supported locations while allowing NULL for
 * patrol records created before audit planning was added.
 */

ALTER TABLE patrols
DROP CONSTRAINT IF EXISTS
    patrols_plant_location_check;

ALTER TABLE patrols
ADD CONSTRAINT
    patrols_plant_location_check
CHECK (
    plant_location IS NULL
    OR plant_location IN (
        'Gurugram',
        'Manesar',
        'Chennai',
        'Pune',
        'China'
    )
);


/*
 * Restrict supported area details while allowing NULL for
 * patrol records created before audit planning was added.
 */

ALTER TABLE patrols
DROP CONSTRAINT IF EXISTS
    patrols_area_detail_check;

ALTER TABLE patrols
ADD CONSTRAINT
    patrols_area_detail_check
CHECK (
    area_detail IS NULL
    OR area_detail IN (
        'ETP area',
        'Maintenance Store',
        'Utility',
        'Forge Shop',
        'Machine shop',
        'Heat Treatment',
        'Die Shop',
        'Tool Shop',
        'OSP Store'
    )
);


/*
 * Indexes used by the role-aware calendar query.
 */

CREATE INDEX IF NOT EXISTS
    patrols_auditor_scheduled_date_index
ON patrols (
    auditor_id,
    scheduled_date
);

CREATE INDEX IF NOT EXISTS
    patrols_auditee_scheduled_date_index
ON patrols (
    auditee_id,
    scheduled_date
);

CREATE INDEX IF NOT EXISTS
    patrols_ehs_officer_scheduled_date_index
ON patrols (
    ehs_officer_id,
    scheduled_date
);

CREATE INDEX IF NOT EXISTS
    patrols_status_scheduled_date_index
ON patrols (
    status,
    scheduled_date
);

CREATE INDEX IF NOT EXISTS
    units_plant_unit_number_index
ON units (
    plant_id,
    unit_number
);

CREATE INDEX IF NOT EXISTS
    zones_unit_zone_number_index
ON zones (
    unit_id,
    zone_number
);

COMMIT;