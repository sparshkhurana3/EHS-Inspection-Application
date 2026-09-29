# EHS Inspection — on-premises setup guide

This guide takes the EHS Inspection application from a copy of this
repository to a production service on your own server, with:

- **Microsoft Entra ID** single sign-on for staff, with password
  sign-in kept only for a few break-glass accounts;
- **Microsoft Intune** delivering the app to company Windows PCs and to
  staff's own phones, and enforcing the device and app conditions for
  reaching it;
- **SharePoint Online** holding the inspection photographs.

Work through the chapters in order. Each one ends with a check, so a
mistake is caught where it was made rather than three chapters later.

---

## Who does what

| Chapter | Who | Needs |
|---|---|---|
| 1–6 | Server administrator | root/sudo on a Linux server, the DNS name, a TLS certificate |
| 7 (and [guide.md](guide.md)) | Microsoft 365 / Entra administrator | Application Administrator or Cloud Application Administrator |
| 8–9 | Server administrator, with the EHS lead | The list of staff, their work email and their plant |
| 10 | SharePoint administrator + Entra administrator | SharePoint Administrator; an account that can grant `Sites.FullControl.All` for one call |
| 11 | Intune administrator (+ Conditional Access administrator) | Intune Administrator; Conditional Access Administrator |
| 12–14 | Server administrator | — |

Allow a day for the whole thing, most of it waiting on other people:
the certificate, DNS, and the list of who gets which role.

---

## 1. Before you begin

### 1.1 What you are deploying

Three containers on one Linux server, started by Docker Compose from
[compose.yaml](compose.yaml):

| Container | What it is | Reachable from |
|---|---|---|
| `frontend` | nginx: serves the web app and passes `/api` to the backend. **HTTPS only, port 443.** | Staff browsers |
| `backend` | Node.js API | Only nginx, plus `127.0.0.1:3000` on the server itself |
| `db` | PostgreSQL 16 | Only the backend |

Nothing listens on port 80. Two Docker volumes hold the data:
`ehs-inspection_ehs_postgres_data` (the database) and
`ehs-inspection_ehs_uploads` (photographs, while they are stored
locally, and uploads while they are being processed).

### 1.2 Network flows

| From | To | Port | Why |
|---|---|---|---|
| Staff devices | the server | 443/TCP | The app |
| The server | `login.microsoftonline.com` | 443/TCP | Sign-in, and tokens for SharePoint |
| The server | `graph.microsoft.com` | 443/TCP | SharePoint photograph storage |
| The server | `<tenant>.sharepoint.com` | 443/TCP | Downloading photographs from SharePoint |
| The server (build time only) | Docker Hub, `registry.npmjs.org` | 443/TCP | Building the images |

If the server reaches the internet only through a proxy, see §4.3.

### 1.3 Decisions to make first

1. **The address.** One DNS name staff will use, e.g.
   `ehs.contoso.com`. Use the same name everywhere — on the shop floor,
   in the office, and (if you ever publish it) from outside — because
   Entra sends people back to exactly this address.
2. **The certificate.** Staff will use **their own phones**, which
   Intune does not enrol and so cannot give your internal root
   certificate to. A certificate from your internal CA will show a
   security warning on those phones. **Use a certificate from a
   publicly trusted CA for the DNS name** (it works even if the name
   only resolves inside your network: public CAs can validate by DNS).
3. **How phones reach the server.** On the company Wi-Fi, with the name
   resolving to the server, nothing else is needed. Off site (mobile
   data), phones cannot reach an on-premises server at all unless you
   add VPN or **Microsoft Entra application proxy** (§11.5).
4. **Who is who.** For each plant: the EHS Officer(s), the management
   roles, and the auditors and auditees with their work email address.
5. **The locations.** For each plant: its units, the zones in each unit,
   and the fixed list of areas in each zone.

### 1.4 Licences

| Feature | Needs |
|---|---|
| Single sign-on, app roles for individual users | Included with Entra ID Free |
| Assigning **groups** to app roles; Conditional Access | Entra ID P1 (e.g. Microsoft 365 E3, Business Premium) |
| Intune app protection and compliance | Intune licence for each user |
| Application proxy (optional, §11.5) | Entra ID P1 |

---

## 2. Prepare the server

**Recommended:** a Linux x86-64 server (Ubuntu 22.04/24.04 LTS or RHEL 9)
with 2 vCPU and 4 GB RAM minimum (4 vCPU / 8 GB is comfortable; each
photograph is decoded and recompressed on upload), and disk for the
database and photographs (§13.5). ARM64 also works.

