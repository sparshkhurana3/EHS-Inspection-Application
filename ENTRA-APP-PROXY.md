# Phone access through Microsoft Entra application proxy

This guide sets up the EHS Inspection app so staff can use it on their phones, from anywhere, at:

```
https://sonaehsdriveline-sonagroup.msappproxy.net/
```

Microsoft sign-in ("Login with Entra SSO") works on that address, and PCs on the company network keep using the app at its usual internal address.

The guide is for two people:

- the **Entra administrator** (Microsoft Entra admin center), who does steps 1 and 2;
- whoever runs the **EHS application server**, who does steps 3 and 4.

It assumes Microsoft sign-in already works on the internal address, set up with [guide.md](guide.md). The full deployment guide is [SETUP-GUIDE.md](SETUP-GUIDE.md).

---

## How it works

The app can be reached at more than one address. Whatever address someone starts signing in on, Microsoft sends them back to that same address:

```
Phone ──► https://sonaehsdriveline-sonagroup.msappproxy.net ──► proxy connector ──► EHS server
            │                                                                         ▲
            └─► login.microsoftonline.com ──► …msappproxy.net/api/auth/entra/callback ─┘

PC on the company network ──► https://<internal address> ──► EHS server   (unchanged)
```

Each address must be:

1. **listed in the server's `.env`**: the internal one in `FRONTEND_ORIGIN`, every other one in `FRONTEND_ADDITIONAL_ORIGINS`;
2. **registered as a redirect URI** on the EHS app registration, as `<address>/api/auth/entra/callback`.

