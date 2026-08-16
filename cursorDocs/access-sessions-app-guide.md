# Access Sessions — App Developer Guide

> **Audience:** Mobile / app clients migrating from raw Access History to Access Sessions.  
> **Date/time:** All timestamps are UTC ISO-8601 strings. See [`datetime-conventions.md`](./datetime-conventions.md).  
> **Internal architecture:** [`access-sessions.md`](./access-sessions.md) · REST/WS overview: [`access-notifications-activity-apis.md`](./access-notifications-activity-apis.md)

## Why migrate

`GET /api/v1/access-history` returns **one row per raw event** (`activity_logs`). A single real-world access often produces 2–4 rows (grant + unlock + lock), and pending remote unlocks were easy to miss.

`GET /api/v1/access-sessions` returns **one row per logical access**, with lifecycle state (`pending` → `open` → `closed`, or terminal `denied` / `timed_out` / `failed`), open duration, and a timeline you can render without stitching events yourself.

**Use sessions for any user-facing access list / detail UI.** Keep raw history only if you need a forensic event feed.

---

## Quick start

1. List: `GET /api/v1/access-sessions` → render `sessions[]`.
2. Detail / expand: `GET /api/v1/access-sessions/:id` → `session` + chronological `events[]`.
3. Live: keep your existing WebSocket `activity` subscription; handle `access_session_upsert` (upsert by `session.id`). Keep `activity_new` only if you still show raw events.
4. Stop relying on `logs[].action` / per-event `success` for the main UI — drive status from `state` (+ `outcome`).

Auth: same Bearer JWT as today. Facility / unit / user scope is identical to access history (tenants see their units / own actor rows; facility admins see assigned facilities only).

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/access-sessions` | Paginated session list |
| `GET` | `/api/v1/access-sessions/:id` | Session detail + linked raw `events[]` |
| `GET` | `/api/v1/access-sessions/export` | CSV (optional; same filters) |

### Legacy (do not use for new session UI)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/access-history` | **Default = raw** event `logs[]` |
| `GET` | `/api/v1/access-history?view=sessions` | Transitional: returns sessions + `logs` alias — prefer `/access-sessions` |
| `GET` | `/api/v1/access-history/:id` | Resolves session id when possible; else raw log |

---

## Query parameters

Shared filter style with access history:

| Param | Notes |
|-------|--------|
| `facility_id`, `unit_id`, `user_id`, `device_id` | UUIDs; RBAC still enforced |
| `method` | Exact method string. Special: `method=cloud` matches `admin_remote` **or** `remote_gateway` |
| `state` | `pending` \| `open` \| `closed` \| `timed_out` \| `denied` \| `failed` |
| `denial_reason` | Exact denial code when present |
| `date_from` / `date_to` | ISO; aliases `start_date` / `end_date`. Filters on **`started_at`** |
| `success` | Optional boolean post-filter: granted sessions in `open` \| `closed` \| `pending` |
| `limit` | Default `50`, max `100` (list) |
| `offset` | Default `0` |
| `sort_order` | `asc` \| `desc` (default `desc`). Sort key is **`started_at`** |

`action` / `action_type` are accepted for parity with history clients but are not the primary session filter — prefer `state` / `method`.

**“Needs attention” / open locks:** `GET /api/v1/access-sessions?state=open` (and usually clear the date range so long-open sessions still appear). Use list field `currently_open` for a badge count.

---

## Response shapes

### List

```http
GET /api/v1/access-sessions?limit=50&offset=0
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "sessions": [ /* AccessSession */ ],
  "total": 123,
  "currently_open": 2,
  "limit": 50,
  "offset": 0
}
```

There is **no** `logs` alias on this mount.

### Detail

```http
GET /api/v1/access-sessions/{id}
```

```json
{
  "success": true,
  "session": { /* AccessSession */ },
  "events": [ /* raw AccessHistory-shaped rows, chronological */ ]
}
```

Use `events` for an optional audit expand. The Cloud UI timeline is driven from **session fields** (`state`, timestamps, `origin` / `method`), not by re-deriving steps from `events`.

### Errors

| Status | When |
|--------|------|
| `401` | Missing / invalid token |
| `403` | Facility (or other scope) not allowed |
| `404` | Session not found / not in scope |
| `500` | Server error |

---

## `AccessSession` schema