1. Install **Docker Engine** and the **Docker Compose plugin** from
   Docker's own repository (<https://docs.docker.com/engine/install/>).
   Check: `docker compose version` prints v2.x.
2. Put a copy of this repository on the server, e.g. in
   `/opt/ehs-inspection`, and work from there. Every command in this
   guide runs from that directory (the one holding `compose.yaml`).
3. **Firewall.** Allow inbound 443/TCP only. Note that ports Docker
   publishes **bypass `ufw`**; filter at your network firewall or in the
   `DOCKER-USER` iptables chain rather than relying on `ufw` rules. The
   API's own port is published on `127.0.0.1` only and is not reachable
   from the network.
4. Leave the server's clock on NTP. The containers run in UTC on
   purpose; do not change their `TZ`.

**No internet on the server?** Build the images on a connected machine
(`docker compose build`), move them with `docker save` / `docker load`,
and keep the `certs/` directory and `.env` on the server.

---

## 3. Certificate and DNS

1. Create the DNS record for the chosen name, pointing at the server.
2. Obtain the certificate (§1.3). You need two PEM files:
   - `tls.crt` — the server certificate **followed by the intermediate
     certificate(s)**, in that order, in one file;
   - `tls.key` — the private key, **unencrypted** (nginx starts without
     prompting).
3. Put them in `certs/` next to `compose.yaml`:
   ```bash
   mkdir -p certs
   cp /path/to/fullchain.pem certs/tls.crt
   cp /path/to/privkey.pem   certs/tls.key
   chmod 600 certs/tls.key
   ```
   `certs/` is in `.gitignore`; the key must never be committed. To keep
   the certificate elsewhere, set `TLS_CERT_DIR` in `.env`.

**Check:**
```bash
openssl x509 -in certs/tls.crt -noout -subject -dates -ext subjectAltName
```
The subject alternative names must include your DNS name, and the
dates must be current.

*Test machine only:* a self-signed certificate is enough for trying the
app on `https://localhost` (browsers will warn):
```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost" -keyout certs/tls.key -out certs/tls.crt
```

---

## 4. Configure `.env`

### 4.1 Create it

```bash
cp .env.example .env
chmod 600 .env
```

[.env.example](.env.example) documents every setting. For the first start
set only these, and leave Entra and SharePoint blank for now (they come
in chapters 7 and 10):

| Setting | Set it to |
|---|---|
| `POSTGRES_PASSWORD` | A long random value: `openssl rand -base64 32` |
| `JWT_SECRET` | A long random value: `openssl rand -base64 48`. Changing it later signs everybody out. |
| `FRONTEND_ORIGIN` | `https://ehs.contoso.com` — your address, `https://`, no trailing slash. Add `:port` only if `HTTPS_PORT` is not 443. |
| `HTTPS_PORT` | `443` |
| `TLS_CERT_DIR` | `./certs` |

Keep `POSTGRES_DB`, `POSTGRES_USER`, `JWT_EXPIRES_IN` (`8h` — always with
a unit; a bare number is read as milliseconds) and `PASSWORD_SALT_ROUNDS`
as they are.

`.env` now holds secrets. Keep a copy in your password safe: it is not
in any backup of the containers.

### 4.2 Applying changes later

`.env` is read when containers are created. After any change:
```bash
docker compose up -d
```
A plain `docker compose restart` does **not** re-read `.env`.

### 4.3 Outbound proxy (only if needed)

If the server reaches Microsoft through a proxy, add to `.env`:
```dotenv
HTTPS_PROXY=http://proxy.contoso.com:8080
NODE_USE_ENV_PROXY=1
```
Both are needed: the second is what makes Node's HTTP client use the
first. Check it after chapters 7 and 10 with a real sign-in and the
SharePoint `check` command.

---

## 5. First start

```bash
docker compose up -d --build
docker compose ps
```

The first build takes several minutes. When `docker compose ps` shows
`db` and `backend` as **healthy** and `frontend` as running:

```bash
docker compose logs backend | grep -E "Migration|schema|started"
```
You should see the database migrations applied (or "Database schema is
up to date.") and "EHS API started." Migrations run automatically on
every start; there is nothing to run by hand.

**Checks:**
```bash
curl -s https://ehs.contoso.com/api/health            # {"status":"healthy",...}
curl -sI https://ehs.contoso.com/ | grep -i strict     # Strict-Transport-Security header
curl -s --max-time 5 http://ehs.contoso.com/ || echo "no plain HTTP: correct"
```
(Use `-k` with a self-signed test certificate.) Then open
`https://ehs.contoso.com` in a browser: you should get the landing page
with a valid padlock.

**If `frontend` keeps restarting:** `docker compose logs frontend`. The
usual cause is a missing or misnamed `certs/tls.crt` / `certs/tls.key`,
or a key that does not match the certificate.

**Never load the test data.** `backend/database/seeds/` creates test
accounts with a published password, including an EHS Officer. Those
files are for development machines only and are not applied
automatically; do not run them against this database.

---

## 6. Load your locations

The app's location hierarchy — plant → unit → zone → areas — is read
from the database and has no screens of its own. Load it with SQL once,
and again whenever the site changes.

### 6.1 Rules

- Every **plant** has a unique `code` (e.g. `GGM`) and a `name` of at
  most **50 characters**. The code is what administrators type; the
  name is what staff see.
- Units belong to a plant, zones to a unit, areas to a zone. Codes are
  unique within their parent.
- **Every zone needs at least one area.** A zone with none cannot be
  scheduled, and every observation must name an area of its zone.
- `unit_number` and `zone_number` sort as text, so write them
  zero-padded (`01`, `02` … `10`).
- **Never delete** a row that has been used. Retire it instead
  (`is_active = FALSE`).

### 6.2 Template

Save as `locations-GGM.sql`, edit the lists, and apply. It is safe to
run again after editing (it updates what is there and adds what is new,
but does not retire rows you removed from the lists).

```sql
BEGIN;

INSERT INTO plants (name, code, is_active)
VALUES ('Gurugram', 'GGM', TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;

INSERT INTO units (plant_id, name, code, unit_number, is_active)
SELECT p.id, v.name, v.code, v.unit_number, TRUE
FROM plants p
CROSS JOIN (VALUES
  ('Unit I',  'U1', '01'),
  ('Unit II', 'U2', '02')
) AS v(name, code, unit_number)
WHERE p.code = 'GGM'
ON CONFLICT (plant_id, code) DO UPDATE
SET name = EXCLUDED.name, unit_number = EXCLUDED.unit_number,
    is_active = EXCLUDED.is_active;

INSERT INTO zones (unit_id, name, code, zone_number, area_detail, is_active)
SELECT u.id, v.name, v.code, v.zone_number, v.area_detail, TRUE
FROM units u
JOIN plants p ON p.id = u.plant_id AND p.code = 'GGM'
JOIN (VALUES
  ('U1', 'Zone 1', 'Z1', '01', 'Machining and tool room'),
  ('U1', 'Zone 2', 'Z2', '02', 'Utilities'),
  ('U2', 'Zone 1', 'Z1', '01', 'Forge shop')
) AS v(unit_code, name, code, zone_number, area_detail) ON v.unit_code = u.code
ON CONFLICT (unit_id, code) DO UPDATE
SET name = EXCLUDED.name, zone_number = EXCLUDED.zone_number,
    area_detail = EXCLUDED.area_detail, is_active = EXCLUDED.is_active;

INSERT INTO zone_areas (zone_id, name, display_order, is_active)
SELECT z.id, v.area_name, v.display_order, TRUE
FROM zones z
JOIN units u  ON u.id = z.unit_id
JOIN plants p ON p.id = u.plant_id AND p.code = 'GGM'
JOIN (VALUES
  ('U1', 'Z1', 'Tool shop',     1),
  ('U1', 'Z1', 'Machine shop',  2),
  ('U1', 'Z2', 'Utility area',  1),
  ('U1', 'Z2', 'ETP area',      2),
  ('U2', 'Z1', 'Forge shop',    1),
  ('U2', 'Z1', 'Die shop',      2)
) AS v(unit_code, zone_code, area_name, display_order)
  ON v.unit_code = u.code AND v.zone_code = z.code
ON CONFLICT (zone_id, name) DO UPDATE
SET display_order = EXCLUDED.display_order, is_active = EXCLUDED.is_active;

COMMIT;
```

Apply it:
```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < locations-GGM.sql
```

**Check** — every zone should show at least one area:
```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT p.code, u.name AS unit, z.name AS zone, COUNT(a.id) FILTER (WHERE a.is_active) AS areas
FROM plants p JOIN units u ON u.plant_id = p.id JOIN zones z ON z.unit_id = u.id
LEFT JOIN zone_areas a ON a.zone_id = z.id
WHERE p.is_active AND u.is_active AND z.is_active
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SQL
```

To retire something later, e.g. an area:
`UPDATE zone_areas SET is_active = FALSE WHERE name = 'ETP area' AND zone_id = …;`

---

## 7. Single sign-on with Entra ID

Hand [guide.md](guide.md) to your Entra administrator. It covers the app
registration, redirect URI, client secret, app roles, assignment, and
testing, step by step. The values it needs from you:

| guide.md asks for | Give them |
|---|---|
| The app's address | `FRONTEND_ORIGIN`, e.g. `https://ehs.contoso.com` |
| Redirect URI | `https://ehs.contoso.com/api/auth/entra/callback` |
| Home page URL | `https://ehs.contoso.com` |

and they give back three values for `.env`: `ENTRA_TENANT_ID`,
`ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`. Then `docker compose up -d`.

What changes once those are set:

- The sign-in page shows the Microsoft sign-in button.
- **Self sign-up closes automatically**: the "Sign up" links disappear
  and the API refuses new password accounts. That is what you want;
  otherwise anyone who can reach the page could create an account
  (`SELF_SIGNUP_ENABLED=true` reopens it — don't).
- Staff accounts are created at their first sign-in, with the role the
  directory gives them (`USER` if none).

**Check:**
```bash
curl -s http://127.0.0.1:3000/api/auth/providers
```
shows `"entra":{"enabled":true,...}` and `"signupEnabled":false`.
Finish with guide.md step 9 (a real sign-in).

---

## 8. Break-glass accounts

Do this before announcing the app. Follow [guide.md step 8](guide.md#step-8--set-up-the-break-glass-accounts);
in short, create at least two password accounts whose email addresses
do not exist in your directory:

```bash
docker compose exec backend node scripts/admin.js create-local-user \
  --username bg.ehs.officer.7k2 --email ehs.breakglass1@ehs.invalid \
  --full-name "EHS Break-glass Officer" --role EHS_OFFICER --plant GGM

docker compose exec backend node scripts/admin.js create-local-user \
  --username bg.ehs.admin.4q9 --email ehs.breakglass2@ehs.invalid \
  --full-name "EHS Break-glass Admin" --role ADMIN --plant GGM
```

Each prints its password **once**. Put both in the password safe now,
then sign in with each to prove they work. These accounts bypass MFA,
Conditional Access and Intune checks — that is their purpose — so keep
them few and their passwords locked away.

`scripts/admin.js help` lists every administration command; the full
list is in §13.7.

---

## 9. People and plants

Two facts drive this chapter:

1. **Everyone belongs to a plant** (`plant_id`). An EHS Officer cannot
   plan audits, upload the roster, or download the inspection report
   without one, and only people at the officer's plant appear in the
   auditor and auditee choices.
2. **The weekly roster names people by email**, and only matches
   accounts that already exist and belong to the officer's plant.
   Accounts created at first sign-in have no plant.

So before the first roster upload, import every EHS Officer, auditor and
auditee with their plant.

### 9.1 Import

Make a CSV — `people.csv`:
```csv
Email,Name,Plant
asha.verma@contoso.com,Asha Verma,GGM
rahul.singh@contoso.com,Rahul Singh,GGM
priya.nair@contoso.com,Priya Nair,PUN
```
- **Email** must be exactly the address Entra will present for that
  person: their mailbox address, or their sign-in name (UPN) if they
  have no mailbox. If in doubt, it is the "User principal name" /
  "Mail" shown on their user page in the Entra admin center.
- **Plant** is the plant code (or name) from chapter 6.

Try it, then do it:
```bash
docker compose exec -T backend node scripts/admin.js import-users --file - --dry-run < people.csv
docker compose exec -T backend node scripts/admin.js import-users --file - < people.csv
```
It imports all rows or none, and lists every problem line if any. New
accounts get no password and no role; each is linked to the person's
Microsoft account by email at their first sign-in, and gets its role
from Entra then. People already in the app just get their plant set.
Re-run it whenever staff change plant or join.

**Check:**
```bash
docker compose exec backend node scripts/admin.js list-users
```
Nobody who will be rostered should have an empty `plant` column.

### 9.2 The EHS Officer's first steps

The EHS Officer then signs in, opens **Plan**, downloads the roster
template (it is pre-filled with that plant's locations), fills in the
auditor and auditee email for each zone, and uploads it. The upload
schedules every zone for every Monday until 31 December. **It has to be
uploaded again each January** for the new year.

---

## 10. Photographs in SharePoint

Every photograph is compressed on the server first (long edge 2048 px,
JPEG quality 80, location metadata removed), so what reaches SharePoint
is typically 250–600 KB per photo. Staff never open SharePoint: the app
fetches the pictures itself and shows them only to people entitled to
see that inspection.

Until this chapter is done, photographs are stored on the server's
`ehs-inspection_ehs_uploads` volume, which works but must be backed up
(§13.2).

### 10.1 Create the site and library (SharePoint administrator)

1. Create a site for the app, e.g. a team site **EHS Inspection** at
   `https://contoso.sharepoint.com/sites/EHSInspection`. Limit its
   membership to the EHS team and administrators; staff do not need
   access.
2. Use its default **Documents** library, or create a dedicated one
   (e.g. **Inspection photographs**). In the library's settings:
   - **Require check out: No.** Uploaded files would otherwise stay
     checked out and invisible.
   - **No required columns.** A required metadata column leaves uploads
     checked out in the same way.
   - Versioning may stay on; the app never overwrites a file.
3. Retention (optional, your compliance team's call): a retention
   policy or label on this library keeps deleted evidence in the
   Preservation Hold library. The app's own deletes then still succeed.
   A **record** label, or a setting that forbids deleting labelled
   content, makes the app's deletes fail; the app logs it and carries
   on, and the file simply stays in SharePoint.

The app creates its own folder, `EHS Inspection`, with `Observations`
and `Closure evidence` below it, split by year and month.

### 10.2 Give the app access to that one site (Entra + SharePoint administrators)

The app authenticates as itself (no user involved), so it needs an
**application** permission. `Sites.Selected` grants nothing on its own;
access is then given to exactly one site.

1. In the Entra admin center, open the **EHS Inspection** app
   registration from chapter 7 (or a separate registration, see 10.3).
   **API permissions → Add a permission → Microsoft Graph → Application
   permissions → `Sites.Selected` → Add permissions**, then **Grant
   admin consent**.
2. Grant the app **write** access to the site. Either:

   **With Graph Explorer** (<https://aka.ms/ge>), signed in as a
   SharePoint Administrator who can consent to `Sites.FullControl.All`
   for Graph Explorer:
   - `GET https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com:/sites/EHSInspection?$select=id`
     — note the `id` (`contoso.sharepoint.com,<guid>,<guid>`).
   - `POST https://graph.microsoft.com/v1.0/sites/<id>/permissions` with
     body:
     ```json
     {
       "roles": ["write"],
       "grantedToIdentities": [
         { "application": { "id": "<Application (client) ID>", "displayName": "EHS Inspection" } }
       ]
     }
     ```
   - `GET https://graph.microsoft.com/v1.0/sites/<id>/permissions`
     should now list the app with `write`.

   **Or with PnP PowerShell** (needs its own app registration for PnP,
   per PnP's documentation):
   ```powershell
   Grant-PnPEntraIDAppSitePermission -AppId <Application (client) ID> `
     -DisplayName "EHS Inspection" -Permissions Write `
     -Site https://contoso.sharepoint.com/sites/EHSInspection
   ```

Access to every other site in the tenant stays at nothing.

### 10.3 Configure the app (server administrator)

Add to `.env`:
```dotenv
PHOTO_STORAGE=sharepoint
SHAREPOINT_SITE_URL=https://contoso.sharepoint.com/sites/EHSInspection
SHAREPOINT_SITE_ID=<the id from 10.2, optional but recommended>
SHAREPOINT_LIBRARY=Documents
SHAREPOINT_FOLDER=EHS Inspection
```
- `SHAREPOINT_LIBRARY` is the library's name as SharePoint shows it.
- `SHAREPOINT_SITE_ID` lets the app skip looking the site up by address.
- By default the app uses the Entra sign-in registration's credentials
  (`ENTRA_*`). To use a separate registration for storage instead, set
  `SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID` and
  `SHAREPOINT_CLIENT_SECRET`, and give *that* registration the
  permission in 10.2. Either way, its client secret's expiry is also the
  day photograph uploads stop, so diary it (§13.4).

Apply and check:
```bash
docker compose up -d
docker compose exec backend node scripts/sharepoint.js check
```
`check` finds the library, creates the app's folder, uploads a small
test file, reads it back, and deletes it. Every line should start with
`OK`. If it fails it says why, e.g. a 403 means the grant in 10.2 is
missing, a 404 that the site address or library name is wrong.

### 10.4 Move photographs already on the server

If the app was used before SharePoint was configured, move those
photographs across:
```bash
docker compose exec backend node scripts/sharepoint.js migrate --dry-run
docker compose exec backend node scripts/sharepoint.js migrate
```
Each photograph is uploaded, its database rows are repointed, and only
then is the local copy deleted, so an interruption loses nothing and
running it again picks up where it stopped. Photographs not moved keep
working from the server, and photographs in SharePoint keep working if
you ever set `PHOTO_STORAGE=local` again.

### 10.5 When SharePoint is unavailable

Submitting a report or evidence fails with *"The photographs could not
be saved to document storage. Nothing was submitted; try again in a few
minutes."* — nothing half-saved is left behind. Viewing a photograph
shows a similar message. Throttling by SharePoint is retried
automatically.

---

## 11. Intune

A web application is not "registered" in Intune — that is the Entra
app registration from chapter 7. Intune's part is to **put the app in
front of staff** and to **enforce the conditions** for reaching it,
through a Conditional Access policy on the Entra enterprise app.

Conditional Access only acts on Microsoft sign-ins. The break-glass
password accounts (chapter 8) are not subject to it.

### 11.1 Staff phones (personal, not enrolled)

The app runs in **Microsoft Edge**, protected by an app protection
policy. Nothing is installed on the phone except Edge and the broker app
Microsoft requires: **Microsoft Authenticator** on iOS, **Intune Company
Portal** on Android (installed, not necessarily signed in to for
enrolment).

**1. App protection policy for Edge.** Intune admin center → **Apps →
Protection → Create policy** → iOS/iPadOS, then again for Android →
target **Microsoft Edge** → assign to the staff group. Use your
organisation's usual data-protection baseline, with these settings that
decide whether an auditor can attach a photograph:

| Setting | Must be |
|---|---|
| Receive data from other apps | **All apps**, or if **Policy managed apps**: |
| … Allow users to open data from selected services | **Camera** and **Photo Library** both selected |
| Edge `FileUploadBlockedForUrls` (app configuration) | Must not block the app's address |

**2. App configuration for Edge** (so the app is one tap away). **Apps →
Configuration → Create → Managed apps** → Microsoft Edge (iOS and
Android) → assign to the staff group:

| Key | Value |
|---|---|
| `com.microsoft.intune.mam.managedbrowser.bookmarks` | `EHS Inspection|https://ehs.contoso.com` |
| `com.microsoft.intune.mam.managedbrowser.homepage` | `https://ehs.contoso.com` |

Keys are case-sensitive; staff see a managed bookmark and the homepage
shortcut in Edge once signed in to Edge with their work account.

**3. Conditional Access.** Entra admin center → **Entra ID → Conditional
Access → Policies → New policy**:
- **Users:** the staff group; **exclude** your Entra emergency-access
  accounts.
- **Target resources:** the **EHS Inspection** enterprise app.
- **Conditions → Device platforms:** iOS, Android. **Client apps:**
  Browser.
- **Grant:** **Require app protection policy**, and require multifactor
  authentication if that is your standard. ("Require approved client
  app" is retired; do not use it.)
- Start in **Report-only**, then switch **On** after the pilot.

**4. Pilot before switching it on.** On one iPhone and one Android phone:
sign in to Edge with a work account, open the bookmark, sign in with
Microsoft, file a test observation **taking a photo with the camera**
and **choosing one from the gallery**, and view it back. Check the
Conditional Access sign-in log shows the policy as satisfied. If the
photo picker is blocked, revisit the table in step 1.

### 11.2 Company Windows PCs (enrolled)

1. **A compliance policy** for Windows 10 and later (Intune admin center
   → **Devices → Compliance → Create policy**) with your usual baseline.
   In **Endpoint security → Device compliance → Compliance policy
   settings**, set *Mark devices with no compliance policy assigned as*
   **Not compliant**.
2. **Shared shop-floor PCs:** assign the compliance policy to a **device
   group**, not a user group, and have staff sign in to Edge with their
   work account. InPrivate windows count as non-compliant.
3. **The shortcut** — either or both:
   - **Apps → All apps → Create → Windows web link**, URL
     `https://ehs.contoso.com`, assigned as Required to the PC group; or
   - a **Settings catalog** profile (Windows 10 and later) → Microsoft
     Edge → **Configure favorites** (`ManagedFavorites`), value:
     `[{"toplevel_name":"EHS"},{"name":"EHS Inspection","url":"https://ehs.contoso.com"}]`
4. **Conditional Access:** a second policy for the EHS Inspection
   enterprise app, **Device platforms: Windows**, **Grant: Require
   device to be marked as compliant**. Report-only first, as above.

### 11.3 Company certificate on company PCs

If you did use an internal CA for the server certificate, Intune can
deploy its root to **enrolled** devices (**Devices → Configuration →
Create → Templates → Trusted certificate**). It cannot do this for
personal phones, which is why §1.3 recommends a public certificate.

### 11.4 What staff see

On a phone: open Edge → the **EHS Inspection** bookmark → **Login with
Entra SSO** → (usually no prompt, already signed in) → the dashboard.
On a PC: the Start menu or Edge favourite → the same.

### 11.5 Off-site access (optional)

If staff must use the app away from the company network, publish it
with **Microsoft Entra application proxy** (Entra ID P1): install a
private network connector on a Windows server inside the network, add
the app as an **on-premises application** with the **same external URL
as `FRONTEND_ORIGIN`** (custom domain, split-brain DNS), and keep the
redirect URI in chapter 7 unchanged. Be aware:

- The proxy is an extra network hop. The app's sign-in rate limits then
  count everyone coming through the proxy as one address (20 password
  attempts and 600 SSO sign-ins per 15 minutes), which matters at shift
  change. Plan this with whoever maintains the app before enabling it.
- Uploads over a slow mobile link must complete within the proxy's
  backend timeout (85 s, or 180 s with "Long").
- With Entra pre-authentication people sign in at the proxy and again in
  the app; the second is normally silent.

VPN is the simpler alternative if you already run one for phones.

---

## 12. Go-live checklist

- [ ] `https://<address>` shows a valid padlock on a PC, an iPhone and an Android phone
- [ ] Nothing answers on `http://<address>`
- [ ] `/api/auth/providers` shows Entra enabled and sign-up closed
- [ ] A real user signs in with Microsoft; an EHS Officer lands on the officer dashboard
- [ ] Both break-glass accounts sign in; passwords are in the safe
- [ ] Every plant, unit, zone and area is loaded; every zone has areas
- [ ] Every rostered person is imported with a plant (`list-users`)
- [ ] The first roster is uploaded and the dashboard shows this week's audits
- [ ] `scripts/sharepoint.js check` passes; a test observation's photograph appears in the library
- [ ] The Intune pilot (11.1 step 4) passed on both phone platforms; Conditional Access switched from Report-only to On
- [ ] Backups (§13.2) run, and one has been test-restored
- [ ] Client secret and certificate expiry dates are in the team calendar

---

## 13. Operating it

### 13.1 Everyday commands

```bash
docker compose ps                                   # state and health
docker compose logs -f --tail=200 backend           # live log
docker compose logs --since 24h backend | grep '"level":"error"'
curl -s https://ehs.contoso.com/api/health          # for your monitoring
```
Logs rotate automatically (5 × 20 MB per container). `/api/health` shows
the API is up; it does not test the database or SharePoint — the
SharePoint `check` command does the latter.

### 13.2 Backups

What to back up, together:

1. **The database** — everything except the photographs.
2. **The uploads volume** — photographs stored locally (all of them
   with `PHOTO_STORAGE=local`; with SharePoint, any not migrated).
3. **`.env` and `certs/`** — keep these in the password safe / secret
   store, not with the data backups.
4. **SharePoint** — covered by Microsoft 365's own protection; use your
   organisation's SharePoint backup or retention policy for the site.

Nightly, from the application directory:
```bash
STAMP=$(date +%Y%m%d-%H%M%S); mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/ehs-db-$STAMP.dump"
docker run --rm -v ehs-inspection_ehs_uploads:/data:ro -v "$PWD/backups":/backup alpine \
  tar cf "/backup/ehs-uploads-$STAMP.tar" -C /data .
```
Take the database **first**, then the files: a photograph is always
saved before the row that refers to it, so this order never captures a
row without its file. Copy `backups/` off the server.

**Never run `docker compose down -v`** — `-v` deletes both volumes.

### 13.3 Restore

```bash
docker compose stop frontend backend

docker run --rm -v ehs-inspection_ehs_uploads:/data -v "$PWD/backups":/backup alpine \
  sh -c 'rm -rf /data/* && tar xf /backup/ehs-uploads-STAMP.tar -C /data && chown -R 1000:1000 /data'

docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < backups/ehs-db-STAMP.dump

docker compose up -d
```
(`1000` is the backend's `node` user; confirm with
`docker compose exec backend id -u node`.) Then open an observation and
check its photograph shows.

### 13.4 Calendar

| When | What |
|---|---|
| Before the Entra client secret expires (≤ 24 months) | New secret in the app registration → update `ENTRA_CLIENT_SECRET` (and `SHAREPOINT_CLIENT_SECRET` if separate) → `docker compose up -d` → delete the old secret. |
| Before the TLS certificate expires | Replace `certs/tls.crt` and `certs/tls.key`, then `docker compose restart frontend`. |
| Each January | The EHS Officer uploads the new year's roster. |
| Quarterly | Review role groups in Entra; sign in with each break-glass account; test-restore a backup. |

### 13.5 Disk

Photographs dominate; the database stays small (tens of MB a year).
Per week: *zones × share of audits with findings × observations per
report × (1 + evidence photos per observation) × ~0.4 MB*. For 60 zones,
with findings in 80 % of audits, 3 observations each and 1 evidence
photo per observation: about **115 MB a week, 6 GB a year**. With
SharePoint storage that lands in SharePoint, not on the server.

### 13.6 Upgrades

```bash
git rev-parse HEAD > backups/pre-upgrade-commit.txt
# take a backup (13.2) first
git pull --ff-only
docker compose build
docker compose up -d
docker compose logs -f backend      # watch the migrations and "EHS API started."
```
Database changes are applied automatically and are forward-only. To roll
back: check out the previous commit, `docker compose build`, restore the
pre-upgrade backup (13.3), `docker compose up -d`.

### 13.7 People administration

All with `docker compose exec backend node scripts/admin.js …`:

| Task | Command |
|---|---|
| List everyone, their plant and roles | `list-users` (add `--role EHS_OFFICER` to filter) |
| List plant codes | `list-plants` |
| Import or re-plant many people | `import-users --file - < people.csv` (use `exec -T`) |
| Set one person's plant | `set-plant --user <email> --plant GGM` |
| **Leaver: cut off immediately** | `deactivate-user --user <email>` — takes effect on their next click. Disabling them in Entra alone stops new sign-ins but leaves a current session running for up to 8 hours. |
| Undo that | `activate-user --user <email>` |
| EHS Officer handover | `reassign-officer --from <old> --to <new>` — moves their open patrols so the new officer can approve those closures |
| New break-glass account | `create-local-user …` (chapter 8) |
| Break-glass password reset / unlock | `reset-password --user <username>` |
| Role for a password-only account | `grant-role` / `revoke-role --user … --role …` (SSO users get roles from Entra only) |

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser: connection refused | `frontend` not running, or firewall | `docker compose ps`; `docker compose logs frontend`; open 443 |
| Browser: certificate warning (phones only) | Internal CA certificate | Use a publicly trusted certificate (§1.3) |
| `frontend` restarting | `certs/tls.crt` or `tls.key` missing, misnamed, or mismatched | §3 |
| `backend` restarting | A required `.env` value missing, or a setting mis-typed — the log says which | `docker compose logs backend`, fix `.env`, `docker compose up -d` |
| No Microsoft sign-in button | Entra values not applied | §7 check; remember `up -d`, not `restart` |
| Sign-in errors `AADSTS…` | See the table in [guide.md](guide.md#when-something-goes-wrong) | |
| Officer: "No location is assigned to your account" | Their account has no plant | `admin.js set-plant` |
| Roster upload: "No active user at … has the email …" | That person is not imported, has another plant, or Entra presents a different email | §9.1; compare with `list-users` |
| Roster upload: "The selected zone has no areas configured" | A zone without areas | §6 |
| Submitting photos: "could not be saved to document storage" | SharePoint unreachable, secret expired, or grant missing | `scripts/sharepoint.js check`; `docker compose logs backend \| grep -i sharepoint` |
| Phone: cannot attach a photo in Edge | App protection policy blocks Camera / Photo Library | §11.1 step 1 |
| Phone: "access blocked" after Microsoft sign-in | Conditional Access requirement not met (Edge not signed in, no broker app) | Sign-in log in Entra → Conditional Access tab |
| Locked-out break-glass account | Five wrong passwords → 15-minute lock | Wait, or `admin.js reset-password` |

Something not covered here: `docker compose logs backend` first — every
failure the app handles is logged as one JSON line with a `code`.
