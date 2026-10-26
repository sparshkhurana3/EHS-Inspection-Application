import {
  databasePool,
} from "../../config/database.js";

import {
  environment,
} from "../../config/environment.js";

import {
  logger,
} from "../../config/logger.js";

import {
  isEmailConfigured,
  sendEmail,
} from "../../shared/email/mailer.js";

import {
  getMondayOnOrBefore,
} from "../../shared/fiscalYear.js";

import {
  buildEscalationEmail,
  buildWeeklyDigestEmail,
} from "./alertEmail.js";

import * as alertsRepository
  from "./alerts.repository.js";

/*
 * The email alerts (docs/24):
 *
 * - Escalation: a report with observations that the auditee has not
 *   sent for approval within 15 days goes to its HOD, within 30 days to
 *   the Plant Head of its location. Each level is sent once per report
 *   and person, one digest email per recipient per run.
 * - Monday reminder: every auditor with an audit from an earlier week
 *   still unreported, and every auditee with a closure from an earlier
 *   week still unfinished, gets one email on Monday.
 *
 * A run holds a PostgreSQL advisory lock, so two backend instances
 * never send the same mail twice.
 */

const ADVISORY_LOCK_KEY = 7203001;

/**
 * The calendar date, weekday and time of day in the alert time zone.
 */
export function getLocalClock(
  referenceDate = new Date(),
  timeZone = environment.alerts.timeZone,
) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(referenceDate)
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
  };
}

function groupBy(rows, keyOf) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = keyOf(row);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  });

  return groups;
}

async function sendOrCollect(
  message,
  to,
  dryRun,
  collected,
) {
  if (dryRun) {
    collected.push({ to, ...message });

    return;
  }

  await sendEmail({ to, ...message });
}

/**
 * Sends the HOD (15 days) and Plant Head (30 days) escalations that
 * are due and not yet sent.
 */
async function runEscalations({
  today,
  timeZone,
  dryRun,
  levels,
  collected,
}) {
  const summary = {};

  const definitions = [
    {
      level: "HOD",
      days: environment.alerts.hodDays,
    },
    {
      level: "PLANT_HEAD",
      days: environment.alerts.plantHeadDays,
    },
  ].filter(
    (definition) =>
      !levels || levels.includes(definition.level),
  );

  for (const { level, days } of definitions) {
    const rows =
      await alertsRepository.findDueEscalations({
        level,
        days,
        today,
        timeZone,
      });

    const unreachable =
      await alertsRepository
        .countDueWithoutRecipient({
          level,
          days,
          today,
          timeZone,
        });

    if (unreachable > 0) {
      logger.warn(
        "Observation reports are due for an alert but have nobody to send it to.",
        {
          level,
          reports: unreachable,
          reason:
            level === "HOD"
              ? "The HOD is inactive or has no email address."
              : "The plant has no active Plant Head with an email address.",
        },
      );
    }

    const byRecipient = groupBy(
      rows,
      (row) => row.recipientId,
    );

    const result = {
      recipients: 0,
      reports: 0,
      failures: 0,
    };

    for (const recipientRows of byRecipient.values()) {
      const [first] = recipientRows;

      const message = buildEscalationEmail({
        level,
        days,
        recipientName: first.recipientName,
        rows: recipientRows,
      });

      try {
        await sendOrCollect(
          message,
          first.recipientEmail,
          dryRun,
          collected,
        );

        /*
         * Recorded only once the server has accepted the message, so a
         * failed send is retried at the next run and a successful one
         * is never repeated.
         */
        if (!dryRun) {
          await alertsRepository
            .recordEscalationsSent({
              level,
              rows: recipientRows,
            });
        }

        result.recipients += 1;
        result.reports += recipientRows.length;
      } catch (error) {
        result.failures += 1;

        logger.error(
          "Could not send an escalation email.",
          {
            level,
            recipient: first.recipientEmail,
            reports: recipientRows.length,
            reason: error.message,
            smtpCode:
              error.responseCode ?? error.code,
          },
        );
      }
    }

    summary[level] = result;
  }

  return summary;
}

