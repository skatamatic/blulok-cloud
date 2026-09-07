# App Realtime WebSocket — mobile developer guide

**Audience:** Native / Flutter / React Native (or WebView) engineers implementing the BluLok **tenant / facility app** live channel.

**Status:** Implemented on the cloud (`/ws/app`). This document is the **client contract** — connect, subscribe, merge events, reconnect.

**Companions:**

| Doc | Role |
|-----|------|
| [App realtime overview](./app-realtime-websocket.md) | Short wire summary (points here for full client guidance) |
| [App lock / unit assignment APIs](./app-lock-unit-assignment-apis.md) | REST for locks, units, assignments |
| [Access / notifications / activity APIs](./access-notifications-activity-apis.md) | REST + dashboard `/ws` notification/activity details |
| [Auth & RBAC](./auth.md) | Roles, JWT, facility access |
| [Gateway integration](./gateway-integration.md) | How gateway telemetry becomes device events |

**Not this channel:** Admin dashboard uses a different socket (`/ws`) with many subscription types. Do **not** mix those subscription types onto `/ws/app`.

**Lab / E2E:** `backend` `ws:e2e` includes `/ws/app` checks; idle close needs `APP_WS_IDLE_MS` + `E2E_APP_WS_IDLE_WAIT_MS`.

---

## 1. Mental model

One WebSocket per app session carries a **single facility stream**:

1. Connect with the user’s JWT.
2. Subscribe to exactly one `facility_id`.
3. Receive an immediate **`app_snapshot`** (RBAC-filtered full bundle).
4. Apply incremental **`app_event`** updates for that facility.
5. Keep heartbeats alive or the server closes the socket for idle.

```text
App                          Cloud
 |--- wss /ws/app?token=JWT -->|
 |--- subscription (facility) ->|
 |<-- subscription ack ---------|
 |<-- app_event app_snapshot ---|   ← replace local facility cache
 |<-- app_event … (live) -------|
 |--- heartbeat --------------->|
 |<-- heartbeat ----------------|
```

Server-side fanout is **in-memory per Cloud Run instance** (same class of constraint as `/ws/gateway`). Prefer **session affinity** when `max-instances > 1`. A process restart drops sockets; clients reconnect and re-subscribe (snapshot resets state).

Cloud Run + Node lifetime: the socket is one HTTP request, capped at the service **`--timeout`** (deployed **3600s**). Heartbeats do **not** reset that timer or Node’s default **300s `requestTimeout`** (the backend sets `requestTimeout=0`). An open `/ws/app` connection keeps its Cloud Run instance allocated — **min-instances is not required**. Expect a disconnect at the hour mark and on deploys; follow the reconnect playbook. Details: [Gateway integration](./gateway-integration.md) §2 / §2b.

---

## 2. Connect

```
wss://<BACKEND_HOST>/ws/app?token=<JWT>
```

| Rule | Detail |
|------|--------|
| Auth | JWT in query `token` (same token as `Authorization: Bearer` on REST) |
| Invalid / missing JWT | Close **`1008`** |
| CORS | Native apps: N/A. Browser/WebView: origin must be in `CORS_ORIGINS` |
| Path | Exactly `/ws/app` (not `/ws`, not `/ws/gateway`) |

After TCP upgrade, wait until auth completes before relying on responses. Early client frames may be queued briefly (≤20) while the server verifies the token.

**Token refresh:** When the JWT is about to expire, open a **new** socket with a fresh token, then re-subscribe. Do not expect mid-connection token rotation on this channel.

---

## 3. Subscribe / unsubscribe

### 3.1 Subscribe

```json
{
  "type": "subscription",
  "subscriptionType": "app",
  "data": { "facility_id": "<uuid>" }
}
```

Optional: send your own `subscriptionId` (string). If omitted, the server generates one (`app-…`).

**Ack (control message — not an `app_event`):**

```json
{
  "type": "subscription",
  "subscriptionType": "app",
  "subscriptionId": "<id>",
  "data": {
    "message": "Subscription created successfully",
    "facility_id": "<uuid>"
  },
  "timestamp": "ISO-8601"
}
```

Immediately afterward the server sends:

