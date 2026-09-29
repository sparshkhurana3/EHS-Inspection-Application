# Connecting the EHS Inspection app to Microsoft Entra ID

This guide sets up single sign-on so staff reach the EHS Inspection app
with their normal work account, and so their access to it is managed in
the Microsoft Entra admin center rather than inside the app.

It is one chapter of the full on-premises deployment. Start with
[SETUP-GUIDE.md](SETUP-GUIDE.md), which says when to come here.

**Who this is for:** whoever administers your Microsoft 365 tenant.
Steps 1 to 6 need an account with the **Application Administrator**,
**Cloud Application Administrator** or **Global Administrator** role.
Steps 7 and 8 are done by whoever runs the EHS application server.

**How long it takes:** about 30 minutes, plus the time to decide who
gets which role.

**Two things to know before you start**

- The app keeps its username and password sign-in as a failsafe, so a
  Microsoft outage does not lock you out of your own safety records.
  Step 8 covers the break-glass accounts that make that failsafe real.
  Do not skip it.
- Once SSO is live, **Entra decides who has which role in the app**. A
  role removed in the admin center is gone from the app the next time
  that person signs in. Nobody needs to edit the application database.

---

## Before you begin

Have these to hand:

| Thing | Example | Where it is used |
|---|---|---|
| The address staff use to reach the app | `https://ehs.contoso.com` | Redirect URI, step 3 |
| Your tenant ID | `11111111-2222-…` | Step 7 |
| Somewhere safe to put a secret | a password manager, Azure Key Vault | Step 4 |

The app is served over HTTPS only. On a test machine its address is
`https://localhost`, and everything below still works: register the
test address now and add the real one later (step 3 lets you register
both).

---

## Step 1 — Register the application

1. Sign in to the **Microsoft Entra admin center**,
   <https://entra.microsoft.com>.
2. Go to **Entra ID → App registrations**.
3. Choose **New registration**.
4. Fill in:
   - **Name:** `EHS Inspection`  (staff see this on the consent and
     sign-in screens, so use a name they will recognise)
   - **Supported account types:** **Accounts in this organizational
     directory only (Single tenant)**.
     This matters. The app refuses any sign-in from outside your tenant,
     so a multi-tenant registration would only create confusion.
   - **Redirect URI:** leave it blank for now; step 3 does it properly.
5. Choose **Register**.

You now have an app registration. Its **Overview** page shows two values
you need in step 7 — leave the tab open:

- **Application (client) ID**
- **Directory (tenant) ID** — the GUID, exactly as shown. Not your
  domain name: the app compares it character for character with the
  tenant ID inside every sign-in token, which is always the GUID.

Neither is secret.

---

## Step 2 — Confirm the API permissions

Open **API permissions** on the registration. You should already see
**Microsoft Graph → User.Read (Delegated)**, added automatically.

For signing people in, that is all the app needs. It reads nothing from
Microsoft Graph about the person: the name, email address and role
assignments all arrive inside the sign-in token itself.

If your tenant requires admin consent for `User.Read`, press **Grant
admin consent for <your organisation>** so staff are not each prompted
to consent individually.

> **If photographs will be stored in SharePoint** using this same app
> registration, it also needs the **Sites.Selected** *application*
> permission, restricted to one site. That is set up in the SharePoint
> chapter of [SETUP-GUIDE.md](SETUP-GUIDE.md), not here. Grant nothing
> else.

---

## Step 3 — Add the redirect URI

Open **Authentication → Add a platform → Web**.

Under **Redirect URIs**, add the app's address with
`/api/auth/entra/callback` on the end:

```
https://ehs.contoso.com/api/auth/entra/callback
```

Rules that trip people up:

- Entra matches this **character for character**. `https` and `http`,
  a trailing slash, a port number and upper or lower case all matter.
- It ends in `/api/auth/entra/callback`, not `/sign-in`. The redirect
  goes to the application's server, not to the page staff see.
- Add a second entry for every address the app answers on. A typical
  pair is the live address and a test one:
  ```
  https://ehs.contoso.com/api/auth/entra/callback
  https://localhost/api/auth/entra/callback
  ```
- Except for `localhost`, Entra requires `https`.

On the same page:

- Leave **Front-channel logout URL** blank.
- Under **Implicit grant and hybrid flows**, leave **both** checkboxes
  **unticked**. The app uses the authorization code flow with PKCE and
  never asks for a token in the browser.

Choose **Configure**, then **Save**.

---

## Step 4 — Create a client secret

Open **Certificates & secrets → Client secrets → New client secret**.

