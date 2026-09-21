BEGIN;

/*
 * Up to 10 observations per report. The report row keeps the header
 * (patrol, dates, status, number) and, for backward compatibility, its
 * existing per-observation columns keep being filled with observation
 * #1 (docs/15-observations-refinement-plan.md, D2) so the closure,
 * ticket and dashboard queries need no change; a page that should show
 * every observation reads observation_items instead.
 */
CREATE TABLE IF NOT EXISTS observation_items (
    id BIGSERIAL PRIMARY KEY,

    observation_report_id BIGINT NOT NULL
        REFERENCES observation_reports(id)
        ON DELETE CASCADE,

    sequence_number INTEGER NOT NULL,

    zone_area_id BIGINT
        REFERENCES zone_areas(id),

    observation_location TEXT,

    category VARCHAR(2) NOT NULL,
    description TEXT NOT NULL,
    risk_category VARCHAR(20) NOT NULL,

    photograph_path TEXT NOT NULL,
    photograph_original_name TEXT,
    photograph_mime_type VARCHAR(100),
    photograph_size BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT observation_items_sequence_unique
        UNIQUE (observation_report_id, sequence_number),

    CONSTRAINT observation_items_sequence_range
        CHECK (sequence_number BETWEEN 1 AND 10),

    CONSTRAINT observation_items_category_check
        CHECK (category IN ('UA', 'UC')),

    CONSTRAINT observation_items_risk_check
        CHECK (
            risk_category IN (
                'HIGH',
                'MEDIUM',
                'LOW'
            )
        )
);

CREATE INDEX IF NOT EXISTS
    observation_items_report_index
ON observation_items (
    observation_report_id,
    sequence_number
);

/*
 * A report closed by "No observation to record" (D4): no items, no
 * closure ever opens for it, and the patrol moves straight to
 * COMPLETED.
 */
ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS no_observations
    BOOLEAN NOT NULL DEFAULT FALSE;

/*
 * Backfill: one item per existing report, from the columns it already
 * holds, so every report filed before this migration renders exactly
 * as before.
 */
INSERT INTO observation_items (
    observation_report_id,
    sequence_number,
    zone_area_id,
    observation_location,
    category,
    description,
    risk_category,
    photograph_path,
    photograph_original_name,
    photograph_mime_type,
    photograph_size,
    created_at
)
SELECT
    r.id,
    1,
    r.zone_area_id,
    r.observation_location,
    r.category,
    r.description,
    r.risk_category,
    r.photograph_path,
    r.photograph_original_name,
    r.photograph_mime_type,
    r.photograph_size,
    r.submitted_at
FROM observation_reports AS r
WHERE r.no_observations = FALSE
  AND r.description IS NOT NULL
  AND r.photograph_path IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM observation_items AS i
      WHERE i.observation_report_id = r.id
  );

COMMIT;