```json
{
  "type": "app_event",
  "subscriptionId": "<id>",
  "facilityId": "<uuid>",
  "event": "app_snapshot",
  "data": { },
  "timestamp": "ISO-8601"
}
```

**Rules**

- Only `subscriptionType: "app"` is allowed on this socket.
- Exactly **one** active app subscription per connection.
- To change facility: **unsubscribe**, then subscribe with the new `facility_id`.
- Access is checked with live DB facility associations (`FacilityAccessService`), not stale JWT `facilityIds` alone.

### 3.2 Unsubscribe

```json
{
  "type": "unsubscription",
  "subscriptionType": "app",
  "subscriptionId": "<id>"
}
```

Ack:

```json
{
  "type": "unsubscription",
  "subscriptionType": "app",
  "subscriptionId": "<id>",
  "data": { "message": "Unsubscription successful" },
  "timestamp": "ISO-8601"
}
```

---

## 4. Heartbeat and idle tear-down

| Direction | Message | Timing |
|-----------|---------|--------|
| Server → app | `{ "type": "heartbeat", "data": { "message": "Server heartbeat" }, "timestamp": "…" }` | Every **30s** (`APP_WS_HEARTBEAT_MS`) |
| App → server | `{ "type": "heartbeat" }` | Send every **20–30s** |
| Server reply | `{ "type": "heartbeat", "data": { "message": "Heartbeat received" }, … }` | Per client heartbeat |
| Idle close | Code **`1001`**, reason `Idle timeout` | No **client** heartbeat for **60s** (`APP_WS_IDLE_MS`) |

**Client requirement:** treat server heartbeats as optional keep-alive noise; **you must send client heartbeats** or you will be disconnected even if the server is still pinging you.

On `1001` or any close: reconnect (§9).

---

## 5. Event envelope

All domain payloads use one outer shape:

```json
{
  "type": "app_event",
  "subscriptionId": "<id>",
  "facilityId": "<uuid>",
  "event": "<AppRealtimeEventName>",
  "data": { },
  "timestamp": "ISO-8601"
}
```

Ignore events whose `facilityId` / `subscriptionId` do not match your active subscription (defensive).

### Event names (v1)

| `event` | Meaning | Typical client merge |
|---------|---------|----------------------|
| `app_snapshot` | Full RBAC bundle for facility | **Replace** facility store |
| `notification_created` | New in-app notification | Prepend / upsert; bump unread if unread |
| `notification_read` | One notification marked read | Patch row; unread via count event |
| `notification_deleted` | Removed / hidden | Remove from list |
| `notifications_batch_read` | Batch read | Patch many / rely on count |
| `notifications_batch_hidden` | Batch hide | Clear / refetch list |
| `notifications_count_update` | `{ unreadCount }` | Set badge |
| `device_status_update` | Lock / access-control telemetry | Upsert by device `id` in `data.devices[]` |
| `units_update` | Unit summary / counts payload | Replace units section |
| `activity_new` | Single new activity row | Prepend to feed (cap list length) |
| `access_session_upsert` | Access session created/updated | Upsert by `data.session.id`; drive Waiting for unlock → Open from `session.state` |
| `access_codes_update` | Full entitled code list for user@facility | Replace codes section |
| `key_sharing_update` | Key-share list for user@facility | Replace key-sharing section |
| `gateway_status_update` | Facility gateway rows | Replace / upsert gateways |

**Note:** `activity_update` exists in shared type enums for dashboard parity but **live `/ws/app` fanout uses `activity_new`** plus the activity slice inside `app_snapshot`. Do not wait for a separate `activity_update` on this channel.

**Waiting for unlock:** a remote grant creates `state: pending` on the instance that handled the HTTP unlock. The physical unlock is applied on the instance that holds `/ws/gateway`. In-memory fanout does **not** cross instances, so you can miss `access_session_upsert` / `device_status_update` / `activity_new` until reconnect. Handle `access_session_upsert` (and `accessSessions` on `app_snapshot`). While any visible session is `pending`, poll `GET /api/v1/access-sessions` (or `/:id`) every ~2s — a full refresh already shows the settled row. Same-state unlocks (device already unlocked) do **not** emit `activity_new`; they do emit `access_session_upsert`. If a session row is superseded or deleted between the event and the fanout read, no `access_session_upsert` is sent at all — never infer deletion from a missing event; treat REST and the next `app_snapshot` as authoritative.

