# Gateway ↔ Cloud backend integration

This document ties together the **mesh-manager gateway** (Docker bundle under `gateway/mesh-manager-bundle/`) and the **BluLok Node backend**, especially when the backend runs on **Google Cloud Run**.

## Endpoints the gateway must use

| Purpose | URL pattern | Notes |
|--------|-------------|--------|
| WebSocket | `wss://<BACKEND_HOST>/ws/gateway` | Use `wss` when the API is HTTPS. Path must be exactly `/ws/gateway`. |
| REST (via env `CLOUD_API`) | `https://<BACKEND_HOST>/api/v1` | Same host as the API; internal routes are reached through the WS `PROXY_REQUEST` tunnel. |

Set these in **`gateway/mesh-manager-bundle/docker-compose.yml`** (or override with env):

- `CLOUD_WS` — full WebSocket URL, e.g. `wss://YOUR-SERVICE-URL.run.app/ws/gateway`
- `CLOUD_API` — REST base, e.g. `https://YOUR-SERVICE-URL.run.app/api/v1`

**Do not rely on the default URLs in compose** unless they match your deployed service. Defaults were examples; your Cloud Run URL is shown in **Cloud Console → Cloud Run → service → URL**.

### URL naming drift to avoid

- Repo `cloudbuild.yaml` builds with `_API_URL: 'https://blulok-backend-${_REGION}.run.app'` — you must confirm the **actual** HTTPS URL for your project (Cloud Run may include a hash or project segment).
- Older compose defaults used a different host/region (e.g. `blulok-cloud-backend-dev-….us-west1.run.app`). **Always copy the live URL** from Cloud Run.

## WebSocket authentication (required)

The server **does not** authenticate using `?token=` on the WebSocket URL. After the TCP/TLS upgrade, the **first** application message must be JSON:

```json
{
  "type": "AUTH",
  "token": "<JWT from POST /api/v1/auth/login against THIS backend>",
  "facilityId": "<facility UUID from BluLok DB>"
}
```

Successful path:

1. Server responds with `AUTH_OK` (includes ops public key material for signed commands).
2. Further messages: `PROXY_REQUEST`, firmware ACKs, `PONG`, etc. (see `backend/src/services/gateway/websocket-gateway.transport.ts`).

### Who may connect

- Roles allowed: **`facility_admin`**, **`admin`**, **`dev_admin`** (see `AUTH` handler in `websocket-gateway.transport.ts`).
- **`facility_admin`**: JWT must include **`facilityIds`** containing the same **`facilityId`** sent in `AUTH`.

If anything is wrong, the socket receives `ERROR` with codes such as `AUTH_FAILED`, `AUTH_FORBIDDEN`, `AUTH_BAD_REQUEST`, then the connection is closed.

## REST + proxy

On-site gateways typically call internal APIs through **`PROXY_REQUEST`** on the same WebSocket. The backend re-injects the caller identity and enforces facility scope (`ApiProxyService` + `FacilityGuardService`). Ensure `CLOUD_API` matches the deployment the JWT was issued for.

## Google Cloud Run–specific issues

### 1. Multiple instances and in-memory gateway state

`WebsocketGatewayTransport` keeps **connected gateways in process memory** (`facilityToClient`). If Cloud Run scales to **more than one instance**, a command or debug stream might hit an instance where **that facility is not connected**.

Mitigations:

- Prefer **`--min-instances=1`** and/or **`--max-instances=1`** for the backend service **until** gateway routing is centralized (e.g. Redis pub/sub or a dedicated gateway service).
- Or enable **session affinity** for the service so the same client tends to reach the same instance (still not a full substitute for shared state).

### 2. Request timeout

Long-lived WebSockets may need an increased **`--timeout`** on the Cloud Run service (up to the platform max) so idle-but-open connections are not cut too aggressively.

### 3. Trust proxy (recommended)

Behind Cloud Run’s load balancer, set **`TRUST_PROXY_DEPTH=1`** (or higher if you chain proxies) so `express` and any IP-based logic see correct client metadata. Configure via Cloud Run env vars.

### 4. TLS

Use **`wss://`** to match **`https://`** on the same host. Mixed `ws` to `https` hosts will fail or be blocked.

## Local debugging

1. Point `CLOUD_WS` / `CLOUD_API` at your machine:  
   `ws://host.docker.internal:3000/ws/gateway` and `http://host.docker.internal:3000/api/v1` (adjust for your port).
