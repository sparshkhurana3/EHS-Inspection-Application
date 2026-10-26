import {
  databasePool,
} from "../src/config/database.js";

import {
  environment,
} from "../src/config/environment.js";

import {
  runAlerts,
} from "../src/modules/alerts/alerts.service.js";

import {
  isEmailConfigured,
  sendEmail,
  verifyEmailConnection,
} from "../src/shared/email/mailer.js";

import {
  BRAND,
  footerLegal,
} from "../src/shared/brand.js";

/*
 * Email alerts, from the command line (docs/24). Run inside the backend
 * container so it uses the deployment's own settings:
 *
 *   docker compose exec backend node scripts/alerts.js check
 *   docker compose exec backend node scripts/alerts.js test-email you@example.com
 *   docker compose exec backend node scripts/alerts.js due
 *   docker compose exec backend node scripts/alerts.js run
 */

const HELP = `Usage: node scripts/alerts.js <command>

  check                  Show the alert settings and connect to the SMTP server.
  test-email <address>   Send one short test message.
  due [--force-monday]   Dry run: print what would be sent now. Sends and
                         records nothing. --force-monday includes the Monday
                         reminder even if today is not Monday.
  run [--force-monday]   Send everything that is due now, ignoring the daily
                         send time. Alerts already sent are never repeated.
`;

function describeSettings() {
  const { email, alerts } = environment;

  console.log(
    email.isEnabled
      ? `SMTP: ${email.host}:${email.port} (${
          email.secure
            ? "implicit TLS"
            : email.requireTls
              ? "STARTTLS required"
              : "STARTTLS if offered"
        }), ${
          email.user
            ? `user ${email.user}`
            : "no login (relay)"
        }, from ${email.from}`
      : "SMTP: not configured (SMTP_HOST is empty)",
  );

  console.log(
    `Alerts: ${
      alerts.isEnabled ? "on" : "off"
    }, send time ${alerts.sendTime} ${
      alerts.timeZone
    }, HOD after ${
      alerts.hodDays
    } days, Plant Head after ${
      alerts.plantHeadDays
    } days, check every ${
      alerts.checkIntervalMinutes
    } minutes`,
  );
}

async function main() {
  const [command, ...rest] =
    process.argv.slice(2);

  const force = rest.includes("--force-monday");

  switch (command) {
    case "check":
      describeSettings();

      if (!isEmailConfigured()) {
        process.exitCode = 1;

        return;
      }

      await verifyEmailConnection();

      console.log(
        "Connected to the SMTP server and signed in.",
      );

      return;

    case "test-email": {
      const address = rest[0];

      if (!address || !address.includes("@")) {
        console.error(
          "Give an email address: test-email you@example.com",
        );

        process.exitCode = 1;

        return;
      }

      await sendEmail({
        to: address,
        subject: `${BRAND.productName}: test email`,
        text: `This is a test message from ${BRAND.productName}. If you can read it, email alerts can reach this mailbox.\n\n${footerLegal()}`,
        html: `<p>This is a test message from <strong>${BRAND.productName}</strong>. If you can read it, email alerts can reach this mailbox.</p><p style="color:#667085;font-size:12px;">${footerLegal()}</p>`,
      });

      console.log(`Test email sent to ${address}.`);

      return;
    }

    case "due": {
      const result = await runAlerts({
        dryRun: true,
        force,
      });

      const { messages = [], ...summary } = result;

      console.log(
        JSON.stringify(summary, null, 2),
      );

      messages.forEach((message) => {
        console.log(
          `\n--- to ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
        );
      });

      if (messages.length === 0) {
        console.log("Nothing is due.");
      }

      return;
    }

    case "run": {
      const result = await runAlerts({ force });

      console.log(
        JSON.stringify(result, null, 2),
      );

      return;
    }

    default:
      console.log(HELP);

      if (command && command !== "help") {
        process.exitCode = 1;
      }
  }
}

try {
  await main();
} catch (error) {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await databasePool.end();
}
