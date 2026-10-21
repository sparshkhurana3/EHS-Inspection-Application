/*
 * Which of the deployment's public origins a single sign-on started on
 * (docs/22-entra-app-proxy-plan.md): the company-network address in
 * FRONTEND_ORIGIN, or another one such as the Entra application proxy
 * URL. The callback reads it back to repeat the same redirect URI to
 * Microsoft and to send the browser home to the address it came from.
 *
 * NULL means FRONTEND_ORIGIN, which is also what every row written
 * before this migration used.
 */
ALTER TABLE entra_login_sessions
ADD COLUMN IF NOT EXISTS public_origin VARCHAR(255);
