# Gateway ↔ Cloud backend integration

This document ties together the **mesh-manager gateway** (Docker bundle under `gateway/mesh-manager-bundle/`) and the **BluLok Node backend**, especially when the backend runs on **Google Cloud Run**.

## Endpoints the gateway must use

| Purpose | URL pattern | Notes |
|--------|-------------|--------|
| WebSocket | `wss://<BACKEND_HOST>/ws/gateway` | Use `wss` when the API is HTTPS. Path must be exactly `/ws/gateway`. |
| Provision WS (ZTP) | `wss://<BACKEND_HOST>/ws/gateway-provision` | Sticker waiting room; see [Gateway ZTP](./gateway-ztp-sticker-design.md). |
| REST (via env `CLOUD_API`) | `https://<BACKEND_HOST>/api/v1` | Same host as the API; internal routes are reached through the WS `PROXY_REQUEST` tunnel. |

**Sticker zero-touch provisioning (implemented):** [Gateway ZTP sticker architecture](./gateway-ztp-sticker-design.md) — ECDSA P-256 public key on sticker, provision WS, `POST /gateways/claim`, challenge-response ops AUTH. Legacy human JWT AUTH remains the default lab path.

**Firmware implementers:** [Gateway ZTP — firmware developer guide](./gateway-ztp-firmware-developer-guide.md) (wire formats, state machine, signing bytes, Release/Revoke). For **OTA delivery mode v2** (HTTPS signed URL): [Gateway Firmware OTA v2 — firmware developer guide](./gateway-firmware-ota-v2-developer-guide.md).

Set these in **`gateway/mesh-manager-bundle/docker-compose.yml`** (or override with env):

- `CLOUD_WS` — full WebSocket URL, e.g. `wss://YOUR-SERVICE-URL.run.app/ws/gateway`
- `CLOUD_API` — REST base, e.g. `https://YOUR-SERVICE-URL.run.app/api/v1`

### Facility UI (operator copy-paste)

In the web app, **Facility → Gateway → Overview** shows the same **WSS URL** (`…/ws/gateway`) and **backend API URL** (`…/api/v1`) as copyable fields, derived from the deployment the UI is using (`VITE_API_URL` / runtime config). Use those values when configuring an on-site gateway so they always match the environment you logged into.

**Do not rely on the default URLs in compose** unless they match your deployed service. Defaults were examples; your Cloud Run URL is shown in **Cloud Console → Cloud Run → service → URL**.

### URL naming drift to avoid

- Repo `cloudbuild.yaml` builds with `_API_URL: 'https://blulok-backend-${_REGION}.run.app'` — you must confirm the **actual** HTTPS URL for your project (Cloud Run may include a hash or project segment).
- Older compose defaults used a different host/region (e.g. `blulok-cloud-backend-dev-….us-west1.run.app`). **Always copy the live URL** from Cloud Run.

## WebSocket authentication (required)

The server **does not** authenticate using `?token=` on the WebSocket URL. After the TCP/TLS upgrade, the **first** application message must be one of:

### A. Legacy human JWT (lab / existing fleets — default)

```json
{
  "type": "AUTH",
  "token": "<JWT from POST /api/v1/auth/login against THIS backend>",
  "facilityId": "<facility UUID from BluLok DB>",
  "gatewayId": "<device's stable UUID — required on every AUTH>",
  "firmware_version": "<running gateway firmware — optional; canonical seed for gateways.firmware_version>"
}
```

When `GATEWAY_ZTP_REQUIRED=true`, **first-install auto-bind** via this path is rejected (`AUTH_FORBIDDEN` — ZTP claim required). Reconnect of an already-bound **legacy** (no `public_key`) gateway with a valid admin JWT still works. Gateways that have a `public_key` (ZTP-claimed) **must** use path B — human JWT `AUTH` is rejected.

### B. ZTP ECDSA challenge-response (after sticker claim)

```json
{ "type": "AUTH_HELLO", "gatewayId": "<claimed device UUID>", "firmware_version": "<optional>" }
```

Cloud responds with `AUTH_CHALLENGE { nonce }`. Gateway signs `"blulok-gw-auth-v1" || 0x00 || nonce || 0x00 || gatewayId` with its P-256 private key and sends:

```json
{ "type": "AUTH_PROOF", "signature": "<base64url DER ECDSA>" }
```

Requires a prior successful `POST /api/v1/gateways/claim` that stored `gateways.public_key`.

Both modes then receive `AUTH_OK` (ops public keys, session role, etc.) as before.

### E2E / simulator

