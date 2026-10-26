import nodemailer from "nodemailer";

import {
  environment,
} from "../../config/environment.js";

/*
 * Email over SMTP (docs/24). The transport is created on first use and
 * reused. It supports an authenticated server and an unauthenticated
 * relay (no SMTP_USER), with STARTTLS required unless the deployment
 * says otherwise. Nothing here logs the password.
 */

let transport = null;

export function isEmailConfigured() {
  return environment.email.isEnabled;
}

function getTransport() {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured. Set SMTP_HOST and SMTP_FROM.",
    );
  }

  if (!transport) {
    const smtp = environment.email;

    transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure && smtp.requireTls,
      auth: smtp.user
        ? {
            user: smtp.user,
            pass: smtp.password,
          }
        : undefined,
      tls: {
        rejectUnauthorized:
          smtp.rejectUnauthorized,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }

  return transport;
}

/**
 * Sends one message and resolves when the server has accepted it.
 * Throws an Error carrying the SMTP response code when it is refused.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}) {
  await getTransport().sendMail({
    from: environment.email.from,
    to,
    subject,
    text,
    html,
  });
}

/**
 * Connects and authenticates without sending anything, for the
 * operator's `check` command.
 */
export async function verifyEmailConnection() {
  await getTransport().verify();
}