```ts
type AccessSessionState =
  | 'pending'
  | 'open'
  | 'closed'
  | 'timed_out'
  | 'denied'
  | 'failed';

type AccessSessionOrigin = 'cloud_remote' | 'on_site' | 'local' | 'system';

type AccessSessionOutcome = 'granted' | 'denied' | 'failed';

interface AccessSession {
  id: string;
  kind: string;                         // typically "access"
  origin: string;                       // cloud_remote | on_site | local | system
  method: string;                       // app | mobile_key | keypad | route_pass | admin_remote | …
  outcome: string | null;               // granted | denied | failed
  state: AccessSessionState;

  device_id: string;
  device_type: 'blulok' | 'access_control';
  facility_id?: string;
  unit_id?: string;
  user_id?: string;                     // actor user when known
  actor_type?: string;                  // user | system | device | gateway
  actor_role?: string;

  denial_reason?: string;               // machine code when denied
  reason?: string;                      // human-readable message when present
  attempt_count: number;                // >1 when grants coalesce while open

  started_at: string;                   // ISO UTC — request / session start
  opened_at?: string;                   // physical unlock
  closed_at?: string;                   // re-lock
  expires_at?: string;                  // pending TTL (countdown)
  settled_at?: string;                  // terminal settle time when set
  open_duration_sec?: number;           // set when closed (both ends known)

  remote_command_id?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;   // e.g. tenant_unlock_override

  // Display enrichment (may be omitted)
  facility_name?: string;
  unit_number?: string;
  user_name?: string;
  user_email?: string;
  device_name?: string;
  device_serial?: string;
}
```

### Field → UI mapping (recommended)

| Goal | Use |
|------|-----|
| Status pill | `state` (+ `outcome`, `denial_reason` / `reason`) |
| When it happened | `started_at` (list sort); show `opened_at` / `closed_at` in detail |
| Pending countdown | `expires_at` − now |
| Open duration (live) | now − `opened_at` while `state === 'open'` |
| Closed duration | `open_duration_sec` |
| Title | `method` + `origin` (see titles below) |
| Who | `user_name` / `user_email`; if missing → **“Not identified”** (normal for keypad) |
| Where | Prefer `unit_number`, else device label / serial |
| Attempts | Show `×N` when `attempt_count > 1` |
| Occupied-unit staff override | `metadata.tenant_unlock_override` (or related override flags) |

Do **not** treat UUID-shaped strings in `user_name` / `unit_number` / `device_name` as display labels — hide them (Cloud does the same).

---

## Session states

```text
pending ──► open ──► closed
   │
   ├──► timed_out
   └──► failed

* ──► denied   (always its own terminal session; never coalesced)
```

| State | Meaning for the app |
|-------|---------------------|
| `pending` | Authorized / requested; waiting for physical unlock. Show countdown from `expires_at`. |
| `open` | Lock is unlocked now. Tick elapsed from `opened_at`. Escalate UX after long open (Cloud uses **10m** “possibly left open”, **1h** “left open”). |
| `closed` | Re-locked; show `open_duration_sec`. |
| `denied` | Credential / policy denial. |
| `timed_out` | Pending expired without unlock confirmation. |
| `failed` | Command rejected / settlement mismatch. |

`open` / `closed` are never invented from timeouts. Standalone “manually locked” history rows **do not** appear as separate session rows — lock is the **Locked** step on the unlock session.

---

## Suggested status copy (matches Cloud)

| Condition | Label idea |
|-----------|------------|
| `pending` | Waiting for unlock · countdown |
| `open` &lt; 10m | Open now · elapsed |
| `open` ≥ 10m | Possibly left open · elapsed |
| `open` ≥ 1h | Left open · elapsed (critical) |
| `closed` | Closed · duration |
| `denied` | Denied · reason |
| `timed_out` | Timed out |
| `failed` | Failed |

---

## Method / origin titles

| `method` / `origin` | Suggested title |
|---------------------|-----------------|
| `admin_remote`, `remote_gateway`, or `origin: cloud_remote` | Remote unlock |
| `app`, `mobile_key` | Mobile key |
| `keypad` | Keypad |
| `route_pass` | Route pass |
| Other on-site / local | On-site unlock / Local unlock |

Cloud “remote” methods may also be filtered with `method=cloud`.

---

## Building a timeline without raw events

You can render a simple timeline from the session alone:

### Remote (`origin === 'cloud_remote'` or method `admin_remote` / `remote_gateway`)

1. **Requested** — `started_at`
2. While `pending`: **Waiting for device to unlock** (spinner; countdown via `expires_at`)
3. **Opened** — `opened_at` (when `open` / `closed`)
4. **Locked** — `closed_at` (when `closed`)
5. Or terminal: **Timed out** / **Failed** / **Denied**

### On-site / keypad / app (near-instant)