- `npm run ws:e2e` — legacy JWT gateway AUTH (default)
- `npm run ws:e2e:ztp` — `E2E_GATEWAY_AUTH=ztp` provision → claim → ECDSA AUTH for the primary gateway
- Gateway simulator: optional `authMode: 'ztp_keypair'` on create (default `legacy_jwt`). ZTP instances start in **provisioning** lifecycle — Connect opens `/ws/gateway-provision` WAITING; claim via Connection panel or API; cloud `ztp_released` returns the sim to factory/provisioning with the same sticker keys.
**Gateway firmware:** When `firmware_version` is present, the cloud **always** writes it to the bound gateway row on AUTH (connect/reconnect). This is the canonical version reported by the device. Cloud-initiated OTA may update `gateways.firmware_version` after a successful push; the **next AUTH overwrites** that value with the gateway's live seed.

Successful path:

1. Server responds with `AUTH_OK` (includes `gatewayId`, `sessionRole`, optional `autoRegistered`, and ops public key material for signed commands).
2. Further messages: `PROXY_REQUEST`, firmware ACKs, `PONG`, etc. (see `backend/src/services/gateway/websocket-gateway.transport.ts`).

### Auto-registration (unknown `gatewayId`)

When `gatewayId` is a **valid UUID** the cloud has never seen:

- **Facility already has a bound gateway** → cloud creates an **unbound** swap-candidate row, parks the session (`sessionRole: swap_candidate`), and triggers recovery detection. The live gateway session is unchanged.
- **Facility has no bound gateway** → cloud **creates and binds** the row as the facility gateway (`sessionRole: active`).

`AUTH_OK.autoRegistered` is `true` only on the connect that **created** the row. Reconnects with the same GUID are idempotent (`autoRegistered` omitted/false).

Guardrails: JWT must be `facility_admin` (scoped), `admin`, or `dev_admin`; max **3** parked swap candidates per facility; max **5** auto-creates per facility per **10 minutes**. Errors: `AUTH_BAD_REQUEST` (malformed UUID), `AUTH_FORBIDDEN` (wrong facility / cap), `AUTH_RATE_LIMITED`, `AUTH_FAILED` (persistence error).

See [Gateway Swap / Recovery — Operator & Developer Guide](./gateway-swap-recovery-operators-guide.md) and [Gateway auto-registration design](./gateway-auto-registration-design.md).

### Who may connect

- Roles allowed: **`facility_admin`**, **`admin`**, **`dev_admin`** (see `AUTH` handler in `websocket-gateway.transport.ts`).
- **`facility_admin`**: live DB association check for the `facilityId` sent in `AUTH` (JWT `facilityIds` are not used).

If anything is wrong, the socket receives `ERROR` with codes such as `AUTH_FAILED`, `AUTH_FORBIDDEN`, `AUTH_BAD_REQUEST`, `AUTH_RATE_LIMITED`, then the connection is closed.

## REST + proxy

On-site gateways typically call internal APIs through **`PROXY_REQUEST`** on the same WebSocket. The backend re-injects the caller identity and enforces facility scope (`ApiProxyService` + `FacilityGuardService`). Ensure `CLOUD_API` matches the deployment the JWT was issued for.

### Lock status and unit telemetry (dashboard WebSocket, not gateway socket)

Gateways **do not** push lock state over operator REST from the browser. They use **`/ws/gateway`** and **`PROXY_REQUEST`** to reach internal routes (for example device state sync). The backend persists changes, then broadcasts to **dashboard** clients on the operator WebSocket (`/ws` / `WebSocketContext`) as **`device_status_update`** (payload includes `devices[]`) and **`units_update`** when unit summaries change. The same device/unit/gateway fanout also feeds the **mobile app** channel [`/ws/app`](./app-realtime-websocket.md) ([mobile developer guide](./app-realtime-developer-guide.md) — JWT auth, facility subscribe, heartbeat idle tear-down; recommend session affinity when `max-instances > 1`).

Any UI that shows BluLok lock or device telemetry should go through **`useLockDeviceRealtime`** and **`normalizeDeviceStatusWsPayload`** (`frontend/src/hooks/useLockDeviceRealtime.ts`, `frontend/src/utils/deviceStatusWs.utils.ts`) so subscription scope, debouncing, and payload parsing stay consistent.

### Device reachability when gateway is offline (dual-status model)

When the facility gateway is unreachable, child devices may still have **last-reported** telemetry in the DB (`online`, `low_battery`, etc.). Operator-facing reads apply **reachability coercion** at the display boundary so lists, widgets, stats, and WebSocket payloads show **effective** connectivity in the existing field names.

