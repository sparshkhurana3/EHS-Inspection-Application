BEGIN;

/*
 * A user belongs to one location.
 *
 * For a user holding EHS_OFFICER this is the domain they may plan audits
 * in: they see only the units and zones of this plant. For every user it
 * decides which auditor and auditee dropdowns they appear in, since an
 * audit is staffed from registered users at that location.
 *
 * This replaces selecting auditors and auditees by the AUDITOR and
 * AUDITEE role codes, which exist only in the test seed scripts.
 *
 * Nullable on purpose so the migration is safe to apply before the
 * backfill. The planning API must reject an officer whose location is
 * unset with a clear message rather than rendering an empty form.
 */
ALTER TABLE users
ADD COLUMN IF NOT EXISTS plant_id BIGINT
    REFERENCES plants(id);


/*
 * Supports the two location-scoped lookups: the officer's zones, and the
 * candidate list for auditor and auditee. Partial, because inactive
 * users never appear in either.
 */
CREATE INDEX IF NOT EXISTS
    users_plant_index
ON users (plant_id)
WHERE is_active;

COMMIT;


/*
 * Backfill is mandatory before the Plan page ships. Until every user has
 * a plant_id, the auditor and auditee dropdowns are empty and no officer
 * can schedule anything. Assign users at cutover, for example:
 *
 *   UPDATE users SET plant_id = (SELECT id FROM plants WHERE code = 'GGM')
 *   WHERE username IN (...);
 *
 * Not supported by a single column: an officer covering two locations,
 * or a user who audits outside their own site. Either needs a user_plants
 * join table.
 */
