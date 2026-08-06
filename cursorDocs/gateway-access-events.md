# Gateway access events — developer guide

How on-site gateways report **lock state changes** and **credential-based access** (grants, denials, keypad attempts) to BluLok Cloud so they appear in **Access History**, **Activity Monitor**, and real-time dashboard feeds.

**Source of truth (validation):** `backend/src/routes/internal-gateway.routes.ts`  
**Access-event ingestion:** `backend/src/services/access/access-event-ingestion.service.ts`  
**Type definitions:** `backend/src/services/access/access-event.types.ts`  
**Lock-state activity (BluLok):** `backend/src/services/device-event.service.ts`  
**Read-layer semantics:** `cursorDocs/access-notifications-activity-apis.md` § Access History Event Semantics

---

## Two reporting paths (do not mix them up)

BluLok Cloud uses **two separate mechanisms**. Choosing the wrong one produces missing or duplicate history rows.

| What happened | Gateway sends | Cloud `activity_type` | Access History `action` |
|---------------|---------------|----------------------|-------------------------|
| **Physical lock bolt moved** (local button, motor settled, manual turn) | `POST /devices/state` with `locked` / `state` | `lock` or `unlock` | `lock` / `unlock` |
| **Credential evaluated** (app, route pass, keypad code, policy denial) | `POST /access-events` | `access_attempt` | `access_granted`, `unlock_attempt`, etc. |
| **Cloud-initiated remote LOCK/UNLOCK** (JWT from cloud) | Confirm final state via `POST /devices/state` only | `lock` / `unlock` (attributed to initiating user) | `lock` / `unlock` with `remote_gateway` / `admin_remote` |
| **Admin remote open** (operator override at gateway) | `POST /access-events` with `admin_remote_open` | `access_attempt` | Shown as admin remote open |

### Tenant-unit unlock override (Occupied Unit Override)

When a BluLok lock is assigned to a unit that has a tenant (primary/shared assignment or active key share):

| Caller | Path | Override |
|--------|------|----------|
| Occupant or key-share recipient | Cloud remote `PUT …/lock` **or** BLE unlock | **Not applicable** |
| Staff / other non-occupant | Cloud remote | Optional body: `tenant_override_reason` (+ optional `tenant_override_notes`) |
| Staff / other non-occupant | On-ground BLE | Optional `POST …/blulok/:id/occupied-unit-override` then unlock within TTL |

**Current policy:** override is optional (`OCCUPIED_UNIT_OVERRIDE_REQUIRED = false`). Omitting reason fields does not block unlock. When the flag is re-enabled, missing staff reason on remote unlock → `400` with `code: TENANT_UNLOCK_OVERRIDE_REQUIRED`. See [`app-occupied-unit-override.md`](./app-occupied-unit-override.md).

| Body field (remote) | Required when staff unlocks occupied unit | Values |
|---------------------|-------------------------------------------|--------|
| `tenant_override_reason` | Only when `OCCUPIED_UNIT_OVERRIDE_REQUIRED` | `tenant_locked_phone`, `emergency`, `testing_maintenance` |
| `tenant_override_notes` | No | Free text (max 500) |

On success (and on failed/timed-out remote unlock attempts), Access History shows the initiating user plus **Unlock reason** / optional **Notes** from activity metadata `tenant_unlock_override` **when provided**. On-ground intents are single-use and expire (~60s); gateway may echo `metadata.occupied_unlock_intent_id` on access-events for stricter binding. Intent registration is not required for BLE unlock to succeed. Only on-ground access methods (`app`, `mobile_key`, `route_pass`) consume an occupied unlock intent — not `admin_remote_open`.

```mermaid
flowchart LR
  subgraph gateway [On-site gateway]
    LockHW[Lock hardware event]
    CredEval[Credential evaluation]
    StateSync[State sync batch]
    AccessAPI[Access-events batch]
  end

  subgraph cloud [BluLok Cloud]
    DeviceSync[devices/state handler]
    Ingest[access-events ingestion]
    Activity[(activity_logs)]
    History[Access History API]
  end

  LockHW --> StateSync
  CredEval --> AccessAPI
  StateSync --> DeviceSync --> Activity
  AccessAPI --> Ingest --> Activity
  Activity --> History
```

