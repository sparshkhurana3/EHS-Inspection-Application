BEGIN;

ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS ehs_officer_id BIGINT
    REFERENCES users(id)
    ON DELETE SET NULL;

ALTER TABLE units
ADD COLUMN IF NOT EXISTS unit_number VARCHAR(50);

ALTER TABLE zones
ADD COLUMN IF NOT EXISTS zone_number VARCHAR(50);

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS report_number VARCHAR(50);

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS finding_date DATE;

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS plant_location VARCHAR(50);

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS observation_location TEXT;

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS category VARCHAR(2);

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS photograph_path TEXT;

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS photograph_original_name TEXT;

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS photograph_mime_type VARCHAR(100);

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS photograph_size BIGINT;

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS risk_category VARCHAR(20);

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS
    observation_reports_report_number_unique
ON observation_reports (report_number)
WHERE report_number IS NOT NULL;

ALTER TABLE observation_reports
DROP CONSTRAINT IF EXISTS observation_report_category_check;

ALTER TABLE observation_reports
ADD CONSTRAINT observation_report_category_check
CHECK (
    category IS NULL
    OR category IN ('UA', 'UC')
);

ALTER TABLE observation_reports
DROP CONSTRAINT IF EXISTS observation_report_risk_check;

ALTER TABLE observation_reports
ADD CONSTRAINT observation_report_risk_check
CHECK (
    risk_category IS NULL
    OR risk_category IN (
        'HIGH',
        'MEDIUM',
        'LOW'
    )
);

ALTER TABLE observation_reports
DROP CONSTRAINT IF EXISTS observation_report_plant_location_check;

ALTER TABLE observation_reports
ADD CONSTRAINT observation_report_plant_location_check
CHECK (
    plant_location IS NULL
    OR plant_location IN (
        'Gurugram',
        'Pune',
        'Chennai',
        'Manesar',
        'China'
    )
);

CREATE INDEX IF NOT EXISTS
    patrols_ehs_officer_index
ON patrols (ehs_officer_id);

CREATE INDEX IF NOT EXISTS
    observation_reports_status_index
ON observation_reports (status);

CREATE INDEX IF NOT EXISTS
    observation_reports_finding_date_index
ON observation_reports (finding_date);

COMMIT;