**Not on `/ws/app` (dashboard `/ws` only):** FMS sync, firmware push progress, gateway recovery/telemetry/device-sync logs, command queue, `general_stats`, `dashboard_layout`, `gateway_debug`, `dev_notifications`, multi-type parallel subscriptions.

---

## 6. Initial `app_snapshot`

`event: "app_snapshot"` — treat as source of truth after subscribe / reconnect.

List slices for history feeds are intentionally small (last **10** notifications and activities). Page older history via REST. **Key sharing** stays the full active set (who you are sharing with / shared to). Devices, access codes, and gateways remain the full entitled set for the facility (RBAC-filtered).

```ts
{
  facilityId: string;
  notifications: {
    unreadCount: number;
    recentNotifications: Array<{   // max 10, non-expired
      id: string;
      type: string;
      title: string;
      message: string;
      priority: string;
      isRead: boolean;
      readAt?: string | null;
      facilityId?: string | null;
      reference: { type: string; id: string } | null;
      metadata: unknown;
      createdAt: string;
    }>;
  };
  devices: object[];           // role-scoped (see §7); each row includes device_category
  units: {                     // counts + compact unlocked rows (id, unit_number, status, …)
    unlockedUnits: object[];
    totalUnits: number;
    occupiedUnits: number;
    availableUnits: number;
    maintenanceUnits: number;
    reservedUnits: number;
    unlockedCount: number;
    lockedCount: number;
    lastUpdated: string;
  };
  activity: {
    activities: object[];      // max 10
    count: number;             // total matching (may be > activities.length)
  };
  accessSessions: {
    sessions: object[];        // max 10, same shape as GET /access-sessions
    currentlyOpen: number;     // no total: snapshots skip the pagination COUNT
  };
  accessCodes: {
    codes: object[];
    count: number;
  };
  keySharing: {
    sharings: object[];        // all active shares (entitled)
    total: number;
    lastUpdated: string;
  };
  gateways: Array<{
    id: string;
    facilityId: string;
    name: string;
    status: string;              // persisted DB status (online/offline/…)
    lastSeen?: string | null;
    connected: boolean | null;   // live /ws/gateway session (null only if liveness lookup fails)
    lastActivityAt?: string | null; // live pong time when available, else lastSeen
  }>;
  lastUpdated: string;
}
```

Exact nested shapes for devices/units/codes align with the corresponding REST resources used by the app; when in doubt, prefer REST field names you already parse. Ignore unknown keys on device rows (live updates may add fields over time).

**Gateway `status` vs `connected`:** `status` is the persisted gateway row (updated on connect/disconnect, with a short offline grace so Cloud Run recycles do not flap it). `connected` is live product liveness — `true` while an inbound `/ws/gateway` socket is open or still inside that grace window. Prefer `connected` for “is the gateway reachable right now”; use `status` / `lastSeen` when you need the last known persisted state.

---

## 7. Role matrix (what you receive)

Server filters every event. The app should still not assume “facility admin” payloads on a tenant login. For tenants/maintenance, **`units_update` is suppressed** unless the triggering change maps to an accessible unit — so lock/telemetry on someone else’s unit must not produce a units event (even with an empty/unchanged payload).

| `event` | Tenant | Facility admin / maintenance | Admin / `dev_admin` |
|---------|--------|------------------------------|---------------------|
| `app_snapshot` | Yes (narrow devices/units) | Yes | Yes (facility filter) |
| Notification events | Own user; facility-scoped; type visibility (`backend_error` → **dev_admin** only) | Own user + ops-visible types | Same |
| `device_status_update` | Devices on **accessible units** only (assignments + active key shares). Devices **without** `unit_id` are **not** sent to tenants | All devices in facility | Facility filter |
| `units_update` | Only when an **accessible unit** changed (not facility-wide / other units) | Facility admins: facility units (incl. facility-wide). Maintenance: same as tenant (accessible unit only) | Facility filter |
| `activity_new` | Own units or own actor | Facility (maintenance: own actor on live stream) | Facility filter |
| `access_session_upsert` | Own units or own actor | Facility (maintenance: own actor) | Facility filter |
| `access_codes_update` | Entitled codes | Facility keypad codes | Facility filter |
| `key_sharing_update` | Primary / recipient rules | Facility | Facility filter |
| `gateway_status_update` | Facility gateways | Facility | Facility filter |