| Layer | Behavior |
|-------|----------|
| **DB / ingest / snapshot** | Columns such as `blulok_devices.device_status`, `access_control_devices.status`, and `gateway_inventory_devices.state` remain **last-reported telemetry only**. `InventorySnapshotService.buildSnapshotPayload` and gateway ingest paths read **raw DB** — never enriched DTOs. |
| **REST + dashboard WS** | Responses overwrite **effective** status into existing fields (`device_status`, `status`, `is_online` on units). Detail endpoints and WS rows also include optional **`reported_device_status`** / **`reported_status`** and **`status_unreachable_reason`** when they differ. |
| **Coercion rules** | If the gateway is reachable, effective = reported. If unreachable and reported is `online`, `low_battery`, or infra-equivalent healthy state, effective → `offline` with reason `gateway_offline`, `gateway_maintenance`, or `gateway_error`. Already-offline/error reported states are not coerced. Lock position, battery, and signal are **never** coerced. |
| **Grace period** | During **`GATEWAY_OFFLINE_GRACE_MS`** (default **20s**), product liveness (`GatewayEventsService.getFacilityProductLiveness()`) stays **connected** so UI pills and device reachability do **not** flap. Raw transport status (`getFacilityConnectionStatus()`) still reports the socket as down for command routing. After the grace window with no reconnect, DB `gateways.status` flips offline and product liveness follows. Dev/e2e can temporarily override via **`PUT /api/v1/dev/gateway-offline-grace`** `{ "grace_ms": <ms\|null> }` (ADMIN / DEV_ADMIN; process-local; `null` restores default). |

Implementation: `backend/src/utils/device-reachability.utils.ts`, `backend/src/services/device-reachability-enrichment.service.ts`. Gateway connect/disconnect triggers **`broadcastFacilityDeviceReachabilityRefresh`** so clients update without waiting for per-device telemetry.

Recovery **inventory-preview** (`GET /api/v1/gateways/:id/recovery/inventory-preview`) intentionally returns **raw snapshot payload** (`properties.online` from DB) — not display-coerced values — so operators see what will be pushed to a restored gateway.

See also [Gateway device sync developer guide](./gateway-device-sync-developer-guide.md) — cloud display coercion does **not** affect gateway sync payloads.

### Gateway status (`gateway_status_update`) — backend behavior

- **`GatewayStatusSubscriptionManager.broadcastUpdate`** always **`invalidateCache()`** first, then loads gateways from the DB, so **HTTP polling** and **inbound `/ws/gateway`** both publish **current** rows (no stale 5s `findAll` cache).
- **Targeted broadcasts** (`facilityId` set): skip a dashboard client only if **`facilityIds.length > 0`** and the facility is **not** in that list. An **empty `facilityIds` array** must **not** skip (JavaScript: `[]` is truthy; older logic mis-fired).
- **`findByFacilityId`** uses **`orderBy('updated_at', 'desc')`** before `.first()` so inbound WS DB sync picks a **deterministic** row if multiple gateway rows ever share a facility (normally one per facility).
- **`GatewayModel.updateStatus`** for non-**online** states updates **`status` + `updated_at` only** — **`last_seen`** stays as last known good contact.
- **Heartbeat** (`websocket-gateway.transport.ts`): if a facility’s socket is **not OPEN**, the transport **removes** it and emits **`notifyConnectionChange(..., false, 'socket_not_open')`** so **`gateways.status`** can go **offline** like a normal disconnect.
- **Offline grace (`GATEWAY_OFFLINE_GRACE_MS`, default 20s):** inbound `/ws/gateway` disconnects **do not** immediately persist `gateways.status = offline`, fan out **Gateway Offline** in-app alerts, or flip product-facing **`connected`** / device reachability. The backend waits for reconnect; only after the grace window (still disconnected) does it update DB status, create notifications, and treat the outage as real. **`getFacilityProductLiveness()`** (used by `gateway_status_update` and device reachability enrichment) stays `connected: true` during grace; **`getFacilityConnectionStatus()`** remains the raw socket signal for commands/firmware. Dashboard toasts fire when the broadcast reports confirmed offline (no second client-side debounce). For e2e/local speed-ups, **`PUT /api/v1/dev/gateway-offline-grace`** `{ "grace_ms": <0–120000|null> }` overrides the process value (`null` clears).

## Google Cloud Run–specific issues

### 1. Multiple instances and in-memory gateway state

`WebsocketGatewayTransport` keeps **connected gateways in process memory** (`facilityToClient`). If Cloud Run scales to **more than one instance**, a command or debug stream might hit an instance where **that facility is not connected**.

Mitigations:

- Prefer **`--min-instances=1`** and/or **`--max-instances=1`** for the backend service **until** gateway routing is centralized (e.g. Redis pub/sub or a dedicated gateway service).
- Or enable **session affinity** for the service so the same client tends to reach the same instance (still not a full substitute for shared state).

### 2. Request timeout (≈5 minute disconnects)

On Cloud Run, a WebSocket counts as **one HTTP request** for its whole lifetime. The service **`--timeout`** is a **wall-clock limit** from upgrade to close (default **300 seconds / 5 minutes**). **Ping/Pong and JSON heartbeats do not reset this timer** — only raising the timeout helps.

If gateway debug shows **`connection_closed` ~5 minutes after `connection_opened`** while pings still succeed, this is almost always the **default Cloud Run timeout**.

**Fix:** set the backend service timeout to the max you need (platform max is **3600s / 60 minutes** today):

```bash
gcloud run services update blulok-backend --region=YOUR_REGION --timeout=3600
```