### BluLok locks vs access control

| Device kind | Lock/unlock history from state sync? | Access attempts |
|-------------|--------------------------------------|-----------------|
| **BluLok** (`kind: lock`) | **Yes** — terminal `locked` / `unlocked` auto-logs | `POST /access-events` |
| **Access control** (`kind: access_control`) | **No** — state sync updates UI/telemetry only; relay open/close is **not** a separate lock row unless cloud had a pending remote command | **Required** — use `access_granted`, `access_denied`, `keypad_attempt`, `admin_remote_open` |

---

## Transport

Gateways call internal REST through the inbound WebSocket **`PROXY_REQUEST`** tunnel (same as inventory sync). See [`gateway-integration.md`](./gateway-integration.md) for `AUTH`, reconnect, and Cloud Run notes.

```json
{
  "type": "PROXY_REQUEST",
  "id": "<uuid-correlation-id>",
  "method": "POST",
  "path": "/internal/gateway/access-events",
  "headers": { "Content-Type": "application/json" },
  "body": { }
}
```

Cloud responds with `PROXY_RESPONSE` (`status`, `body`, same `id`).

| Item | Value |
|------|--------|
| REST path (proxy `path`) | `/internal/gateway/access-events` |
| Full HTTP URL (direct / tests) | `POST /api/v1/internal/gateway/access-events` |
| Auth | Facility-scoped JWT (`facility_admin`, `admin`, or `dev_admin`) |
| Facility scope | `X-Gateway-Facility-Id` header (injected by proxy) + optional `facility_id` in body |
| Lock state (separate endpoint) | `POST /internal/gateway/devices/state` — see [`gateway-device-inventory-payload.md`](./gateway-device-inventory-payload.md) |

**`facility_id` rules**

- `facility_admin`: body/query `facility_id` must match the authenticated gateway facility (cannot override `X-Gateway-Facility-Id`).
- `admin` / `dev_admin`: may specify `facility_id` in body when not using the header.
- Each event’s `facility_id` (if present) must equal the scoped facility or ingestion returns **400**.

---

## Path 1 — Lock / unlock state (`POST /devices/state`)

Use this when the **physical lock state** changes. Do **not** send `access-events` for a simple local lock or unlock on BluLok hardware.

### Request shape

```json
{
  "tid": 42,
  "facility_id": "<facility-uuid>",
  "updates": [
    {
      "kind": "lock",
      "lock_id": "ae4097b2-16b3-4b1d-b964-6021c7be6ea2",
      "state": "CLOSED",
      "locked": true,
      "online": true,
      "last_seen": "2026-06-16T23:26:00.000Z",
      "source": "GATEWAY"
    }
  ]
}
```

### Field mapping (locks)

| Gateway field | Terminal values | Cloud `lock_status` | Logged in Access History? |
|---------------|-------------------|---------------------|---------------------------|
| `state: "CLOSED"` or `locked: true` | Settled locked | `locked` | **Yes** → `lock` |
| `state: "OPENED"` or `locked: false` | Settled unlocked | `unlocked` | **Yes** → `unlock` |
| `state: "ERROR"` | Fault | `error` | No (status/telemetry only) |
| `state: "UNKNOWN"` | Unknown | `unknown` | No |

`source` (`GATEWAY`, `USER`, `CLOUD`) is accepted on the payload but is **not** used to choose access-history attribution. Attribution for remote commands is determined by whether the cloud recently issued a LOCK/UNLOCK JWT for that device.

### How remote-command attribution works