---

## 8. Example payloads

### `device_status_update`

```json
{
  "type": "app_event",
  "subscriptionId": "app-…",
  "facilityId": "…",
  "event": "device_status_update",
  "data": {
    "devices": [
      {
        "id": "…",
        "device_category": "blulok",
        "lock_status": "locked",
        "unit_id": "…",
        "facility_id": "…"
      }
    ],
    "count": 1,
    "updatedDeviceId": "…",
    "facilityId": "…",
    "lastUpdated": "…"
  },
  "timestamp": "…"
}
```

`device_category` is `"blulok"` or `"access_control"` (same values as REST device lists). Snapshot `devices[]` uses the same shape. Merge by device `id`. Payload may include reachability enrichment fields; ignore unknown keys safely.

### `notification_created`

```json
{
  "type": "app_event",
  "subscriptionId": "app-…",
  "facilityId": "…",
  "event": "notification_created",
  "data": {
    "notificationId": "…",
    "type": "access_granted",
    "title": "Access Granted",
    "message": "…",
    "priority": "normal",
    "facilityId": "…",
    "reference": { "type": "unit", "id": "…" },
    "metadata": null,
    "timestamp": "…"
  },
  "timestamp": "…"
}
```

Expect a follow-up `notifications_count_update` for badge accuracy.

### `activity_new`

```json
{
  "type": "app_event",
  "event": "activity_new",
  "data": {
    "activity": {
      "id": "…",
      "entityType": "…",
      "entityId": "…",
      "activityType": "…",
      "title": "…",
      "description": "…",
      "actor": { "type": "…", "id": "…", "name": "…" },
      "result": "…",
      "facilityId": "…",
      "unitId": "…",
      "deviceId": "…",
      "occurredAt": "…"
    },
    "accessLog": null,
    "timestamp": "…"
  }
}
```

---

## 9. Recommended client architecture

```text
┌─────────────────────────────────────────┐
│  AppRealtimeClient                      │
│  - connect(token)                       │
│  - subscribe(facilityId)                │
│  - unsubscribe()                        │
│  - onEvent(handler)                     │
│  - heartbeat timer (25s)                │
│  - reconnect with backoff + jitter      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  FacilityRealtimeStore (per facility)   │
│  - applySnapshot(data)                  │
│  - applyEvent(event, data)              │
│  - UI observes store (not raw WS)       │
└─────────────────────────────────────────┘
```

**Merge rules**

1. On `app_snapshot` → replace that facility’s store entirely.
2. On list-replace events (`access_codes_update`, `key_sharing_update`, often `units_update` / `gateway_status_update`) → replace that slice.
3. On `device_status_update` → upsert devices by id.
4. On `activity_new` / `notification_created` → prepend; trim to a max length; optional REST pagination for history.
5. Never apply live events **before** the first snapshot for that subscription id (buffer or drop).

**Facility switch**

1. Unsubscribe (or close socket).
2. Clear UI or show loading.
3. Subscribe to new `facility_id`.
4. Wait for new snapshot.

**Background / app resume (mobile)**

- If the OS suspended the socket, reconnect and re-subscribe.
- Always trust the new snapshot over cached memory after long background.

---

## 10. Errors and close codes

### Control errors (socket stays open)

```json
{ "type": "error", "error": "<message>" }
```

| Message (typical) | Cause | App action |
|-------------------|-------|------------|
| `facility_id is required` | Bad subscribe body | Fix client |
| `Access denied to facility` | User cannot access facility | Pick another facility / re-login |
| `An app subscription is already active; …` | Second subscribe | Unsubscribe first |
| `Only subscriptionType "app" is supported…` | Wrong type | Use `"app"` |
| `No active app subscription` | Unsubscribe with none | Ignore or fix state |
| `Failed to load app snapshot` | Server snapshot failure | Retry subscribe / reconnect |