Or in **Console → Cloud Run → service → Edit & deploy new revision → Request timeout**.

Repo **`cloudbuild.yaml`** deploys the backend with **`--timeout 3600`** so CI/CD matches this requirement. If you deploy manually, add the same flag.

After **60 minutes** (or whatever you set), Cloud Run will still close the socket; the **Java gateway must reconnect** (you already see reconnects within a few seconds — that part is fine).

### 3. “Permanent” persistence — what is actually possible

**Fact:** On **Cloud Run**, a WebSocket is still a **single HTTP request**. Google enforces a **maximum request duration** (today **up to 3600 seconds / 1 hour**). There is **no setting** for an infinite connection. Heartbeats only help **middleboxes**, not this limit.

So **permanent** in production means one of these:

| Approach | What you get |
|----------|----------------|
| **A. Cloud Run + reconnect (typical)** | Set **`--timeout=3600`**. Treat disconnects as **normal**. Gateway **must** reconnect immediately (or with short backoff), re-**`AUTH`**, and the backend must **resume** anything that was in flight (firmware OTA, etc.). From the **product** side the link is “always on” if reconnect is **under a few seconds** and users don’t see wrong `offline` state. |
| **B. Move `/ws/gateway` off serverless** | Run the WebSocket server on **GKE**, **Compute Engine**, or another host **without** Cloud Run’s hard request timeout. REST API can stay on Cloud Run; use **internal networking** or **Redis pub/sub** so API instances can **publish commands** to the WS process that holds the gateway connection. |
| **C. Different transport** | **MQTT**, **polling**, or **outbound-only** from gateway — no eternal TCP through Cloud Run. Larger architectural change. |

**Recommended path for BluLok today**

1. **Deploy backend with `--timeout=3600`** (see `cloudbuild.yaml` and §2 above).
2. **Gateway (Java):** ensure **automatic reconnect** on any close (`1006`, normal close, timeout), then **same AUTH flow**; avoid long sleeps before reconnect.
3. **Backend:** keep **idempotent reconnect** behavior (you already resume firmware on `AUTH` for a facility — extend that mindset to any other long-lived work).
4. **Stability:** **`--min-instances=1`** on the backend reduces cold starts when gateways reconnect; consider **`--max-instances=1`** until command routing is **not** purely in-memory (or add **Redis**/shared bus so any instance can reach the right connection).

If you **must** avoid hourly disconnects entirely, plan **B** — a small always-on **gateway-connector** service (VM or GKE) that holds WebSockets and talks to the rest of BluLok over HTTPS — is the durable fix.

### 4. Trust proxy (recommended)

Behind Cloud Run’s load balancer, set **`TRUST_PROXY_DEPTH=1`** (or higher if you chain proxies) so `express` and any IP-based logic see correct client metadata. Configure via Cloud Run env vars.

### 5. TLS

Use **`wss://`** to match **`https://`** on the same host. Mixed `ws` to `https` hosts will fail or be blocked.

## Local debugging

1. Point `CLOUD_WS` / `CLOUD_API` at your machine:  
   `ws://host.docker.internal:3000/ws/gateway` and `http://host.docker.internal:3000/api/v1` on typical local dev (`PORT` in `backend/.env`; adjust if yours differs).
2. Log in to the **same** backend, copy JWT + facility UUID, configure the mesh gateway to send `AUTH` as above.
3. Backend logs: `Gateway WS upgrade`, `Gateway WS authenticated`, or `AUTH_FAILED` / `AUTH_FORBIDDEN`.

## Gateway row `status` vs inbound WebSocket

**Liveness has a single source of truth: the live inbound `/ws/gateway` session.** If a gateway is sending *any* traffic within the keepalive window (AUTH, PROXY, firmware/ACK messages, JSON `PONG`, or RFC6455 pong frames), it is **online** — for **every** gateway type. Outbound polling is deprecated/disabled, so it never drives liveness.

| Source | What it is | Use in UI |
|--------|------------|-----------|
| **`GET /facilities/:id` → `deviceHierarchy.gateway.status`** | Snapshot of the `gateways` row bundled with the device tree | **Do not use for liveness badges** — load-time snapshot; identity/membership only |
| **`gateway_status` WebSocket (`gateway_status_update`)** | Real-time broadcast; payload carries live session signal **`connected`** + **`lastActivityAt`** alongside DB `status`/`lastSeen`. Facility setup passes `{ facility_id }` (ADMIN / DEV_ADMIN / FACILITY_ADMIN only for that filter). | **Primary** — drives the badge; no HTTP poll |
| **`GET /gateways/status/:facilityId`** | In-memory inbound `/ws/gateway` session (`GatewayEventsService.getFacilityConnectionStatus`) | Still available for diagnostics / one-shot checks; **not** polled by the facility UI |

### Why the indicators were wrong before

