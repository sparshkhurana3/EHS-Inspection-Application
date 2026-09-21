BEGIN;

/*
 * The officer weekly-plan query (dashboard.repository.js,
 * findOfficerUnitWeeklyPlans) filters patrols by unit_id and
 * scheduled_date to find each unit's next scheduled week. No existing
 * index leads with unit_id, so this was a sequential scan over patrols
 * per unit.
 */
CREATE INDEX IF NOT EXISTS
    patrols_unit_scheduled_date_index
ON patrols (unit_id, scheduled_date);

/*
 * observation.repository.js's photograph ownership check looks up
 * action_tickets by observation_report_id (plus action_hod_id) so the
 * Action HOD can view the observation photo for their ticket. No
 * existing index leads with observation_report_id.
 */
CREATE INDEX IF NOT EXISTS
    action_tickets_observation_report_index
ON action_tickets (observation_report_id);

COMMIT;