### Close codes

| Code | Meaning | App action |
|------|---------|------------|
| `1008` | Auth failed / missing token | Refresh login, reconnect with new JWT |
| `1001` | Idle timeout (no client heartbeat) | Reconnect; ensure heartbeat timer |
| Other | Network / Cloud Run recycle / deploy | Backoff reconnect + re-subscribe |

---

## 11. Reconnect playbook

1. Detect close (including idle `1001` and Cloud Run request time limits).
2. Exponential backoff with jitter (e.g. 1s → 30s cap).
3. Open `/ws/app?token=<current JWT>` (refresh token first if expired).
4. Send `subscription` with the same `facility_id`.
5. On `app_snapshot`, **replace** local facility state.
6. Resume heartbeat timer.

Do **not** try to “catch up” missed events without a snapshot — the snapshot is the catch-up mechanism.

---

## 12. Resilience (server restart / multi-instance)

| What | Survives restart? | Client impact |
|------|-------------------|---------------|
| JWT / user / facility DB | Yes | Re-auth if token expired |
| In-memory `/ws/app` subscribers | **No** | Socket drops → reconnect + subscribe |
| Domain data (devices, notifications, …) | Yes (MySQL) | New `app_snapshot` reloads |

Missed live events during downtime are recovered by the post-reconnect snapshot, not by a durable event log on this channel.

With multiple Cloud Run instances and **no** sticky sessions, subscribe on instance A then fanout on instance B can miss events. Use **session affinity** (same guidance as gateway WS).

---

## 13. How this differs from dashboard `/ws`

| | App `/ws/app` | Dashboard `/ws` |
|--|---------------|-----------------|
| Audience | Mobile tenant / FA app | Admin web UI |
| Auth | `?token=` JWT | Same style on `/ws` |
| Subscriptions | One multiplexed `app` stream | Many types (`device_status`, `notifications`, …) |
| Envelope | `app_event` + inner `event` | Per-type top-level messages |
| Idle tear-down | **Yes** (60s without client heartbeat) | **Yes** (15s without client heartbeat; `DASHBOARD_WS_IDLE_MS`, heartbeat every 5s) |
| Snapshot | `app_snapshot` on subscribe | Per-subscription initial payloads |

Reuse payload field familiarity where names align; do not reuse dashboard subscription client code against `/ws/app` without adapting the envelope.

---

## 14. Acceptance checklist (app)

- [ ] Connect only to `/ws/app` with JWT query param
- [ ] Subscribe with `subscriptionType: "app"` and `facility_id`
- [ ] Handle ack then `app_snapshot` before showing “live” UI
- [ ] Send client heartbeats every ≤30s
- [ ] Reconnect on close; re-subscribe; replace store from snapshot
- [ ] Facility switch = unsubscribe → subscribe
- [ ] Tenant device list only shows unit-bound entitled devices
- [ ] Notification badge driven by `notifications_count_update`
- [ ] Ignore dashboard-only event types
- [ ] Handle `1008` with re-login; `1001` with reconnect + heartbeat fix
- [ ] Optional: exercise against backend e2e `/ws/app` section

---

## 15. Quick integration sketch (TypeScript-ish)

```ts
const ws = new WebSocket(`${APP_WS_URL}?token=${encodeURIComponent(jwt)}`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscription',
    subscriptionType: 'app',
    data: { facility_id: facilityId },
  }));
  heartbeatTimer = setInterval(() => {
    ws.send(JSON.stringify({ type: 'heartbeat' }));
  }, 25_000);
};

ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.type === 'error') { /* surface msg.error */ return; }
  if (msg.type === 'heartbeat') return;
  if (msg.type === 'subscription') { /* store msg.subscriptionId */ return; }
  if (msg.type === 'app_event') {
    if (msg.event === 'app_snapshot') replaceFacilityStore(msg.data);
    else applyFacilityEvent(msg.event, msg.data);
  }
};

ws.onclose = () => {
  clearInterval(heartbeatTimer);
  scheduleReconnect();
};
```