For physical/simulated gateways the badge was driven **only** by the 5s HTTP poll — the real-time `gateway_status_update` broadcast carried just the DB row and was ignored by the resolver, so connect/disconnect never moved the badge instantly, and any transient cloud-API poll error flapped it to offline. **HTTP-typed** gateways could *never* show online: inbound WS skipped their DB status and outbound polling is disabled. Missing `gateway_type` skipped DB sync entirely.

**Fix:** the broadcast payload now includes the live `connected`/`lastActivityAt` signal, the frontend resolver uses a single `connected: boolean | null` input for all gateway types (falling back to the persisted DB status only while liveness is *unknown*), and poll errors no longer force offline.

**Removed from UI:** reading `deviceHierarchy.gateway.status` for badges. **`deviceHierarchy.gateway` remains** for device tree context (Add Device modal, access-control lists) — identity and membership, not live liveness.

### DB sync (backend)

For **all** gateway types with a `gateways` row (physical, simulated, http, or untyped), **`AUTH`** on `/ws/gateway` sets the row **`status` → online** and **`last_seen`**; disconnect/heartbeat-timeout sets **`offline`** (preserving `last_seen`). Each transition invalidates the status cache and broadcasts `gateway_status_update`.

**`AUTH` does not set `gateways.facility_id`** on every connect (no silent link of arbitrary unassigned inventory). Binding happens via **Swap / Recovery finalize/bypass**, first-install auto-bind when the facility has no gateway, or admin `POST /gateways` / seed. Until bound, **`findByFacilityId`** may not resolve a production gateway for device sync.

**On connect,** if a **bound** row exists for the facility, the server **does** update **`status` → online** and **`last_seen`** so the dashboard shows **online** right away — that is **liveness**, not creation of the `facility_id` association. Unbound swap candidates (`facility_id` NULL) stay unbound until recovery completes.

### New facility + mesh “connected” (possible confusion)

- **`AUTH` on `/ws/gateway`** only needs a valid JWT and a `facilityId` that matches your role. It does **not** require a row in **`gateways`** for that facility.
- So you can create a **new facility**, point the mesh at that facility UUID, and the **inbound WebSocket session is “connected”** from the cloud’s point of view (`GET /api/v1/gateways/status/:facilityId` reads in-memory state).
- The **Facility → Gateway** tab loads **`GET /api/v1/gateways?facility_id=...`**. If no gateway row is bound yet, the UI shows **“No gateway assigned”** even though the mesh session is up — use **Swap / Recovery** to bind hardware.
- **Two different things:** (1) **session connected** = someone authenticated to `/ws/gateway` for this facility; (2) **gateway configured** = a **`gateways`** row exists with `facility_id` set (needed for device sync, firmware targeting, etc.). The dashboard now calls out this split when a session is active but no record exists.

## Facility UI gateway status (Facility tab + Gateway tab)

Both the Facility overview card and Gateway tab share **`useFacilityGatewayLiveStatus`**, which loads the assigned gateway via **`GET /gateways?facility_id=`** once and subscribes to facility-scoped **`gateway_status`** (`{ facility_id }`) while Facility or Gateway setup is open (ADMIN / DEV_ADMIN / FACILITY_ADMIN). No HTTP status polling.

**Display rule (`resolveEffectiveGatewayStatus`)** — one rule for every gateway type:

| `connected` (live session) | DB `status` | Badge |
|----------------------------|-------------|-------|
| `true` | any (except maintenance/error) | **online** |
| `false` | any (except maintenance/error) | **offline** |
| `null` (not yet known) | online / offline | mirrors DB `status` (no false "offline" flash) |
| any | `maintenance` / `error` | **maintenance** / **error** (admin override wins) |

Both tabs show the same **`online` / `offline` / `error` / `maintenance`** badge labels.

### Inventory sync history (Gateway tab → Inventory sync)

**`GatewayDeviceSyncHistory`** loads audit rows via **`GET /gateways/:id/device-sync-logs`**. While the tab is open:

- **Primary:** subscribes to **`gateway_device_sync_logs`** and prepends rows on **`gateway_device_sync_log_update`** (broadcast when `GatewayDeviceSyncLogService.recordInventorySync` completes after inventory ingest).
- **Backstop:** silent HTTP poll every **8s** only when the dashboard WebSocket is disconnected (no poll while connected).
- **UX:** only the first load shows a full spinner; background refresh keeps the table visible. The **Refresh** button spins only on manual clicks — not on live/poll updates. Manual refresh failures show a warning banner and toast while preserving loaded rows. **Load more** uses `hasMore` from the API.

**Separate from manual sync:** the **Sync** tab’s **`POST /gateways/:id/sync`** outbound pull is not recorded in this audit trail (and is blocked during gateway recovery, same as inventory sync).

### Dashboard WebSocket — device sync logs

Subscribe on the **operator** `/ws` channel (not `/ws/gateway`):

- **Type:** `gateway_device_sync_logs`
- **Filters:** `{ facility_id?, gateway_id? }`
- **Updates:** `gateway_device_sync_log_update` with `{ logs: [...] }` (new rows only)