1. `PUT /devices/blulok/:id/lock` and `PUT /devices/access-control/:id/lock` always pass the authenticated user into `LockCommandService` as the **initiator** (Occupied Unit Override metadata only when a non-occupant unlocks an occupied BluLok unit — see [`app-occupied-unit-override.md`](./app-occupied-unit-override.md)).
2. For BluLok **unlock**, cloud immediately creates an Access History **session** (`pending`, `origin: cloud_remote`) and writes a raw `remote_access_granted` activity linked by `access_session_id`. Command timers remain process-local; durable pending attribution lives in `access_sessions`.
3. When `devices/state` reports a **real transition** to terminal `unlocked` matching the request, the session moves to `open` and a raw `unlock` activity is linked. Opposite state → session `failed`. Same-state re-reports do not success-consume pending attribution.
4. Later physical re-lock **closes** the same session (`closed`, `open_duration_sec`) rather than creating an unrelated history row in the sessions view.
5. While a remote unlock is pending, additional grant-like gateway `access-events` for that device **attach** to the session (`attempt_count`) instead of being discarded.
6. Pending entries always have a TTL: facility `lock_command_timeout_sec`, or for one-shot (`0`) a fixed **60s** attribution TTL. A sweeper marks expired pending sessions `timed_out`.

**Deployment note:** command timers are still process-local (same class as inbound gateway WebSocket affinity). Durable session attribution survives multi-instance Cloud Run; prefer sticky sessions for transitional `lock_status` UI until timers are shared.

### Transitional states

You may report in-flight states for live UI (`locking`, `unlocking` via repeated updates). **Access History list/export only includes terminal `lock` and `unlock`**, not transitional rows.

### Remote commands (cloud → gateway JWT)

When the cloud sends BluLok `UNLOCK` JWTs:

1. Cloud opens a **pending** access session and logs **Remote Access Granted** for the initiator.
2. Gateway executes on hardware.
3. Gateway reports **final** state through `devices/state`.
4. Cloud moves the session to **open** and logs **Unlocked at site** on the raw trail for the same initiator.
5. If the final state **opposes** the requested command (e.g. unlock requested, lock observed), cloud marks the session **failed** — **do not** send a compensating `access-events` row for that mismatch.
6. Optional late `access-events` grants for the same unlock attach to the session rather than creating duplicate Access History rows.

### Access control state updates

```json
{
  "updates": [
    {
      "kind": "access_control",
      "access_id": "KP-7F2A-001",
      "relay_channel": 1,
      "locked": false,
      "online": true,
      "last_seen": "2026-06-16T23:26:00.000Z"
    }
  ]
}
```

This updates `is_locked` / online status and dashboard WebSocket feeds. It does **not** create Access History rows for local relay activity. Send **`access-events`** when a user/credential actually opened or was denied.

---

## Path 2 — Access events (`POST /access-events`)

Use this for **authorization outcomes**: mobile app unlock, route pass validation, keypad codes, admin override, denials.

### Top-level body

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `events` | **yes** | array | Min 1 event per request |
| `facility_id` | no | string | Defaults to scoped facility |
| `tid` | no | number \| string | Correlation only; echoed by gateway proxy patterns |

Events in one request are processed **sequentially**. There is no server-side deduplication by `event_id` today — use unique `event_id` values and avoid retries with new IDs unless you intend duplicate history rows.

