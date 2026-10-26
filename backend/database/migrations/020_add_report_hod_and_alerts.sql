/*
 * The HOD of the auditee on an observation report, and the record of
 * the email alerts sent about reports that are not closed in time
 * (docs/24-hod-escalation-plant-head-photos-plan.md).
 */

/*
 * The auditor names the auditee's HOD when filing a report with
 * observations. NULL on a "no observation to record" report (nothing to
 * close) and on every report filed before this migration; those never
 * escalate.
 */
ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS hod_id BIGINT REFERENCES users (id);

CREATE INDEX IF NOT EXISTS observation_reports_hod_index
  ON observation_reports (hod_id);

/*
 * One row per escalation email sent about a report to one person, so
 * each level goes out once and the table is the record of who was told
 * and when. HOD is the 15-day alert, PLANT_HEAD the 30-day one.
 */
CREATE TABLE IF NOT EXISTS observation_alerts (
  id BIGSERIAL PRIMARY KEY,

  observation_report_id BIGINT NOT NULL
    REFERENCES observation_reports (id) ON DELETE CASCADE,

  level VARCHAR(20) NOT NULL,

  recipient_user_id BIGINT NOT NULL REFERENCES users (id),

  recipient_email VARCHAR(255) NOT NULL,

  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT observation_alerts_level_check
    CHECK (level IN ('HOD', 'PLANT_HEAD')),

  CONSTRAINT observation_alerts_once
    UNIQUE (observation_report_id, level, recipient_user_id)
);

/*
 * The Monday reminder to auditors and auditees about work still open
 * from earlier weeks: one row per person per Monday, so a restart or a
 * second instance never sends it twice.
 */
CREATE TABLE IF NOT EXISTS weekly_digest_log (
  id BIGSERIAL PRIMARY KEY,

  user_id BIGINT NOT NULL REFERENCES users (id),

  digest_date DATE NOT NULL,

  recipient_email VARCHAR(255) NOT NULL,

  pending_reports INTEGER NOT NULL DEFAULT 0,
  pending_closures INTEGER NOT NULL DEFAULT 0,

  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT weekly_digest_log_once
    UNIQUE (user_id, digest_date)
);