## Gateway device sync (locks + access control)

**Start here (gateway firmware):** [Gateway device sync — developer guide](./gateway-device-sync-developer-guide.md) — inventory reconcile, non-destructive state API, manual devices, tombstones, workflows.

Unified internal routes (via `PROXY_REQUEST` or direct REST):

| Endpoint | Purpose |
|----------|---------|
**Field-level payload reference:** [`gateway-device-inventory-payload.md`](gateway-device-inventory-payload.md)

| `POST /api/v1/internal/gateway/devices/inventory` | Reconcile locks (`kind: lock`, `lock_id`) and access keypads (`kind: access_control`, `access_id`, optional `relay_channel` default 1) |
| `POST /api/v1/internal/gateway/devices/state` | Partial telemetry: locks use full telemetry; access uses `online` / `locked` only |
| `POST /api/v1/internal/gateway/access-events` | Credential-based access outcomes (grants, denials, keypad, admin remote open) — see [`gateway-access-events.md`](gateway-access-events.md) |
| `GET /api/v1/internal/gateway/access-codes` | Poll keypad codes after access devices exist |

**Removal policy:** inventory sync removes only auto-provisioned devices (`metadata.createdFromGatewaySync`). Manually created locks/access rows are never deleted by a gateway delta.

**Access inventory example:**

```json
{
  "facility_id": "<uuid>",
  "devices": [
    { "kind": "lock", "lock_id": "lock-serial-123" },
    { "kind": "access_control", "access_id": "KP-7F2A-001", "relay_channel": 2, "device_type": "door" }
  ]
}
```

After every access inventory sync (including unchanged reconnect payloads), and on active-gateway **`AUTH_OK`**, the backend enqueues a full access-code snapshot in **`access_code_push_outbox`** and attempts immediate WebSocket delivery. If the gateway is offline, the row stays **`pending`** until reconnect or the scheduler retries due rows. The gateway can still poll **`GET /api/v1/internal/gateway/access-codes`** as a fallback.

### Cloud inventory deletion (`DEVICE_DELETED`)

When an admin or facility admin removes a BluLok, access-control, or network-infra row via **`DELETE /api/v1/devices/blulok/:id`**, **`DELETE /api/v1/devices/access-control/:id`**, or **`DELETE /api/v1/devices/network-infra/:id`**, the backend deletes the cloud row and enqueues a tombstone in **`device_deletion_outbox`**. Delivery uses the same durable pattern as access-code pushes:

| Step | Behavior |
|------|----------|
| Enqueue | Row keyed by facility + device kind + `lock_id`, `access_id::relay_channel`, or infra `serial` |
| Online gateway | Signed JWT `{ cmd_type: "DEVICE_DELETED", device_kind, lock_id \| access_id + relay_channel \| serial, nonce }` over inbound WS |
| Gateway ACK | **`DEVICE_DELETED_ACK`** `{ nonce, success }` marks outbox **`delivered`** |
| Offline gateway | Row stays **`pending`**; **`AUTH_OK`** reconnect flush + scheduler retry |
| Re-add before ACK | Inventory sync or manual create cancels active tombstone (`cancelled`) |

Gateway firmware should maintain a local exclusion set and **omit tombstoned devices** from future **`POST /devices/inventory`** payloads. Sync-driven cloud deletes (`source: gateway_sync`) do **not** enqueue tombstones — the gateway already omitted the device.

Operational **`DEVICE_DELETED`** traffic is blocked during gateway recovery (same gating as `LOCK`, `ACCESS_CODE_UPDATE`, denylist commands).

On active-gateway **`AUTH_OK`**, the cloud also pushes a full **`DENYLIST_SYNC`** replace snapshot (same per-device shape as inventory `operational_devices`) so restarted gateways reconcile revocation state without waiting for a subsequent inventory POST.

## Gateway telemetry logs

On-site gateways can stream high-volume operational log lines to the cloud via **`PROXY_REQUEST`** → **`POST /api/v1/internal/gateway/add_log`**. The backend parses each line into **`logged_at`** + JSON **`payload`**, retains up to **10,000 rows per gateway**, and exposes a filterable read API plus a dashboard WebSocket stream.

### Ingest (`POST /internal/gateway/add_log`)

Facility-scoped like other internal gateway POSTs (`authenticateToken` + facility admin role + `X-Gateway-Facility-Id` from the proxy).

**Body shapes:**

| Shape | Example |
|-------|---------|
| Single line | `{ "message": "2026-05-26T09:53:21.653711 …" }` |
| Batch | `{ "messages": ["line1", "line2"] }` |
| Raw JSON string (Express edge case) | entire body is a JSON string |

Optional: `facility_id`, `tid` (echoed in response for gateway correlation).

Maximum **500 lines** per request (`message` or `messages[]`). Additional lines are truncated server-side if they slip through validation.

**Line grammar (best-effort parser):**