/**
 * Sends the Monday reminder to people with work still open from
 * earlier weeks. Does nothing on other days unless `force` is set.
 */
async function runWeeklyDigest({
  clock,
  timeZone,
  dryRun,
  force,
  collected,
}) {
  const result = {
    recipients: 0,
    items: 0,
    failures: 0,
    skipped: false,
  };

  if (clock.weekday !== "Mon" && !force) {
    result.skipped = true;

    return result;
  }

  const weekStart = getMondayOnOrBefore(
    clock.date,
  );

  const [reports, closures, alreadySent] =
    await Promise.all([
      alertsRepository
        .findPendingReportsForDigest({
          weekStart,
          today: clock.date,
        }),

      alertsRepository
        .findPendingClosuresForDigest({
          weekStart,
          today: clock.date,
          timeZone,
        }),

      alertsRepository
        .findDigestRecipientsAlreadySent(
          clock.date,
        ),
    ]);

  const reportsByUser = groupBy(
    reports,
    (row) => row.userId,
  );

  const closuresByUser = groupBy(
    closures,
    (row) => row.userId,
  );

  const userIds = new Set([
    ...reportsByUser.keys(),
    ...closuresByUser.keys(),
  ]);

  for (const userId of userIds) {
    if (alreadySent.has(userId)) {
      continue;
    }

    const userReports =
      reportsByUser.get(userId) ?? [];

    const userClosures =
      closuresByUser.get(userId) ?? [];

    const [person] = [
      ...userReports,
      ...userClosures,
    ];

    try {
      await sendOrCollect(
        buildWeeklyDigestEmail({
          recipientName: person.userName,
          reports: userReports,
          closures: userClosures,
        }),
        person.userEmail,
        dryRun,
        collected,
      );

      if (!dryRun) {
        await alertsRepository.recordDigestSent({
          userId,
          digestDate: clock.date,
          email: person.userEmail,
          pendingReports: userReports.length,
          pendingClosures: userClosures.length,
        });
      }

      result.recipients += 1;

      result.items +=
        userReports.length +
        userClosures.length;
    } catch (error) {
      result.failures += 1;

      logger.error(
        "Could not send the Monday reminder.",
        {
          recipient: person.userEmail,
          reason: error.message,
          smtpCode:
            error.responseCode ?? error.code,
        },
      );
    }
  }

  return result;
}

/**
 * One pass over everything that is due. `dryRun` builds the messages
 * and returns them without sending or recording anything. `force`
 * runs the Monday reminder on any day. `levels` limits the escalations.
 */
export async function runAlerts({
  referenceDate = new Date(),
  dryRun = false,
  force = false,
  levels = null,
} = {}) {
  if (!dryRun && !isEmailConfigured()) {
    throw new Error(
      "Email is not configured. Set SMTP_HOST and SMTP_FROM.",
    );
  }

  const { timeZone } = environment.alerts;

  const clock = getLocalClock(
    referenceDate,
    timeZone,
  );

  const lockClient =
    await databasePool.connect();

  try {
    const lock = await lockClient.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [ADVISORY_LOCK_KEY],
    );

    if (!lock.rows[0].locked) {
      return { skipped: "locked" };
    }

    try {
      const collected = [];

      const escalations = await runEscalations({
        today: clock.date,
        timeZone,
        dryRun,
        levels,
        collected,
      });

      const digest = await runWeeklyDigest({
        clock,
        timeZone,
        dryRun,
        force,
        collected,
      });

      const summary = {
        date: clock.date,
        escalations,
        weeklyReminder: digest,
      };

      return dryRun
        ? { ...summary, messages: collected }
        : summary;
    } finally {
      await lockClient.query(
        "SELECT pg_advisory_unlock($1)",
        [ADVISORY_LOCK_KEY],
      );
    }
  } finally {
    lockClient.release();
  }
}