- **Description:** `EHS Inspection app server`
- **Expires:** at most 24 months; Microsoft recommends under 12. Pick
  one and **put the renewal date in a calendar now** — when it lapses,
  SSO (and SharePoint photograph storage, if it uses this registration)
  stops for everybody and the only way in is the break-glass accounts
  from step 8.

Press **Add**, then copy the **Value** column immediately. It is shown
once and never again. (Copy the *Value*, not the *Secret ID*.)

> **Treat this like a password.** It goes in the server's `.env` file in
> step 7. It must never be committed to source control, pasted into a
> ticket or chat, or written into this guide. If it leaks, come back
> here, delete the secret and create a new one — the old one stops
> working the moment you delete it.

**If you cannot add a secret:** some tenants block client secrets with
an app management policy (**Entra ID → Enterprise apps → Application
policies**, "Block password addition"). The app currently supports only
a client secret, so ask for an exclusion for this application.
Certificate credentials, which Microsoft prefers for production, would
need a change to the app; raise it with whoever maintains it.

---

## Step 5 — Define the app roles

This is the step that makes Entra the place where access is decided.

Open **App roles → Create app role** and add one for each role below
that your organisation actually uses. For every one:

- **Allowed member types:** **Users/Groups**
- **Do you want to enable this app role?** ticked
- **Value:** exactly as in the table. **The value is what the app reads.**
  Spelling and underscores matter; the display name and description are
  free text.

| Display name | Value | What it lets someone do |
|---|---|---|
| EHS Officer | `EHS_OFFICER` | Plan patrols, upload the weekly roster, download the inspection report, approve or reject closures |
| Head of Department | `HOD` | Plant-wide management dashboard; can also approve or reject closures |
| Plant Head | `PLANT_HEAD` | Plant-wide management dashboard; can also approve or reject closures |
| Administrator | `ADMIN` | Everything an EHS Officer can do. There are no separate administration screens |
| Standard user | `USER` | Carry out audits as auditor or auditee |

Notes that save trouble later:

- **Most staff need no role at all.** Anyone who signs in without one is
  given `USER` automatically, which is exactly what an auditor or
  auditee needs. Only assign a role to people who need more.
- **Give an EHS Officer `EHS_OFFICER` and nothing else from the
  management roles.** Someone who also holds `HOD` or `PLANT_HEAD` may
  land on the plain management dashboard instead of the officer's view.
- **Management roles can approve closures.** Anyone holding
  `EHS_OFFICER`, `HOD`, `PLANT_HEAD` or `ADMIN` who is also the auditor
  or auditee of a patrol can approve that patrol's closure. Keep that in
  mind when you roster managers as auditees.

Choose **Apply** for each role.

---

## Step 6 — Decide who can reach the app, and give them their roles

By default every account in your tenant could sign in. For roughly 2000
employees that fills the app with people who never open it, so turn the
gate on.

1. Go to **Entra ID → Enterprise apps** and open **EHS Inspection**.
   (Same application, different screen: *App registrations* is where you
   configure it, *Enterprise apps* is where you decide who uses it.)
2. Open **Properties**. Set **Assignment required?** to **Yes**, and
   check **Visible to users?** is **Yes**. So that it can be launched
   from staff's **My Apps** page, set **Home page URL** on the app
   registration's **Branding & properties** to the app's address
   (`https://ehs.contoso.com`). **Save**.
3. Open **Users and groups → Add user/group**.
4. Assign people, and pick the role each one gets.

**Assign groups, not individuals.** Create a group per role — for
example `EHS-Inspection-Officers`, `EHS-Inspection-Management`,
`EHS-Inspection-Users` — and assign the group. Then day-to-day access
changes are ordinary group membership changes, and joiners and leavers
are handled by whatever process you already run. **Nested groups are
not supported** for app assignment: only direct members of an assigned
group get in.

> Assigning groups to an app role needs Entra ID P1 or P2. On the free
> tier you can only assign individual users, which for a site this size
> means the `USER` default in step 5 is doing most of the work — assign
> individuals only for the officer and management roles.

> **Global Administrators can sign in even when they are not
> assigned**, and then get `USER`. Test the gate with an ordinary
> account.

**What staff see the first time:** a normal Microsoft sign-in, possibly
a one-off consent prompt for "sign you in and read your profile" if you
skipped the admin consent in step 2, and then the app. They do not
create a password and have nothing extra to remember.

---

## Step 7 — Give the values to the application

This part is done by whoever runs the EHS application server, on the
server itself.

In the `.env` file next to `compose.yaml`, `FRONTEND_ORIGIN` should
already be the app's address (see SETUP-GUIDE.md). Add:

```dotenv
ENTRA_TENANT_ID=<Directory (tenant) ID from step 1>
ENTRA_CLIENT_ID=<Application (client) ID from step 1>
ENTRA_CLIENT_SECRET=<the secret Value from step 4>
```