| Input | Parsed payload |
|-------|----------------|
| `{ISO} … \nHeader {HEX}, Payload {JSON}` | `{ header, message?, data: <object> }` |
| `{ISO} …` (no Header/Payload tail) | `{ message: "<remainder>" }` |
| Entire line is JSON object | payload = parsed object |
| Unparseable | `{ message: "<full raw line>" }` |

Messages are heterogeneous (BLE lock traffic, gateway events, errors, etc.) — there are **no dedicated DB columns** for `lock_id` or other optional fields; they live inside `payload` when present.

**Response:** `{ success: true, data: { ingested, ids[], gateway_id, facility_id, tid? } }`

### Read API

`GET /api/v1/gateways/:gatewayId/telemetry-logs`

Roles: **`admin`**, **`dev_admin`**, **`facility_admin`** (facility-scoped). Query params:

| Param | Default | Notes |
|-------|---------|-------|
| `limit` | 500 | max 500 |
| `offset` | 0 | load-more pagination |
| `from`, `to` | — | ISO range on `logged_at` (applied first) |
| `search` | — | text search across JSON payload |
| `payload_path`, `payload_value`, `payload_op` | — | JSON path filter (`eq` or `contains`) |

Response: `{ logs, total, limit, offset, hasMore }`.

### Dashboard WebSocket

Subscribe on the **operator** `/ws` channel (not `/ws/gateway`):

- **Type:** `gateway_telemetry_logs`
- **Filters:** `{ facility_id?, gateway_id? }`
- **Updates:** `gateway_telemetry_log_update` with `{ logs: [...] }` (new rows only)

    Facility → Gateway → **Gateway Logs** tab (visible when the user can manage the gateway). Live subscription is active only while that tab is open. Ingest accepts at most **500 lines per request**; the UI display caps at **1,000** rows in memory during live tailing.

### Storage

Table **`gateway_telemetry_logs`**: `id`, `gateway_id`, `facility_id`, `logged_at`, `payload` (JSON), `source` (default `gateway_ws`), `created_at`. Index `(gateway_id, logged_at DESC)`. Retention trim runs after each ingest batch.

### Cloud system logs (`source: cloud_system`)

The backend also appends **BluLok cloud–originated** lines to the same stream (same UI tab, live WS fan-out). Payloads mirror gateway lines (`header`, `message`, `data`) and set **`cloud_system: true`** at the top level and inside `data`.

| Event | When | Header |
|-------|------|--------|
| `gateway_connected` | Inbound `/ws/gateway` AUTH succeeds | `CLD01` |
| `gateway_disconnected` | WS close, error, heartbeat timeout, replacement, etc. | `CLD02` |
| `device_inventory_sync_completed` | After `POST /internal/gateway/devices/inventory` | `CLD04` |

Disconnect `data.reason` uses transport codes (`auth_ok`, `heartbeat_timeout`, `replaced`, `close_event`, …) with a human `reason_label`.

### Live debug feed (`gateway_debug`)

The Facility → Gateway → **DevTools/Diag** panel (DEV_ADMIN only) streams raw WebSocket lifecycle/heartbeat/message events via the **`gateway_debug`** subscription.

- **Filters:** `{ facility_id }` — **required for scoping**. The subscription is bound to a single facility and `GatewayDebugSubscriptionManager` filters every event **server-side**, so a viewer never receives traffic for gateways at other facilities. Events without a `facilityId` are not delivered to a facility-scoped subscription.
- **Security:** debug events carry remote addresses, user IDs, and message types. Server-side facility scoping (not just a client-side guard) prevents cross-facility traffic from leaking onto the wire. The frontend also keeps a defensive client-side `facilityId` check.

**Routine reconnect noise:** Pairs of `CLD02` (disconnect) followed by `CLD01` (connect) within **30 seconds** are hidden in the Gateway Logs UI and in the list API response. This filters normal GCP instance recycle / TCP teardown without hiding real outages. Backend: `filterRoutineGatewayWsReconnectLogs` in `gateway-telemetry-system-log.utils.ts`; frontend applies the same rule only when merging **live WebSocket** tail rows (API responses are pre-filtered).

## Automated regression tests

