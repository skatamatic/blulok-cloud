# BluLok deployment debug — reference

## Config

`deploy.toml` sections:

```toml
[develop]
api_base = "https://.../api/v1"
admin_identifier = "devadmin@blulok.com"
admin_password_env = "BLULOK_DEBUG_ADMIN_PASSWORD"

[develop.database]
host = "127.0.0.1"
port = "3307"
user = "blulok_user"
password_env = "BLULOK_DEBUG_DB_PASSWORD"
name = "blulok_prod"
```

Env vars in `deploy.env` (gitignored). Override environment with `--env production` or `BLULOK_DEBUG_ENV`.

## HTTP API map (dev_admin)

Base: `{api_base}` from TOML.

### Auth & entities

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/login` | `{ identifier, password }` → token |
| `GET /users?search=&facility_id=&role=` | Name, email, phone, facility filter |
| `GET /users/:id` | Profile |
| `GET /users/:id/details` | Facilities, units, devices, access_control |
| `GET /facilities?search=` | Facility search |
| `GET /facilities/:id` | Facility profile |
| `GET /units?search=&facility_id=&lock_status=` | Unit list |
| `GET /devices?facility_id=&device_type=&status=` | BluLoks / access control (`device_type=blulok\|access_control`) |
| `GET /devices/unassigned?facility_id=` | Unassigned BluLoks |
| `GET /gateways` | All gateways (filter client-side) |
| `GET /gateways/:id` | Gateway detail |
| `GET /fms/config` | All FMS configs (secrets redacted in skill output) |
| `GET /fms/config/:facilityId` | Facility FMS config |
| `GET /fms/sync/:facilityId/history` | FMS sync log |
| `GET /fms/webhooks/:facilityId/events` | Recent webhook events |
| `GET /key-sharing?unit_id=` | Active key shares (`shared_key:` aud source) |

### Route passes

| Endpoint | Purpose |
|----------|---------|
| `POST /admin/dev-tools/issue-route-pass` | **Non-production** `dev_admin` issue-for-user (`{ userId, appDeviceId?, facilityId? }`) → `{ routePass }` |
| `POST /passes/request` | Issue for the **authenticated** caller (skill fallback with `--password`) |
| `GET /route-passes/users/:id` | Issuance log (`audiences`, `jti`) — metadata only, not the JWT |
| `GET /units/:id` | Lock serial, shared_tenants |
| `GET /devices/blulok/:id` | Lock `created_at` |

### Audience formats (`aud`)

| Prefix | Format | When |
|--------|--------|------|
| `lock:` | `lock:{device_serial}` | Direct `unit_assignments` (primary or co-tenant) |
| `shared_key:` | `shared_key:{primaryTenantUserId}:{device_serial}` | Active `key_sharing` row (not co-tenant assignment) |
| `access_control:` | `access_control:{device_uuid}` | App-entry doors from device groups |

User id is JWT **`sub`**, not a `user:` aud entry. Privileged roles get **`aud: []`** on purpose; devices use `user_role`. Source: `backend/src/services/passes/audience-resolver.service.ts`.

**Co-tenant vs key share:** `unit_assignments.is_primary = false` → `lock:{serial}`. The `key_sharing` table → `shared_key:{owner}:{serial}`. Unit UI `shared_tenants` may list co-tenants from assignments, not key shares — empty key-sharing + a visible co-tenant is normal.

**Issuance log retention:** `route_pass_issuance_log` is pruned about **7 days after expiry**. Older `jti`s can be missing even if a captured JWT is still valid. Cloud never stores the compact JWT.

`fetch-pass` defaults to the latest **unexpired** log row. `--jwt` decodes a captured token; `--issue` mints a new one (non-production admin endpoint, or `--password` / same-session `/passes/request`).

### Access sessions & events

| Endpoint | Purpose |
|----------|---------|
| `GET /access-sessions` | Session list (`user_id`, `facility_id`, `state=pending`, etc.) |
| `GET /access-sessions/:id` | Session + linked event timeline |
| `GET /access-history?view=raw` | Raw activity log rows |

Pending remote unlock: poll `GET /access-sessions/:id`; cross-check gateway session trace.

### Gateway comms

| Endpoint | Purpose |
|----------|---------|
| `GET /gateways/status/:facilityId` | Inbound WebSocket connection status |
| `GET /gateways/:id/session-trace` | Correlator + debug snapshot (`user_id`, `device_id`, `unit_id` filters) |
| `GET /gateways/:id/telemetry-logs` | Operational log stream (`search`, `source`, time range) |
| `GET /gateways/:id/device-sync-logs` | Inventory sync audit (admin/dev_admin) |
| `POST /admin/dev-tools/gateway-ping` | Force PING (`{ facilityId }`) — disabled in production |

## SQL runner

```bash
node scripts/run-sql.mjs "SELECT ..."
node scripts/run-sql.mjs --file query.sql
```

| Flag | Effect |
|------|--------|
| (default) | Read-only: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH |
| `--write` | Allows INSERT/UPDATE/DELETE |
| `--unsafe` | Allows DDL (CREATE/ALTER/DROP) |

Requires `BLULOK_DEBUG_DB_PASSWORD` and Cloud SQL proxy on configured port.

### Cloud SQL proxy (develop)

| Item | Value |
|------|--------|
| Project | `blulok-cloud-dev` |
| Instance | `blulok-cloud-dev:us-west1:blulok-mysql-develop` |
| Local port | `3307` (default in deploy.example.toml) |

```bash
gcloud config set project blulok-cloud-dev
gcloud run services describe blulok-cloud-backend-dev --region=us-west1 --format="value(status.url)"
cloud-sql-proxy blulok-cloud-dev:us-west1:blulok-mysql-develop --port 3307
```

Alternative: `backend/scripts/diagnose-route-pass-audience.js <userId>` for audience SQL mirror.

## Investigation patterns

### Stuck pending unlock

1. `incident --session <id> --report` (or `incident --user "email"`)
2. `gateway --facility <id> --trace --telemetry --ws-status --report`
3. Multi-gateway facilities: pass `--gateway <id>` after checking the facility gateway table

### Empty route pass aud (tenant)

1. `incident --user "email"` auto-pulls issuance history + expected aud
2. `route-pass --jwt ... --report --out route-pass.md`
3. Check pass `iat` vs lock `created_at` and co-tenant `access_granted_at`

### Telemetry headers

| Header | Meaning |
|--------|---------|
| `CLD01`–`CLD04` | Cloud system: connect / disconnect / status / inventory sync |
| `02xx` | Lock command (`00` rx, `01` tx) |
| `03xx` | Device poll / heartbeat |
| `10xx` | Lock state (`02` = follow-up payload) |
| `12xx` | Firmware version |

### Entity resolution

1. `lookup --user "name or email"`
2. `list --facility "621 Sandbox"` or `list --type users --facility <uuid> --role tenant`
3. `facility --facility <name|uuid> --report` for a site snapshot (people, units, locks, FMS, WS)
4. `lookup --id <uuid> --type user --details` for full entitlements

## GCP (develop)

| Item | Value |
|------|--------|
| Cloud Run | `blulok-cloud-backend-dev` |
| Region | `us-west1` |

API investigation works with dev_admin only; GCP logging/SQL may need IAM.

## Product gaps (known)

- Cloud returns **200 + signed JWT** when tenant `aud` resolves to `[]` (should be 409).
- Multi-instance: in-memory WS fanout may miss events until reconnect — poll REST for pending sessions.

## Related docs

- [cursorDocs/access-sessions.md](../../cursorDocs/access-sessions.md)
- [cursorDocs/access-notifications-activity-apis.md](../../cursorDocs/access-notifications-activity-apis.md)
- [cursorDocs/route-pass-jwt.md](../../cursorDocs/route-pass-jwt.md)
- [cursorDocs/security-design.md](../../cursorDocs/security-design.md)
- [cursorDocs/fms-webhooks.md](../../cursorDocs/fms-webhooks.md)
- [cursorDocs/deployment.md](../../cursorDocs/deployment.md)