2. Log in to the **same** backend, copy JWT + facility UUID, configure the mesh gateway to send `AUTH` as above.
3. Backend logs: `Gateway WS upgrade`, `Gateway WS authenticated`, or `AUTH_FAILED` / `AUTH_FORBIDDEN`.

## Gateway row `status` vs inbound WebSocket

The dashboard shows **one** “Cloud connection” state derived from the **`gateways`** row for **physical** and **simulated** gateways: when a facility completes **`AUTH`** on `/ws/gateway`, the backend sets that gateway’s **`status`** to **`online`** and updates **`last_seen`**; on disconnect it sets **`offline`**. **HTTP** gateways are unchanged (their liveness still comes from outbound polling), so inbound WS does not overwrite their DB status.

**`AUTH` does not set `gateways.facility_id`** (no auto-link of unassigned inventory on first connect). The facility must **already** have a gateway row (admin **reassign**, `POST /gateways`, seed, etc.) for **`findByFacilityId`** to resolve.

**On connect,** if that row exists, the server **does** update **`status` → online** and **`last_seen`** so the dashboard shows **online** right away — that is **liveness**, not creation of the `facility_id` association. Unassigned gateways (`facility_id` NULL) are unchanged by WS until an admin uses **reassign** (or another API sets `facility_id`).

### New facility + mesh “connected” (possible confusion)

- **`AUTH` on `/ws/gateway`** only needs a valid JWT and a `facilityId` that matches your role. It does **not** require a row in **`gateways`** for that facility.
- So you can create a **new facility**, point the mesh at that facility UUID, and the **inbound WebSocket session is “connected”** from the cloud’s point of view (`GET /api/v1/gateways/status/:facilityId` reads in-memory state).
- The **Facility → Gateway** tab loads **`GET /api/v1/gateways?facility_id=...`**. If no gateway row exists yet, the UI shows **“No Gateway Configured”** even though the mesh session is up — unless you also created/assigned a gateway record.
- **Two different things:** (1) **session connected** = someone authenticated to `/ws/gateway` for this facility; (2) **gateway configured** = a **`gateways`** row exists with `facility_id` set (needed for device sync, firmware targeting, etc.). The dashboard now calls out this split when a session is active but no record exists.

## Automated regression tests

- **Inbound WS → DB status:** `backend/src/__tests__/services/gateway-events.service.inbound-db-sync.test.ts` — connect/disconnect updates `gateways.status` for physical/simulated, skips HTTP and missing rows; uses `jest.unmock('@/models/gateway.model')` because global `setup-mocks` replaces `GatewayModel` with a plain factory (no real prototype for `jest.spyOn`).
- **Gateway status cache invalidation:** `backend/src/__tests__/services/gateway-status-subscription-manager.test.ts` — `invalidateCache()` clears the in-memory list/TTL so broadcasts after inbound WS use fresh DB rows.
- **Facility Gateway tab UI:** `frontend/src/__tests__/components/Gateway/FacilityGatewayTab.test.tsx` — amber “Inbound WebSocket session is active” when `getGatewayWsStatus.connected` but no gateway row; “Gateway status (database)” when a row exists.

## Quick checklist

- [ ] `CLOUD_WS` / `CLOUD_API` host matches the **deployed** backend URL.
- [ ] JWT from **that** backend; not expired; role `facility_admin` | `admin` | `dev_admin`.
- [ ] `facilityId` is a real facility UUID; for `facility_admin`, it appears in JWT `facilityIds`.
- [ ] First message after connect is **`AUTH`** JSON (not query-string token).
- [ ] If connections flap or commands never arrive on Cloud Run, check **instance count** and **timeouts**.

## Troubleshooting (from production checks)

### `key_generation_required` on login (mesh / gateway sim)

`POST /api/v1/auth/login` without `X-App-Device-Id` used to always set `key_generation_required: true` for every user (legacy after removing `users.key_status`). Some gateway UIs treat that as “must complete mobile key onboarding” and **block** “Register with Cloud”.

**Backend behavior (updated):** for `facility_admin`, `admin`, and `dev_admin`, login **without** `X-App-Device-Id` no longer sets `key_generation_required`. Deploy the backend that includes this change so facility admins can register the sim without that false block.

### WebSocket closes with code `4000` / reason `replaced`

Only **one** authenticated WebSocket per facility is kept. A second client that completes `AUTH` for the same `facilityId` **closes the previous** connection. If the sim and a test script (or two tabs) both connect, they will fight each other.

### UI: password not saved

Ensure the **Cloud Password** field is actually filled (not the placeholder). Login will fail with `Invalid email or password` if the password is empty.
