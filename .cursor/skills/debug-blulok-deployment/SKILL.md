---
name: debug-blulok-deployment
description: >-
  Debug BluLok Cloud deployments (develop/prod): list users/units/devices/FMS/gateways
  filtered by facility, facility snapshots, fetch/decode route pass JWTs, access
  sessions/events, entity lookup, and SQL via Cloud SQL proxy. Configured via deploy.toml
  + deploy.env with dev_admin auth. Use for production support, incident investigation,
  entitlement gaps, stuck pending unlocks, gateway disconnects, or ad-hoc queries.
---

# Debug BluLok deployment

Unified toolkit for **HTTP API investigation** and **SQL** against configured BluLok environments. One config file drives all scripts.

## One-time setup

From repo root:

```bash
cp .cursor/skills/debug-blulok-deployment/deploy.example.toml .cursor/skills/debug-blulok-deployment/deploy.toml
cp .cursor/skills/debug-blulok-deployment/deploy.env.example .cursor/skills/debug-blulok-deployment/deploy.env
```

Edit `deploy.env`:

- `BLULOK_DEBUG_ADMIN_PASSWORD` — dev_admin password for the target API
- `BLULOK_DEBUG_DB_PASSWORD` — Cloud SQL password (only needed for `sql` command)

Both copied files are **gitignored**.

For SQL, start Cloud SQL proxy (see [reference.md](reference.md)):

```bash
cloud-sql-proxy blulok-cloud-dev:us-west1:blulok-mysql-develop --port 3307
```

## Unified CLI

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs <command> [flags]
```

| Command | Purpose |
|---------|---------|
| `lookup` | Users, facilities, units, gateways by search string or id |
| `list` | Inventory lists (users/units/locks/AC/gateways/FMS/shares) with `--facility` |
| `facility` | One-shot facility snapshot + findings |
| `access` | Access sessions, pending unlocks, raw access events |
| `gateway` | WS status, telemetry logs, session trace, dev ping |
| `incident` | Deep dive: session + gateway trace + telemetry + findings |
| `route-pass` | Route pass JWT + entitlement investigation (existing token or issuance log) |
| `fetch-pass` | Latest live issuance (log metadata). `--issue` mints; `--jwt` decodes a captured token |
| `decode-jwt` | Offline JWT decode (no network) |
| `sql` | Read-only SQL by default; `--write` / `--unsafe` for mutations |

## Quick examples

**Facility inventory (users, units, locks, FMS, gateways):**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs list --facility "621 Sandbox"
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs facility --facility "621 Sandbox" --report
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs list --type users --facility <uuid> --role tenant
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs list --type shares --unit <unit-uuid>
```

**Find a tenant by email:**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs lookup --user "realize.test@mailinator.com"
```

**Stuck pending unlock / timeout:**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs incident --session <uuid> --report
# or start from user email:
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs incident --user "tenant@example.com" --report
```

**Tenant entitlement check:**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs lookup --user "email@example.com" --details --report
```

**Gateway disconnected:**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs gateway --facility <uuid> --ws-status --ping
```

**Inspect a user's current route pass (does not mint):**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs fetch-pass --user "realize.test@mailinator.com" --report
```

Cloud stores issuance metadata (`jti`, `aud`, timestamps, device) — **not** the compact JWT. Add `--jwt '<token>'` to decode a captured token, or `--issue` to mint a new one (`POST /admin/dev-tools/issue-route-pass` in non-production; `--password` falls back to the user's `POST /passes/request`).

**Route pass empty aud (existing JWT):**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs route-pass --jwt "<token>" --report --out route-pass.md
```

**Ad-hoc SQL:**

```bash
node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs sql "SELECT id, email, role FROM users WHERE email LIKE '%test%' LIMIT 10"
```

## Agent workflow

When investigating a deployment issue:

1. **Identify the environment** — default is `develop` from `deploy.toml`; pass `--env` if needed.
2. **Resolve entities first** — `lookup --user`, `list --facility`, or `facility --facility`.
3. **Pick the right tool:**
   - Who/what is at a site → `list` and `facility`
   - Route pass / unlock auth → `fetch-pass` (issuance log), `route-pass`, or `decode-jwt`
   - Session stuck / denied / missing events → `access` + `gateway --trace`
   - Gateway offline / sync failures → `gateway --ws-status --telemetry --sync-logs`
   - FMS move-in / webhook gaps → `facility --facility` then `list --type fms`
   - Data not exposed by API → `sql` (read-only)
4. **Deliver a short report** — use `--report` where available; cite findings and next steps.
5. **Cross-check API vs DB** when results disagree (`sql` mirrors AudienceResolver, session tables, etc.).

### Route pass empty `aud`

| `user_role` | Empty `aud` |
|-------------|-------------|
| `admin`, `dev_admin`, `facility_admin` | **Expected** |
| `tenant`, `maintenance` | **Problem** — check assignment, lock on unit, pass issue time vs lock/share time |

See [reference.md](reference.md) for API map and aud formats.

## Config

| File | Purpose |
|------|---------|
| `deploy.example.toml` | Committed template (develop URL + GCP + DB proxy port) |
| `deploy.toml` | Local overrides (gitignored) |
| `deploy.env.example` | Secret env var template |
| `deploy.env` | Passwords (gitignored) |

## Scripts

| Script | Role |
|--------|------|
| `scripts/blulok-debug.mjs` | Unified CLI router |
| `scripts/lookup-entity.mjs` | Entity search |
| `scripts/list-inventory.mjs` | Filtered inventory lists |
| `scripts/inspect-facility.mjs` | Facility snapshot |
| `scripts/investigate-access.mjs` | Sessions + raw events |
| `scripts/investigate-gateway.mjs` | Gateway comms |
| `scripts/investigate-incident.mjs` | Correlated session + gateway + route-pass report |
| `scripts/investigate-route-pass.mjs` | Route pass investigation |
| `scripts/fetch-route-pass.mjs` | Latest issuance log; optional `--issue` / `--jwt` |
| `scripts/decode-route-pass-jwt.mjs` | Offline JWT decode |
| `scripts/run-sql.mjs` | SQL runner |
| `scripts/lib/*` | Shared config, API client, SQL client |
| `backend/scripts/diagnose-route-pass-audience.js` | SQL mirror of AudienceResolver |

## Additional resources

- [reference.md](reference.md) — full API map, SQL safety, GCP notes
- [report-template.md](report-template.md) — report skeleton
- [cursorDocs/route-pass-jwt.md](../../cursorDocs/route-pass-jwt.md)
- [cursorDocs/access-sessions.md](../../cursorDocs/access-sessions.md)