The redirect URI the app sends is `FRONTEND_ORIGIN` followed by
`/api/auth/entra/callback`, which must be one of the URIs registered in
step 3, character for character. Only if the registered address has to
differ, set `ENTRA_REDIRECT_URI` to it.

Then apply the change. `.env` is read when the container is created,
so a plain `docker compose restart` does **not** pick it up:

```bash
docker compose up -d
```

Check it came up:

```bash
curl -s http://127.0.0.1:3000/api/auth/providers
```

You want `"entra":{"enabled":true,...}` and, under `local`,
`"signupEnabled":false`: once Entra is configured, self sign-up closes
unless `SELF_SIGNUP_ENABLED=true` says otherwise. If Entra says
`false`, one of the three values is missing or blank. If the container
refuses to start with *"Microsoft Entra ID is partially configured"*,
you have set some of the three and not all of them.

### The rest of the settings

All optional, and most deployments need none of them.

| Setting | Default | When you need it |
|---|---|---|
| `ENTRA_DEFAULT_ROLE` | `USER` | Role given to someone assigned to the app but to no app role. Write the line with nothing after `=` (`ENTRA_DEFAULT_ROLE=`) to refuse those sign-ins instead. |
| `ENTRA_ROLE_MAP` | empty | Only if you cannot name your app roles as step 5 says — for instance because your tenant has a naming standard. Pairs, comma separated: `EHS.Officer=EHS_OFFICER,EHS.PlantHead=PLANT_HEAD` |
| `ENTRA_ROLE_CLAIM` | `roles` | Set to `groups` to drive roles from group object IDs instead of app roles. You then need `ENTRA_ROLE_MAP` to translate each group's object ID, and the groups claim configured on the registration. App roles are simpler; prefer them. |
| `ENTRA_BUTTON_LABEL` | `Login with Entra SSO` | To reword the button, e.g. `Sign in with Microsoft`. |
| `ENTRA_AUTHORITY` | `https://login.microsoftonline.com` | Only for a sovereign cloud: `https://login.microsoftonline.us` (US Government) or `https://login.partner.microsoftonline.cn` (China). |
| `SELF_SIGNUP_ENABLED` | empty (closed with Entra) | `true` reopens the public sign-up page. Leave it closed: an open sign-up page lets anyone create a password account. |

---

## Step 8 — Set up the break-glass accounts

**Do not skip this.** Entra outages happen, client secrets expire, and
Conditional Access policies get published with mistakes in them. When
that happens the password form on the sign-in page is how your EHS team
still gets at the day's inspections.

The rule the app follows is simple: **an account can use the password
form if, and only if, it has a password.** Staff provisioned through
SSO never get one, so SSO is their only way in — which is what you want
for 2000 people. Break-glass accounts are the deliberate exception.

Create at least two, before you announce SSO to anybody, on the server:

```bash
docker compose exec backend node scripts/admin.js create-local-user \
  --username bg.ehs.officer.7k2 --email ehs.breakglass1@ehs.invalid \
  --full-name "EHS Break-glass Officer" --role EHS_OFFICER --plant GGM
```

1. The command prints a generated password **once**. Store it straight
   away wherever your organisation keeps emergency credentials.
2. **Use email addresses that do not exist in Entra**, like the
   `.invalid` one above. This is the important part: an account whose
   email matches a directory account gets linked to it on that person's
   first SSO sign-in, and its roles are then rewritten by Entra from
   that point on. An address Entra does not know stays under the app's
   own control.
3. **Use usernames that are hard to guess.** Five wrong passwords lock
   an account for 15 minutes, so a guessable name is easy to lock out
   at exactly the wrong moment.
4. `--plant` is the location code the account belongs to; an EHS
   Officer cannot plan or download reports without one.
5. **Test them, now and at every access review.** An untested
   break-glass account is not a failsafe. `admin.js reset-password`
   issues a new password and clears a lockout.

Know what these accounts are: **password sign-in never passes through
Entra**, so MFA, Conditional Access and Intune device checks do not
apply to it. Keep the list short and the passwords in the safe.

A break-glass officer can approve only the closures of patrols they are
the officer of. To let them take over another officer's open patrols:
`admin.js reassign-officer --from <old officer> --to <break-glass
account>`.

### What staff should do during an outage

If Microsoft is unreachable, the button reports it and the sign-in page
tells them to use a username and password instead. For most staff there
is nothing to fall back to, and that is the intended trade-off — the
EHS team gets in on the break-glass accounts and keeps the records
moving until Entra is back.

---

## Step 9 — Test it

Do this with a real staff account before announcing anything.