1. **Unlocked** — `opened_at` \|\| `started_at` (detail can say “via keypad” when unidentified)
2. **Locked** — `closed_at` when closed  
   Or a single **Denied** / **Timed out** / **Failed** step

Optional: expand `events[]` from detail for power users; not required for the default UI.

---

## Live updates (WebSocket)

Subscribe exactly as for activity today:

```json
{
  "type": "subscribe",
  "subscriptionType": "activity",
  "data": {
    "facilityId": "<optional uuid>",
    "unitId": "<optional uuid>",
    "deviceId": "<optional uuid>"
  }
}
```

### `access_session_upsert` (sessions UI)

```json
{
  "type": "access_session_upsert",
  "subscriptionId": "...",
  "data": {
    "session": { /* AccessSession */ },
    "changed": ["state", "opened_at"],
    "timestamp": "2026-08-06T06:00:00.000Z"
  },
  "timestamp": "2026-08-06T06:00:00.000Z"
}
```

**Client handling:** upsert into your list by `session.id` (replace if present, else prepend). Recompute status from the new `state`. Fanout is already facility/unit/device + role scoped.

### `activity_new` (raw only)

Payload includes enriched `accessLog` in the **raw history** shape. Use for an Activity Monitor–style feed, **not** as a substitute for session rows (you would reintroduce multi-row fragmentation).

---

## Migration from Access History

| Old (raw history) | New (sessions) |
|-------------------|----------------|
| Many `logs[]` rows per visit | One `sessions[]` row |
| `action` (`unlock`, `lock`, `remote_access_granted`, …) | Drive UI from `state` + timeline |
| `success` / `status` | `outcome` + `state` (`success` query still works as a convenience filter) |
| `occurred_at` | `started_at` (+ `opened_at` / `closed_at`) |
| Invisible pending remotes | First-class `state: pending` |
| Standalone lock rows in the list | Gone from sessions; lock is a timeline step |
| `GET …/access-history` default | Stay on raw; **do not** assume it returns sessions |

### Checklist

1. Point list / pull-to-refresh at `/api/v1/access-sessions`.
2. Map cells: subject · user · method title · status from `state` · time from `started_at`.
3. Detail sheet: `/access-sessions/:id` → timeline from session fields; optional `events` section.
4. WS: handle `access_session_upsert`; demote `activity_new` to raw-only screens.
5. Open-lock badge: use `currently_open` and/or `state=open`.
6. Expect empty/partial historical sessions until Cloud backfill has been run for that environment (raw history remains complete). Backfill is an admin/ops concern (`POST /api/v1/admin/access-sessions/backfill`), not an app API.

---

## Raw history shape (reference only)

If you still call `/access-history` (default raw):

```ts
interface AccessHistoryRecord {
  id: string;
  device_id: string;
  device_type: 'blulok' | 'access_control';
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  action: string;
  method: string;
  success: boolean;
  status: 'success' | 'failed' | 'pending';
  denial_reason?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  facility_name?: string;
  unit_number?: string;
  user_name?: string;
  user_email?: string;
  actor_type?: string;
  device_name?: string;
  device_location?: string;
  device_serial?: string;
}
```

Session detail `events[]` items use this family of fields.

---

## Example list row (illustrative)

```json
{
  "id": "a1b2c3d4-…",
  "kind": "access",
  "origin": "cloud_remote",
  "method": "admin_remote",
  "outcome": "granted",
  "state": "closed",
  "device_id": "…",
  "device_type": "blulok",
  "facility_id": "…",
  "unit_id": "…",
  "user_id": "…",
  "actor_type": "user",
  "attempt_count": 1,
  "started_at": "2026-08-06T15:01:00.000Z",
  "opened_at": "2026-08-06T15:01:02.100Z",
  "closed_at": "2026-08-06T15:04:18.000Z",
  "open_duration_sec": 196,
  "facility_name": "West Storage",
  "unit_number": "B-214",
  "user_name": "Alex Rivera",
  "user_email": "alex@example.com",
  "device_name": "Unit B-214 Lock"
}
```

Status: **Closed · 3m 16s**. Timeline: Requested → Opened → Locked.

---

## Related

- [`access-sessions.md`](./access-sessions.md) — correlation rules, sweeper, backfill, Cloud UI notes  
- [`access-notifications-activity-apis.md`](./access-notifications-activity-apis.md) — broader activity REST/WS  
- [`gateway-access-events.md`](./gateway-access-events.md) — how gateway events feed sessions  
- Cloud reference helpers (optional to port): `frontend/src/utils/access-session-display.utils.ts`, `access-session-timeline.utils.ts`
