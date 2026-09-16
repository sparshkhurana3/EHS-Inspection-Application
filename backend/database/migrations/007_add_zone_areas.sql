BEGIN;

/*
 * Level 4 of the location division: the fixed areas that belong to one
 * zone. Gurugram Unit I Zone 1 might hold Tool shop, Machine shop,
 * Assembly area and Utility area, while Zone 2 holds a different set.
 *
 * Rows are loaded at production cutover, never seeded here.
 */
CREATE TABLE IF NOT EXISTS zone_areas (
    id BIGSERIAL PRIMARY KEY,

    zone_id BIGINT NOT NULL
        REFERENCES zones(id)
        ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    display_order INTEGER NOT NULL DEFAULT 0,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT zone_areas_zone_name_unique
        UNIQUE (zone_id, name)
);

CREATE INDEX IF NOT EXISTS
    zone_areas_zone_index
ON zone_areas (zone_id, display_order);


/*
 * A patrol covers a whole zone, so it carries no area of its own. The
 * specific area is recorded by the auditor on the observation report,
 * because a finding happens in one place.
 *
 * Nullable: reports filed before this migration have no area, and the
 * column cannot be made mandatory until the observation form offers the
 * dropdown and existing rows are backfilled.
 */
ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS zone_area_id BIGINT
    REFERENCES zone_areas(id);

CREATE INDEX IF NOT EXISTS
    observation_reports_zone_area_index
ON observation_reports (zone_area_id);


/*
 * Locations and areas are loaded into PostgreSQL at production cutover,
 * so a CHECK constraint listing permitted values would reject the first
 * site the developers did not anticipate and would need a migration and
 * a deploy to accept it. Referential integrity comes from foreign keys
 * to plants and zone_areas instead, which accept whatever rows exist.
 */
ALTER TABLE patrols
DROP CONSTRAINT IF EXISTS patrols_plant_location_check;

ALTER TABLE patrols
DROP CONSTRAINT IF EXISTS patrols_area_detail_check;

ALTER TABLE observation_reports
DROP CONSTRAINT IF EXISTS observation_report_plant_location_check;

COMMIT;


/*
 * Deliberately NOT done here, because each needs application code to
 * change in the same release:
 *
 *   - Renaming zones.area_detail to zones.description. Several queries
 *     and mapAssignment still read the old name.
 *   - Dropping patrols.area_detail and patrols.plant_location. Both are
 *     redundant once the zone identifies the location, but code still
 *     writes them.
 *   - A unique index on plants name. It cannot be created while two
 *     Gurugram rows exist, and merging them requires deciding which id
 *     survives and repointing its units.
 */
