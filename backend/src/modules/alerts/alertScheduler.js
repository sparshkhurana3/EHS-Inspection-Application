import {
  environment,
} from "../../config/environment.js";

import {
  logger,
} from "../../config/logger.js";

import {
  getLocalClock,
  runAlerts,
} from "./alerts.service.js";

/*
 * The in-process timer behind the email alerts (docs/24 D13). It wakes
 * every few minutes, does nothing until the day's send time has passed
 * in the alert time zone, and then sends whatever is due and unsent.
 * Because every alert is recorded when it is sent, a restart or a
 * failed send is simply caught up at the next tick, and the advisory
 * lock in runAlerts keeps two instances from sending twice.
 */

const FIRST_CHECK_DELAY_MILLISECONDS = 60 * 1000;

let firstTimer = null;
let intervalTimer = null;
let running = false;

async function tick() {
  if (running) {
    return;
  }

  const clock = getLocalClock();

  if (clock.time < environment.alerts.sendTime) {
    return;
  }

  running = true;

  try {
    const summary = await runAlerts();

    const sent =
      summary.escalations &&
      (Object.values(summary.escalations).some(
        (level) =>
          level.recipients > 0 ||
          level.failures > 0,
      ) ||
        summary.weeklyReminder.recipients > 0 ||
        summary.weeklyReminder.failures > 0);

    if (sent) {
      logger.info(
        "Email alerts run finished.",
        summary,
      );
    }
  } catch (error) {
    logger.error(
      "The email alerts run failed.",
      { reason: error.message },
    );
  } finally {
    running = false;
  }
}

export function startAlertScheduler() {
  if (!environment.alerts.isEnabled) {
    logger.info(
      "Email alerts are off. Set SMTP_HOST and SMTP_FROM to turn them on.",
    );

    return;
  }

  logger.info(
    "Email alerts are on.",
    {
      sendTime: environment.alerts.sendTime,
      timeZone: environment.alerts.timeZone,
      hodDays: environment.alerts.hodDays,
      plantHeadDays:
        environment.alerts.plantHeadDays,
    },
  );

  firstTimer = setTimeout(
    tick,
    FIRST_CHECK_DELAY_MILLISECONDS,
  );

  intervalTimer = setInterval(
    tick,
    environment.alerts.checkIntervalMinutes *
      60 *
      1000,
  );
}

export function stopAlertScheduler() {
  clearTimeout(firstTimer);
  clearInterval(intervalTimer);
}