1. Open the app's sign-in page. Beneath the password form you should see
   **Login with Entra SSO** (or your `ENTRA_BUTTON_LABEL`), and no
   "Sign up" link.
   *No button?* The server does not have all three values — recheck
   step 7.
2. Press it. You should land on a Microsoft sign-in page showing **your
   organisation's** branding.
3. Sign in as a test user who has been assigned the `EHS_OFFICER` role.
4. You should return to the app, already signed in, on the EHS Officer
   dashboard.
5. Sign out, then check the password form still works with a break-glass
   account from step 8.
6. In Entra, remove that test user's role assignment. Have them sign in
   again: they should come back as an ordinary user. That confirms Entra
   is genuinely in charge of access.

### When something goes wrong

Entra reports its reason in the URL and the app writes it to the server
log. `docker compose logs backend | grep -i entra` is the fastest way to
see it.

| What you see | What it means |
|---|---|
| `AADSTS50011` redirect URI mismatch | Step 3's URI and `FRONTEND_ORIGIN` + `/api/auth/entra/callback` (or `ENTRA_REDIRECT_URI`) differ. Compare character by character — usually a trailing slash, a port, or `http` against `https`. |
| `AADSTS50105` user not assigned | Assignment is required (step 6) and this person is not assigned, directly or through a group they are a direct member of. |
| `AADSTS7000215` invalid client secret | The secret value is wrong. Copy the *Value*, not the *Secret ID* (step 4). |
| `AADSTS7000222` expired client secret | Create a new secret (step 4), update `.env`, `docker compose up -d`. |
| `AADSTS53003` blocked by Conditional Access | A Conditional Access policy refused the device or app. Check the policy's sign-in log entry. |
| `AADSTS650057` invalid resource | The `User.Read` permission was removed. Put it back (step 2). |
| "does not exist in tenant" / `AADSTS50020` | Signing in with a personal or guest Microsoft account. Only accounts in your tenant can use this app. |
| "not assigned a role in the EHS Inspection application" | `ENTRA_DEFAULT_ROLE` was set empty and this person has no app role. Assign one (step 6) or restore the default. |
| "belongs to a different organisation" | Either the token came from another tenant (confirm step 1 said **Single tenant**), or `ENTRA_TENANT_ID` is not the tenant GUID exactly as shown in step 1 — a domain name there fails every sign-in. |
| "already linked to a different Microsoft account" | Two directory accounts share one email address in the app. Someone with database access must clear `entra_object_id` on the older account. |
| Button missing entirely | `/api/auth/providers` says `enabled:false`; one of the three values in step 7 is blank. |

---

## What the app does with a sign-in

Useful for a security review.

1. The button is a plain link to the app's own server. The server
   generates a one-time `state`, a `nonce` and a PKCE verifier, stores
   them, and redirects the browser to Entra.
2. Entra authenticates the person — including MFA and any Conditional
   Access policy you apply — and sends the browser back with a code.
3. **The server** redeems that code, using the client secret and the
   PKCE verifier. The secret never goes near a browser.
4. The server verifies the identity token against your tenant's
   published signing keys, and checks the issuer, the audience, the
   expiry, the `nonce` and that the tenant ID is yours. A token failing
   any of these is refused.
5. The person is matched to an app account by the immutable `oid` claim,
   or on first sign-in by email, and their roles are rewritten from the
   token's `roles` claim.
6. The browser gets a short-lived, single-use code, which the app trades
   for the app's own session (8 hours by default, `JWT_EXPIRES_IN`).
   **No token is ever put in a URL**, so none is left in browser history
   or in proxy logs.
7. Microsoft's own tokens are used once and discarded. The app stores no
   Microsoft token and never calls Microsoft Graph on a person's behalf.
   (If photographs are stored in SharePoint, the server calls Graph with
   its own app identity, limited to one site.)

Every sign-in is recorded in the app's `authentication_events` table
with the time, IP address and browser.

---

## Routine upkeep

| When | What |
|---|---|
| Before the client secret expires | Create the new secret, update `.env`, `docker compose up -d`, then delete the old one. Both work during the overlap, so there is no outage. |
| Somebody changes job | Change their group membership. Their app roles follow at their next sign-in. |
| Somebody leaves | Disabling their Entra account stops new sign-ins, but a session they already have lasts up to 8 hours. To cut them off at once, also run `docker compose exec backend node scripts/admin.js deactivate-user --user <email>`. Their audit history stays intact. |
| An EHS Officer hands over | `admin.js reassign-officer --from <old> --to <new>` moves their open patrols, so the new officer can approve those closures. |
| Quarterly | Review who is in each role group, and test a break-glass account. |