If either is missing for an address, Microsoft sign-in fails on that address. The table under [If sign-in fails](#if-sign-in-fails) shows the symptoms.

---

## Before you start

| You need | Example | Who has it |
|---|---|---|
| The internal address of the EHS server, as the connector reaches it | `https://ehs.sonacomstar.local` | The server's `.env`: `FRONTEND_ORIGIN` |
| The external (proxy) address | `https://sonaehsdriveline-sonagroup.msappproxy.net/` | Entra admin, step 1 |
| The EHS **app registration** used for sign-in | its Application (client) ID is `ENTRA_CLIENT_ID` in `.env` | Entra admin |
| A private network connector installed on a Windows server that can reach the internal address | – | Entra admin |
| Licence | Microsoft Entra ID P1 or P2 | – |

> The proxy's **enterprise application** (created in step 1) and the EHS **app registration** (used for sign-in, set up with guide.md) are two different objects. Step 2 changes the EHS app registration.

---

## Step 1 — Publish the app through application proxy (Entra admin)

Skip this step if the proxy app already exists at the address above. Still check the settings in the table.

1. In the **Microsoft Entra admin center**, open **Enterprise applications → New application → Add an on-premises application**. In newer tenants this is under **Global Secure Access → Applications → Enterprise applications**.
2. Use these settings:

| Setting | Value | Why |
|---|---|---|
| Internal URL | `https://<internal address>/` (the root, with the trailing slash) | The connector calls the EHS server here. |
| External URL | `https://sonaehsdriveline-sonagroup.msappproxy.net/` (the **root**, no path such as `/ehs/`) | The app's pages load files from `/assets` and call `/api` at the root. A sub-path breaks the app. |
| Pre-authentication | **Microsoft Entra ID** (recommended) or **Passthrough** | Both work. With Microsoft Entra ID, people pass a Microsoft prompt at the proxy and the app's own sign-in is then normally silent. |
| Connector group | the group whose connector can reach the internal URL | |
| Backend application timeout | **Long** | Ten observation photographs over a slow mobile link can take longer than the default 85 seconds. |
| Translate URLs in headers | default (**Yes**) | The app no longer puts the internal address anywhere a phone follows. Either value works. |
| Translate URLs in application body | **No** | Not needed. The app uses relative links. |
| Validate backend TLS/SSL certificate | **Yes** if the connector server trusts the EHS server's certificate, otherwise **No** | A certificate from the company CA must be trusted on the connector server. A self-signed one needs **No**. |

3. **Users and groups:** assign the same people or groups that are assigned to the EHS app registration (guide.md step 6). With Microsoft Entra ID pre-authentication, anyone not assigned here is stopped at the proxy.

**Check:** open `https://sonaehsdriveline-sonagroup.msappproxy.net/` on a phone that is **not** on the company Wi-Fi. The EHS home page should load. Sign-in will not work until steps 2 and 3 are done.

---

## Step 2 — Register the proxy address as a redirect URI (Entra admin)

1. Open **App registrations →** the EHS app (the one whose Application (client) ID is `ENTRA_CLIENT_ID`) **→ Authentication → Web → Redirect URIs**.
2. **Add** this URI. **Keep** the existing internal one:

```
https://sonaehsdriveline-sonagroup.msappproxy.net/api/auth/entra/callback
```

3. Click **Save**.

The result should look like:

```
https://<internal address>/api/auth/entra/callback
https://sonaehsdriveline-sonagroup.msappproxy.net/api/auth/entra/callback
```

Entra compares these **character by character**: `https`, no port, no trailing slash, and `/api/auth/entra/callback` exactly. Nothing else in the app registration changes.

---

## Step 3 — Tell the server about the proxy address (server administrator)

On the EHS server, in the `.env` file next to `compose.yaml`, keep `FRONTEND_ORIGIN` as the internal address and add:

```dotenv
FRONTEND_ADDITIONAL_ORIGINS=https://sonaehsdriveline-sonagroup.msappproxy.net
```

Rules:

- `https://`, the host name, nothing after it. No trailing slash, and no path.
- Several addresses are separated by commas.
- Do **not** set `ENTRA_REDIRECT_URI` for this. That setting only ever applies to `FRONTEND_ORIGIN`.

Apply it. `.env` is read when the container is created, so `docker compose restart` is **not** enough:

```bash
docker compose up -d
```

If an address is mistyped, the backend refuses to start and says which entry is wrong:

```bash
docker compose logs backend --tail 20
```

---

## Step 4 — Test (server administrator)

1. **The server accepts the proxy address.** On the server:

   ```bash
   curl -sI "http://127.0.0.1:3000/api/auth/entra/start?origin=https%3A%2F%2Fsonaehsdriveline-sonagroup.msappproxy.net" \
     | grep -i '^location' | grep -o 'redirect_uri=[^&]*'
   ```

   It must print `redirect_uri=https%3A%2F%2Fsonaehsdriveline-sonagroup.msappproxy.net%2Fapi%2Fauth%2Fentra%2Fcallback`.
   If it prints the internal address instead, step 3 has not been applied. Check `.env` and run `docker compose up -d`.

2. **A phone, off the company network:** open `https://sonaehsdriveline-sonagroup.msappproxy.net/`, tap **Login with Entra SSO**, and sign in. You should land on the dashboard **at the msappproxy.net address**.

3. **A PC on the company network:** sign in at the internal address as before. You should stay on the internal address.

4. **The failsafe:** a break-glass account signs in with username and password on both addresses.

5. Add a bookmark or Edge favourite for the proxy address on staff phones (SETUP-GUIDE.md §11.1).

---

## If sign-in fails

The app writes the reason to its log: `docker compose logs backend | grep -i entra`.

| What you see | Cause | Fix |
|---|---|---|
| Microsoft shows **AADSTS50011** (redirect URI mismatch), and the URI it names ends in `msappproxy.net/api/auth/entra/callback` | The proxy address is not registered on the EHS app registration. | Step 2. Check it character by character. |
| After signing in, the phone tries to open the **internal** address and fails | The server does not know the proxy address, so it fell back to `FRONTEND_ORIGIN`. The log shows `Entra sign-in started from an origin that is not configured` with the address it was given. | Step 3: add exactly that address to `FRONTEND_ADDITIONAL_ORIGINS`, then `docker compose up -d`. |
| The backend does not start after the change, and the log says `FRONTEND_ADDITIONAL_ORIGINS entry "…" must be an https:// address with no path` | Typo, `http://`, a trailing path, or quotes. | Fix the value in `.env`. |
| The proxy address shows a Microsoft error page before the EHS page loads | Proxy app settings, connector or assignment (step 1), not the EHS app. | Check the connector status and **Users and groups** on the proxy enterprise app. |
| The EHS page loads, but images or pages are missing or the screen is blank | The external URL has a path such as `…/ehs/`. | Publish at the root (step 1). |
| Uploading observation photographs fails on the phone | The upload took longer than the proxy's backend timeout. | Set **Backend application timeout** to **Long** (step 1). |
| **AADSTS50105** (user not assigned) | The person is not assigned to the EHS app registration. | guide.md step 6. |

---

## Good to know

- **Sign-in rate limits.** Everyone who comes through the proxy can look like one address to the server, so the app's sign-in limits (600 Microsoft sign-ins and 20 password attempts per 15 minutes) may be shared by all phone users. If people see "too many attempts" at shift change, tell whoever maintains the app (backlog item in `docs/09-feature-refinement-backlog.md`).
- **Removing an address:** delete it from `FRONTEND_ADDITIONAL_ORIGINS`, run `docker compose up -d`, then remove its redirect URI from the app registration. Sign-ins already in progress on that address are sent to the internal address instead.
- **A custom domain** on the proxy (for example `https://ehs.sonacomstar.com`) that is the same name inside and outside the network removes the need for a second address. `FRONTEND_ORIGIN` is then that one address, and `FRONTEND_ADDITIONAL_ORIGINS` stays empty (SETUP-GUIDE.md §11.5).
- How it is built: [docs/22-entra-app-proxy-plan.md](docs/22-entra-app-proxy-plan.md).