- **Inbound WS → DB status:** `backend/src/__tests__/services/gateway-events.service.inbound-db-sync.test.ts` — connect/disconnect updates `gateways.status` for physical/simulated, skips HTTP and missing rows; uses `jest.unmock('@/models/gateway.model')` because global `setup-mocks` replaces `GatewayModel` with a plain factory (no real prototype for `jest.spyOn`).
- **Gateway status cache:** `GatewayStatusSubscriptionManager.broadcastUpdate` always calls `invalidateCache()` before loading gateways so **HTTP/BaseGateway** DB updates and inbound WS both fan out **fresh** rows (not a stale 5s `findAll` cache). Tests live in `gateway-status-subscription-manager.test.ts`.
- **Dashboard client parsing:** `frontend/src/__tests__/services/websocket.service.test.ts` covers `gateway_status_update`, `device_status_update`, and `units_update` dispatch to `onMessage` handlers (same path the app uses for lock + gateway UI).
- **Units management realtime:** `frontend/src/__tests__/pages/UnitsManagementPage.test.tsx` mocks `WebSocketContext` and asserts facility-scoped `device_status` + `units` subscriptions (`useLockDeviceRealtime`).
- **Live backend E2E:** `backend/npm run ws:e2e` (`scripts/ws-gateway-e2e.js`) exercises `/ws/gateway` PROXY → `devices/state`, then dashboard `/ws` subscriptions for **`device_status_update`**, **`units_update`**, and **`gateway_status_update`** (plus stress paths). Includes **unified device sync**: mixed `devices/inventory` (locks + `kind: access_control` + **`bridge` / `friend_node` / `gateway` inventory update**), access-only state updates, relay delta add/remove, network-infra state/firmware refresh and sync-managed removal, and validation failures. **Gateway Swap Recovery** asserts `GET .../recovery/inventory-preview` includes bridge/friend_node (schema v2, facility gateway excluded) and that infra rows survive bypass/rebind. Includes **device commissioning** HTTP checks: `DELETE /devices/blulok/:id/unassign`, online/offline **`DELETE /devices/blulok/:id`** with **`DEVICE_DELETED`** / **`DEVICE_DELETED_ACK`**, facility-admin in-facility inventory delete, re-add cancels tombstone, post-tombstone sync, and access-control **`DELETE /devices/access-control/:id`**. While subscribed with **`device_id`** (same filter as `useLockDeviceRealtime` / the web app), it asserts **`lock_status`** after **HTTP** `PUT .../devices/blulok/:id/lock` and after **gateway** `devices/state` LOCKED/UNLOCKED, plus **`units_update`** after a gateway lock change. It also decodes route pass JWTs from **`POST /passes/request`** and asserts **`user_role`** (`tenant` for primary/shared users; **`facility_admin`** for the provisioned facility admin). **Access-code outbox:** disconnects inbound WS, facility admin **`PUT /access-codes/manual/set`** (same as Access Code UI) while offline → DB updated, **`push-state=pending`**, no unicast; reconnect **`AUTH_OK`** flushes outbox → **`ACCESS_CODE_UPDATE`** + **`push-state=active`**. Defaults: read **`PORT`** from the **`backend/.env` file** (local dev template uses **3000**; not shell `PORT`, so another process cannot steal the port), then `127.0.0.1`. Override with **`E2E_API_PORT`** / **`BACKEND_PORT`**, or **`API_BASE_URL`** (WebSocket defaults follow the same host:port unless `WS_URL` / `UI_WS_URL` are set), or **`E2E_HOST`** for host-only.
- **Facility Gateway tab UI:** `frontend/src/__tests__/components/Gateway/FacilityGatewayTab.test.tsx` — amber “Inbound WebSocket session is active” when `getGatewayWsStatus.connected` but no gateway row; “Gateway status (database)” when a row exists. ZTP gateways (`public_key` set) show **Release from facility** on Overview (`POST /gateways/:id/release`).

## Quick checklist

- [ ] `CLOUD_WS` / `CLOUD_API` host matches the **deployed** backend URL.
- [ ] JWT from **that** backend; not expired; role `facility_admin` | `admin` | `dev_admin`.
- [ ] `facilityId` is a real facility UUID; for `facility_admin`, the user has a live DB association to that facility.
- [ ] First message after connect is **`AUTH`** JSON (not query-string token).
- [ ] If connections flap or commands never arrive on Cloud Run, check **instance count** and **timeouts** (`--timeout=3600` for gateway WS).
- [ ] For “always connected” behavior on Cloud Run: accept **hourly** TCP recycle and rely on **fast gateway reconnect** + **`min-instances`**. For **no** hard cap, plan a **non–Cloud Run** WebSocket tier (see §3).

## Troubleshooting (from production checks)

### `key_generation_required` on login (mesh / gateway sim)

`POST /api/v1/auth/login` without `X-App-Device-Id` used to always set `key_generation_required: true` for every user (legacy after removing `users.key_status`). Some gateway UIs treat that as “must complete mobile key onboarding” and **block** “Register with Cloud”.

**Backend behavior (updated):** for `facility_admin`, `admin`, and `dev_admin`, login **without** `X-App-Device-Id` no longer sets `key_generation_required`. Deploy the backend that includes this change so facility admins can register the sim without that false block.

### WebSocket closes with code `4000` / reason `replaced`

Only **one** authenticated WebSocket per facility is kept. A second client that completes `AUTH` for the same `facilityId` **closes the previous** connection. If the sim and a test script (or two tabs) both connect, they will fight each other.

### UI: password not saved

Ensure the **Cloud Password** field is actually filled (not the placeholder). Login will fail with `Invalid email or password` if the password is empty.