### Per-event schema

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `event_id` | **yes** | string | Unique idempotency key (stored in metadata; not deduped yet) |
| `occurred_at` | **yes** | ISO-8601 UTC | When the event happened **on site**, not when the HTTP request was sent |
| `device_id` | **yes** | string | **Access device hardware serial** (`access_id` / `lock_id`) — see [Device identifiers](#device-identifiers). Not the gateway id. Cloud rewrites to the device row UUID when resolved. |
| `device_type` | no | enum | Hint: `blulok` \| `access_control` — steers lookup order (keypads/gates should send `access_control`) |
| `relay_channel` | no | number 1–8 | Access control only; disambiguates when one serial maps to multiple relays (also accepted as `metadata.relay_channel`) |
| `facility_id` | no | string | Must match scoped facility |
| `unit_id` | no | string | Unit UUID when known; validated against facility |
| `gateway_id` | no | string | Cloud `gateways.id` — transport/tracing only; **not** the access device identity |
| `correlation_id` | no | string | Tie to cloud command JWT / local trace |
| `action` | **yes** | enum | See [Actions](#actions) |
| `method` | **yes** | enum | See [Methods](#methods) |
| `success` | **yes** | boolean | `true` = granted / succeeded |
| `denial_reason` | **yes when `success: false`** | enum | See [Denial reasons](#denial-reasons) |
| `reason_message` | no | string | Max 500 chars; free-text detail shown in UI |
| `actor` | recommended | object | Who attempted access — see [Actor](#actor) |
| `keypad` | no | object | Keypad context — see [Keypad context](#keypad-context) |
| `route_pass` | no | object | Route pass trace fields |
| `metadata` | no | object | Opaque extension bag (merged into activity metadata) |

### Actions

| `action` | When to use | `success: true` | `success: false` |
|----------|-------------|-----------------|------------------|
| `access_granted` | App, mobile key, or route pass allowed entry | Normal grant | Rare — use denial action instead |
| `access_denied` | Policy/credential rejection (app, route pass, etc.) | N/A | **Required** + `denial_reason` |
| `keypad_attempt` | Keypad code entered on device or access controller | Code accepted | Code rejected / out of schedule |
| `admin_remote_open` | Operator forced open from gateway/UI | Open succeeded | Open failed |

**UI mapping:** `access_denied` and failed `keypad_attempt` rows are shown as **`unlock_attempt`** in Access History with structured `denial_reason`.

### Methods

| `method` | Meaning |
|----------|---------|
| `app` | BluLok mobile app |
| `mobile_key` | Mobile key / BLE credential |
| `keypad` | Physical keypad code |
| `route_pass` | Signed route-pass JWT |
| `admin_remote` | Admin/facility-admin override |
| `system` | Automated / system-initiated |
| `unknown` | Last resort |

### Denial reasons

Required when `success` is `false`.

| `denial_reason` | Typical scenario |
|-----------------|------------------|
| `out_of_schedule` | Outside allowed time window |
| `route_pass_expired` | Route pass past validity |
| `route_pass_invalid_signature` | JWT/signature verification failed |
| `route_pass_wrong_lock` | Pass not valid for this lock |
| `denylist_blocked` | User or device on denylist |
| `insufficient_permissions` | Role/key does not allow action |
| `invalid_credential` | Bad PIN, key, or app proof |
| `internal_error` | Gateway-side processing error |
| `unknown_error` | Unclassified failure |
| `other` | Generic denial |

Human-readable labels are applied in the read layer (`DENIAL_REASON_MESSAGES` in `backend/src/constants/access-history.constants.ts`).

### Actor

```json
{
  "user_id": "<cloud-users.id UUID>",
  "role": "tenant",
  "name": "Jane Tenant",
  "app_device_id": "<optional mobile device id>"
}
```

| `role` | Use when |
|--------|----------|
| `tenant` | Primary unit tenant |
| `shared_user` | Shared-key holder |
| `facility_admin` | Facility operator |
| `admin` | Platform admin |
| `dev_admin` | Dev admin |
| `maintenance` | Maintenance staff |
| `system` | No human actor |
| `gateway` | Gateway-automated (rare for access-events) |
| `unknown` | Actor not identified |

`user_id` should be the **cloud user UUID** when known so Access History can link to the user profile. Local-only actors without a cloud user may omit `user_id` but should still set `role` and `name` when possible.

**Cloud resolution:** Gateway firmware may send placeholders (`role: "unknown"`, `name: "Unknown User"`, `app_device_id: "unknown-app-device"`, `metadata.unit_id: "unknown-unit-id"`). The cloud **ignores those display fields** and resolves:

1. **User** — `actor.user_id` → `users` row (name + role)
2. **Device** — `device_id` is the access device’s hardware serial / `access_id` / `lock_id` (or a cloud UUID if ever sent). Cloud looks up `blulok_devices` / `access_control_devices` by **id or `device_serial`** in the facility. Optional `device_type` prefers AC-first vs BluLok-first. Optional `relay_channel` (top-level or `metadata.relay_channel`) disambiguates multi-relay AC serials. On success, activity stores the **cloud device PK** and keeps the original serial in `metadata.hardware_device_id` (and `gateway_device_id` for back-compat).
3. **Unit** — non-placeholder `unit_id`, else the resolved device’s `unit_id`

Persisted activity rows therefore store cloud device IDs and resolved display names when lookup succeeds. Stored `metadata.device_type` precedence: DB match → payload `device_type` hint → default `blulok`.

**Access History display:** Read-path enrichment joins both device tables on `activity_logs.device_id` **matching cloud PK or hardware serial** (legacy rows that stored serial before rewrite). Live join hits override stale ingest `metadata.device_type` — so a keypad serial / AC UUID that was mistakenly stored as `device_type: blulok` still renders the AC device name (instead of `Unassigned - ?????`).

### Keypad context

```json
{
  "entered_code": "1234",
  "code_id": "<optional>",
  "code_label": "Front gate daily",
  "schedule_id": "<optional>",
  "schedule_name": "Night Schedule",
  "zone_id": "<optional>",
  "zone_name": "Zone A"
}
```

**Security:** `entered_code` is **always redacted** to `***REDACTED***` before persistence. Send it if your pipeline already has it; the cloud will not store the raw digits.

### Route pass context

```json
{
  "route_pass_id": "<optional>",
  "issuance_id": "<optional>",
  "nonce": "<optional>"
}
```

Used for support/debug correlation only; not shown verbatim to tenants.

---

## Device identifiers

| API | Identifier to send | Example |
|-----|-------------------|---------|
| `devices/state` (locks) | Hardware **`lock_id`** (same as inventory `lock_id` / `device_serial`) | `ae4097b2-16b3-4b1d-b964-6021c7be6ea2` |
| `devices/state` (access) | **`access_id`** + **`relay_channel`** (default 1) | Composite key in inventory: `KP-7F2A-001::2` |
| **`access-events`** | Access device **hardware serial** / `access_id` / `lock_id` | `f759bd50-a70e-5bba-81c5-25e9a7c695c1` (+ optional `relay_channel`, `device_type`) |

Firmware does **not** need cloud device UUIDs for access-events. Send the same hardware id the device uses in inventory:

- **Access control (keypad/gate/door):** `device_id` = `access_id` / hardware serial; set `device_type: "access_control"`; include `relay_channel` when the serial is shared across relays. Do **not** encode relay into `device_id` (`serial::1` is inventory/`devices/state` style only).
- **BluLok lock:** `device_id` = `lock_id` / serial; optional `device_type: "blulok"`.

Cloud resolves that serial to the facility device row and stores the cloud PK on the activity log. Unresolvable identifiers still ingest but may lack enrichment until the device is provisioned. Cross-facility resolved devices are rejected with **400** (`device_id does not belong to scoped facility`).

```json
{
  "device_id": "f759bd50-a70e-5bba-81c5-25e9a7c695c1",
  "device_type": "access_control",
  "relay_channel": 1,
  "action": "keypad_attempt",
  "method": "keypad",
  "success": true
}
```

---

## Response

### Success (`200`)

```json
{
  "success": true,
  "data": {
    "facility_id": "<facility-uuid>",
    "ingested": 3,
    "activity_ids": [
      "<activity_logs.id>",
      "<activity_logs.id>",
      "<activity_logs.id>"
    ]
  }
}
```

Each `activity_ids` entry is the persisted `activity_logs` row. Real-time subscribers receive `activity_new` on the **dashboard** WebSocket (`/ws`) with an enriched `accessLog` payload matching `GET /api/v1/access-history` (raw). Session UIs also receive `access_session_upsert` for `GET /api/v1/access-sessions` rows.

### Validation errors (`400`)

| Condition | Typical message |
|-----------|-----------------|
| `success: false` without `denial_reason` | Joi custom validation error |
| Invalid `action` / `method` / `denial_reason` enum | Joi enum message |
| `facility_id` mismatch | `facility_id must match scoped facility` |
| `unit_id` not in facility | `unit_id does not belong to scoped facility` |
| `device_id` foreign facility | `device_id does not belong to scoped facility` |
| Missing `events` or empty array | Joi min length error |

### Auth errors

| HTTP | Cause |
|------|--------|
| 401 | Missing/invalid JWT |
| 403 | Wrong role or facility scope |
| 400 | Missing `facility_id` / header |

**Note:** `access-events` is **not** blocked during gateway recovery (unlike `devices/inventory` which returns **409** `recovery_in_progress`).

---

## Complete examples

### 1 — Mobile app access granted (BluLok)

```json
{
  "facility_id": "550e8400-e29b-41d4-a716-446655440011",
  "events": [
    {
      "event_id": "evt-20260616-001",
      "occurred_at": "2026-06-16T23:20:00.000Z",
      "facility_id": "550e8400-e29b-41d4-a716-446655440011",
      "unit_id": "unit-uuid",
      "device_id": "cloud-blulok-device-uuid",
      "gateway_id": "gateway-uuid",
      "action": "access_granted",
      "method": "app",
      "success": true,
      "actor": {
        "user_id": "tenant-user-uuid",
        "role": "tenant",
        "name": "Primary Tenant"
      }
    }
  ]
}
```

Then report physical unlock when the bolt moves:

```json
{
  "updates": [
    {
      "kind": "lock",
      "lock_id": "ae4097b2-16b3-4b1d-b964-6021c7be6ea2",
      "locked": false,
      "state": "OPENED"
    }
  ]
}
```

Access History **sessions** view shows **one row** for the grant + physical unlock (and later re-lock closes the same session with open duration). Raw `activity_logs` still retains both the access-event and the unlock state row, linked by `access_session_id`. See [`access-sessions.md`](./access-sessions.md).

### 2 — Route pass denied (bad signature)

```json
{
  "events": [
    {
      "event_id": "evt-20260616-002",
      "occurred_at": "2026-06-16T23:21:00.000Z",
      "facility_id": "550e8400-e29b-41d4-a716-446655440011",
      "unit_id": "unit-uuid",
      "device_id": "cloud-blulok-device-uuid",
      "action": "access_denied",
      "method": "route_pass",
      "success": false,
      "denial_reason": "route_pass_invalid_signature",
      "actor": {
        "user_id": "shared-user-uuid",
        "role": "shared_user",
        "name": "Shared User"
      },
      "route_pass": {
        "nonce": "abc123"
      }
    }
  ]
}
```

### 3 — Keypad denied (out of schedule)

```json
{
  "events": [
    {
      "event_id": "evt-20260616-003",
      "occurred_at": "2026-06-16T23:22:00.000Z",
      "facility_id": "550e8400-e29b-41d4-a716-446655440011",
      "unit_id": "unit-uuid",
      "device_id": "cloud-blulok-device-uuid",
      "action": "keypad_attempt",
      "method": "keypad",
      "success": false,
      "denial_reason": "out_of_schedule",
      "keypad": {
        "entered_code": "1234",
        "schedule_name": "Night Schedule",
        "zone_name": "Zone A"
      }
    }
  ]
}
```

### 4 — Admin remote open (access control door)

```json
{
  "events": [
    {
      "event_id": "evt-20260616-004",
      "occurred_at": "2026-06-16T23:23:00.000Z",
      "facility_id": "550e8400-e29b-41d4-a716-446655440011",
      "device_id": "KP-7F2A-001",
      "device_type": "access_control",
      "relay_channel": 1,
      "action": "admin_remote_open",
      "method": "admin_remote",
      "success": true,
      "actor": {
        "user_id": "facility-admin-uuid",
        "role": "facility_admin",
        "name": "Facility Admin"
      }
    }
  ]
}
```

### 5 — Local lock at device (no access-event)

User turns a thumbturn / motor completes lock — **only** state sync:

```json
{
  "updates": [
    {
      "kind": "lock",
      "lock_id": "ae4097b2-16b3-4b1d-b964-6021c7be6ea2",
      "locked": true,
      "state": "CLOSED",
      "source": "USER"
    }
  ]
}
```

Access History **sessions** view shows a **Locked** step on the unlock session timeline (never a standalone “Manually locked” row). Raw `view=raw` still shows the lock activity_logs event linked by `access_session_id`.

### 6 — Batch ingest

```json
{
  "tid": 9001,
  "facility_id": "550e8400-e29b-41d4-a716-446655440011",
  "events": [
    { "...": "access_granted event" },
    { "...": "access_denied event" },
    { "...": "keypad_attempt event" }
  ]
}
```

---

## What the operator UI shows

After ingestion, `AccessHistoryReadService` maps rows for the API:

| Ingested | API `action` | API `method` | Status |
|----------|--------------|--------------|--------|
| `access_granted` + success | `access_granted` | preserved | success |
| `access_denied` | `unlock_attempt` | preserved | failed |
| `keypad_attempt` + failure | `unlock_attempt` | `keypad` | failed |
| `keypad_attempt` + success | `keypad_attempt` | `keypad` | success |
| `admin_remote_open` | `admin_remote_open` | `admin_remote` | per `success` |
| Cloud BluLok unlock issued | `remote_access_granted` | `admin_remote` / `remote_gateway` | success |
| State sync `lock` (local) | `lock` | `local_device` | success |
| State sync `unlock` (correlated remote) | `unlock` | `local_device` (+ `correlated_remote`) | success |
| State sync `unlock` (local / on-ground) | `unlock` | `local_device` or `app` | success |

Presentation metadata includes facility, unit, device name (unit number when assigned, otherwise `Unassigned - {serial digits}`), initiator links, and `failure_summary` for denials.

---

## Implementation checklist

- [ ] Authenticate `/ws/gateway` with facility-scoped JWT before any PROXY calls.
- [ ] Send access device hardware serial / `access_id` / `lock_id` as `device_id`; for keypads set `device_type: "access_control"` and `relay_channel` when needed.
- [ ] Send **`devices/state`** for every terminal BluLok lock/unlock.
- [ ] Send **`access-events`** for credential evaluation (grant/deny/keypad/admin open).
- [ ] Always include `denial_reason` when `success: false`.
- [ ] Use UTC ISO-8601 for `occurred_at`.
- [ ] Use unique `event_id` per logical event; retry the same `event_id` only if you accept duplicate rows today.
- [ ] Do **not** send `access-events` for cloud-initiated LOCK/UNLOCK JWT results — state sync is enough.
- [ ] Do **not** send `access-events` for BluLok local lock/unlock — state sync is enough.
- [ ] For access control doors/gates, send **`access-events`** for user-visible access outcomes.
- [ ] Include `unit_id` when the event targets a specific storage unit.
- [ ] Include `actor` with cloud `user_id` when the mobile app or shared user is known.

---

## Testing

| Test | Location |
|------|----------|
| HTTP validation (missing `denial_reason`) | `backend/src/__tests__/routes/internal-gateway.routes.test.ts` |
| Ingestion → activity metadata | `backend/src/__tests__/services/access-history-read.service.test.ts` |
| Lock activity from state sync | `backend/src/__tests__/services/device-event.lock-activity.test.ts` |
| End-to-end PROXY + live `activity_new` / `access_session_upsert` + `GET /access-sessions` | `backend/npm run ws:e2e` — **Access History — BluLok remote unlock** and **Access Event Canonical Pipeline** sections |

Minimal curl-style test (facility admin token):

```bash
curl -sS -X POST "$API_BASE/api/v1/internal/gateway/access-events" \
  -H "Authorization: Bearer $FACILITY_ADMIN_JWT" \
  -H "X-Gateway-Facility-Id: $FACILITY_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "facility_id": "'"$FACILITY_ID"'",
    "events": [{
      "event_id": "manual-test-1",
      "occurred_at": "2026-06-16T12:00:00.000Z",
      "facility_id": "'"$FACILITY_ID"'",
      "device_id": "'"$CLOUD_DEVICE_ID"'",
      "action": "access_granted",
      "method": "app",
      "success": true,
      "actor": { "role": "tenant", "name": "Test Tenant" }
    }]
  }'
```

---

## Related docs

- [`gateway-integration.md`](./gateway-integration.md) — WebSocket auth, PROXY tunnel, recovery, telemetry
- [`gateway-device-inventory-payload.md`](./gateway-device-inventory-payload.md) — `devices/inventory` and `devices/state` field reference
- [`access-notifications-activity-apis.md`](./access-notifications-activity-apis.md) — operator REST/WebSocket for activity & access history
- [`route-pass-jwt.md`](./route-pass-jwt.md) — route pass format validated before `route_pass_*` denial reasons
