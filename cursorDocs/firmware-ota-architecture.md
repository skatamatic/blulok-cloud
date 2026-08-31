# Firmware OTA Architecture

## Overview

The firmware OTA (Over-The-Air) system delivers signed firmware binaries from the cloud to field devices through gateway WebSocket connections. Firmware can target several device types, and the gateway acts as a relay for non-gateway targets.

### Module layout (backend)

| Module | Responsibility |
|--------|----------------|
| `firmware.service.ts` | Thin facade — public static API for routes / WS handlers |
| `firmware-catalog.service.ts` | Upload, init/complete, list, delete, prune/retention |
| `firmware-push-engine.service.ts` | v1/v2 push execution, ACK, progress, disconnect resume |
| `firmware-push-session.store.ts` | In-memory active-push Maps and timeout overrides |

## Target Types

| Target Type       | Description                                      | Delivery Path                                |
|-------------------|--------------------------------------------------|----------------------------------------------|
| `gateway`         | Applied to the gateway hardware itself           | Cloud → Gateway WS → Gateway self-applies    |
| `lock`            | Broadcast to all BluLok locks on the BLE network | Cloud → Gateway WS → Gateway relays via BLE  |
| `friend_node`     | Broadcast to all friend nodes (BLE mesh relays)  | Cloud → Gateway WS → Gateway relays via BLE  |
| `bridge`          | Broadcast to all bridges (mesh range extenders)  | Cloud → Gateway WS → Gateway relays via BLE  |
| `access_control`  | Access-control hardware on the gateway           | Cloud → Gateway WS → Gateway relays/applies |

The same firmware version string (e.g. `2.0.0`) can exist independently for different target types. Version uniqueness is scoped to `(version, target_type)`.

## Concurrency Rules

- **One active push per target type per gateway.** A gateway firmware push and a lock firmware push can run concurrently through the same gateway.
- No per-device targeting is needed — a firmware push applies to **all** devices of that type on the gateway's BLE network.

## Security

### RBAC / Facility Scoping

- **Upload / Delete**: `DEV_ADMIN` only
- **List / Details**: `ADMIN`, `DEV_ADMIN`, `FACILITY_ADMIN` (catalog is global, no facility scoping)
- **Push / Status / History / Cancel**: `ADMIN`, `DEV_ADMIN`, `FACILITY_ADMIN` — `FACILITY_ADMIN` users are scoped to gateways belonging to their assigned facilities. Every gateway-specific endpoint verifies facility access via `assertFacilityAccess()`.

### JWT Signing & Expiration

- All command JWTs (manifest and chunk) are signed with Ed25519 and include an `exp` claim (default 30-minute TTL).
- Gateways should reject JWTs that have expired.
- The `nonce` field provides replay protection within the TTL window.

### ACK Validation

- `handleChunkAck` validates both `nonce` and `facilityId` to prevent a rogue or cross-facility gateway from resolving chunk ACKs for another push.

### Binary Integrity

- SHA-256 is computed at upload time and stored in the database.
- Before starting a push, the stored binary is re-read and re-hashed to verify integrity against the database hash. If they differ, the push fails immediately.
- Maximum upload size is **250MB** (`FIRMWARE_MAX_SIZE_MB` in `firmware-storage.factory.ts`; multer on `POST /firmware/upload` uses the same limit).
- **Cloud Run (HTTP/1) rejects request bodies over 32 MiB** with HTTP 413 before they reach the app. End-to-end HTTP/2 on Cloud Run is **not compatible with gateway WebSockets** (Google documents: do not enable HTTP/2 when using WebSockets).
- Large uploads on Cloud Run therefore use **`POST /firmware/upload` with JSON `phase: "prepare"`** → client PUT to a GCS resumable upload session URL → **`POST /firmware/upload` with JSON `phase: "finalize"`**. The DevTools frontend hides this in `apiService.uploadFirmware()`. **Gateways never call this route** — they receive OTA via WebSocket chunk push after a dev admin initiates push.
- Local / non-GCS storage uses multipart `POST /firmware/upload` directly (`upload_mode: direct_multipart` from prepare).
- **GCS bucket CORS** must allow `PUT` from DevTools / frontend origins (see deployment notes below).

### Storage Path Safety

- Uploaded filenames are sanitized with `path.basename()` to prevent path traversal attacks.
- All storage operations (`upload`, `download`, `remove`) validate the resolved path stays inside the firmware storage base directory.
- The base `LocalBaseStorage` provider has additional `resolveSafe()` path-traversal protection.

### Inbound WS Message Validation

- `FIRMWARE_CHUNK_ACK` messages are validated: `nonce` must be a string (1-128 chars), `chunkIndex` must be an integer (0-100000), `status` and `message` must be strings if present.
- `FIRMWARE_UPDATE_STATUS` messages are validated: **`push_id`** required string (1-128 chars), **`status`** required string (1-64 chars); optional fields (`version`, `error`, `target_type`) are type-checked and length-limited. Messages that omit `push_id` (for example by sending manifest `nonce` instead) are rejected and do not advance the push.
- `FIRMWARE_PROGRESS` messages are validated: `push_id` required; optional progress fields (`progress_percent`, `phase`, `devices`, `error`) are type-checked. This message is optional and does **not** mark a push complete.

### API Response Sanitization

- `storage_path` (internal filesystem path) is stripped from all API responses via `sanitizeFirmwareImage()`.

## Database Schema

### `firmware_images`

Stores the firmware binary catalog. Managed by DEV_ADMIN users.

| Column            | Type    | Notes                                           |
|-------------------|---------|-------------------------------------------------|
| `id`              | UUID    | Primary key                                     |
| `version`         | VARCHAR | e.g. `2.1.0`                                    |
| `target_type`     | ENUM    | `gateway`, `lock`, `friend_node`, `bridge`, `access_control` |
| `filename`        | VARCHAR | Original upload filename                        |
| `sha256_hash`     | CHAR(64)| SHA-256 of the raw binary                       |
| `size_bytes`      | INT     | Binary size in bytes                            |
| `storage_path`    | VARCHAR | Path in the firmware storage provider (internal)|
| `uploaded_by`     | UUID FK | User who uploaded                               |
| `is_active`       | BOOL    | Soft delete flag                                |

**Unique constraint:** `(version, target_type)` — same version can exist for different targets.

### `firmware_pushes`

Tracks the state of each push operation.

| Column         | Type    | Notes                                              |
|----------------|---------|----------------------------------------------------|
| `id`           | UUID    | Primary key                                        |
| `firmware_id`  | UUID FK | References `firmware_images`                       |
| `gateway_id`   | UUID FK | Target gateway                                     |
| `facility_id`  | UUID FK | Facility the gateway belongs to                    |
| `target_type`  | ENUM    | Denormalized from `firmware_images` for queries     |
| `delivery_mode`| VARCHAR | `v1` (WebSocket chunks, default) or `v2` (GCS signed URL) |
| `status`       | ENUM    | `pending`, `transferring`, `verifying`, `complete`, `failed`, `cancelled` |
| `chunks_total` | INT     | Total chunk count (`0` for v2)                     |
| `chunks_sent`  | INT     | Progress counter                                   |

**Index:** `(gateway_id, target_type, status)` — supports the active-push lookup scoped by target type.

### `firmware_push_events`

Append-only event stream used for progress timelines and per-device status snapshots.

- Existing indexes:
  - `(push_id, created_at)` for event timeline paging
  - `(push_id, event_type)` for filtered event reads
- Latest-per-device optimization index:
  - `(push_id, event_type, device_id, created_at)` to accelerate "latest status per device" lookups used by push status hydration.
  - `(push_id, event_type, device_id, reported_at, created_at)` to support deterministic "latest per device" ranking (`reported_at DESC, created_at DESC`) without duplicate rows.

## Delivery Modes (v1 / v2)

| Mode | How binary is delivered | Gateway progress | Chunk ACKs |
|------|-------------------------|------------------|------------|
| **v1** (default) | Cloud downloads binary and pushes `FIRMWARE_CHUNK` over WebSocket with ACK flow control | Cloud derives % from chunks; optional `FIRMWARE_PROGRESS` | Required |
| **v2** | Cloud issues a **GCS V4 signed read URL** in the manifest; gateway HTTPS GETs the package | Gateway must send `FIRMWARE_PROGRESS` with `progress_percent` | Not used |

**Gateway implementers (v2 device contract):** [Gateway Firmware OTA v2 — firmware developer guide](./gateway-firmware-ota-v2-developer-guide.md)

- Select mode from the **Firmware** tab or **Swap / Recovery** tab (Delivery: v1 | v2), or via API body.
- **v2 requires GCS firmware storage.** Local/gdrive storage returns `400` with a clear error — no silent fallback.
- Signed download URL TTL is **60 minutes**; v2 manifest JWT `exp` is aligned to the same window.
- GCS signing needs a credential that can sign (service-account key or `iam.serviceAccounts.signBlob`).
- Completion is still gated on `FIRMWARE_UPDATE_STATUS` + `push_id` for both modes.
- On reconnect while v2 is `transferring`, cloud re-issues a fresh signed URL and re-sends the manifest (does not resume chunks).
- Terminal status updates are atomic and **rejected** if the push is already `complete` / `failed` / `cancelled` (prevents late v2 success after cancel).
- Transfer disconnect grace only fails pushes still in `pending`/`transferring` (cannot fail a push that already reached `verifying`).
- v2 transfer wait uses `FIRMWARE_V2_TRANSFER_TIMEOUT_SEC` (default **3600s**, aligned with URL TTL) and is **extended** on each `FIRMWARE_PROGRESS` while transferring.
- UI loads `GET /firmware/delivery-capabilities` and disables v2 when storage cannot issue signed downloads (non-GCS). Runtime IAM `signBlob` failures still surface as a clear push error.

## WebSocket Message Protocol

All firmware messages flow over the existing gateway WebSocket connection (`/ws/gateway`). Each message payload is a signed Ed25519 JWT with expiration.

### 1. FIRMWARE_MANIFEST

Sent from cloud to gateway to initiate a transfer.

```
{
  type: "FIRMWARE_MANIFEST",
  jwt: "<Ed25519 signed JWT>"
}
```

JWT payload fields:

| Field              | Type   | Description                                |
|--------------------|--------|--------------------------------------------|
| `cmd_type`         | string | Always `FIRMWARE_MANIFEST`                 |
| `delivery_mode`    | string | `v1` (chunked) or `v2` (GCS download URL); default/omit treated as v1 |
| `push_id`          | string | **Cloud push record UUID** — required on all later `FIRMWARE_UPDATE_STATUS` / `FIRMWARE_PROGRESS` messages |
| `target_type`      | string | `gateway`, `lock`, `friend_node`, `bridge`, or `access_control` |
| `version`          | string | Firmware version                           |
| `sha256`           | string | SHA-256 hex hash of the full binary        |
| `size`             | number | Binary size in bytes                       |
| `chunk_count`      | number | Total chunks (v1); **`0` for v2**          |
| `chunk_size`       | number | Chunk size in bytes (v1 only)              |
| `nonce`            | string | UUID for chunk ACK correlation (v1 only)   |
| `download_url`     | string | **v2 only** — short-lived GCS signed HTTPS GET URL |
| `filename`         | string | Original firmware filename (optional)    |
| `compatible_models`| array  | Compatible device models (optional)        |
| `iss`              | string | `BluCloud:Root`                            |
| `iat`              | number | Issued at (Unix timestamp)                 |
| `exp`              | number | Expiration (Unix timestamp; v1 default iat+1800, v2 aligned to URL TTL) |

**Correlation IDs:** The manifest JWT carries two different UUIDs. Gateways must keep both but use each only where documented:

| Field | Use on gateway → cloud messages |
|-------|----------------------------------|
| `nonce` | `FIRMWARE_CHUNK_ACK` only (v1) |
| `push_id` | `FIRMWARE_UPDATE_STATUS`, `FIRMWARE_PROGRESS` |

**v2 gateway behavior:** When `delivery_mode` is `v2` (or `download_url` is present), HTTPS GET the URL, verify SHA-256/`size`, emit `FIRMWARE_PROGRESS` during download, then continue with the normal `FIRMWARE_UPDATE_STATUS` lifecycle. Do not expect `FIRMWARE_CHUNK` messages. Full device checklist: [Gateway Firmware OTA v2 developer guide](./gateway-firmware-ota-v2-developer-guide.md).

### 2. FIRMWARE_CHUNK

Sent from cloud to gateway, one per chunk, sequentially with flow control.

```
{
  type: "FIRMWARE_CHUNK",
  jwt: "<Ed25519 signed JWT>"
}
```

JWT payload fields:

| Field          | Type   | Description                          |
|----------------|--------|--------------------------------------|
| `cmd_type`     | string | Always `FIRMWARE_CHUNK`              |
| `target_type`  | string | Same as manifest target_type         |
| `nonce`        | string | Must match the manifest nonce        |
| `chunk_index`  | number | 0-based chunk index                  |
| `chunk_sha256` | string | SHA-256 hex hash of this chunk       |
| `data`         | string | Base64-encoded chunk binary data     |
| `exp`          | number | Expiration (Unix timestamp)          |

### 3. FIRMWARE_CHUNK_ACK

Sent from gateway to cloud after receiving and verifying each chunk.

```json
{
  "type": "FIRMWARE_CHUNK_ACK",
  "nonce": "<manifest nonce>",
  "chunkIndex": 0,
  "status": "ok"
}
```

The cloud waits for each ACK before sending the next chunk. If no ACK is received within 30 seconds, the chunk is retried (up to 3 attempts). ACKs are validated against both `nonce` and `facilityId` to prevent cross-push confusion.

### 4. FIRMWARE_UPDATE_STATUS

Sent from gateway to cloud to report apply/relay progress and **final outcome**. Required after all chunks are ACK'd; the cloud does not mark a push `complete` until it receives a terminal success status on this message type.

```json
{
  "type": "FIRMWARE_UPDATE_STATUS",
  "push_id": "<push_id from manifest JWT>",
  "target_type": "lock",
  "status": "success",
  "version": "2.10.0"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `push_id` | **Yes** | Must match `push_id` from the manifest JWT for this transfer |
| `status` | **Yes** | See status mapping below |
| `target_type` | Recommended | Logged if mismatched; push is still updated when `push_id` matches |
| `version` | Optional | Firmware version being applied (informational) |
| `error` | Optional | Human-readable failure reason when `status` is `failed` or `error` |

**Do not send `nonce` instead of `push_id`.** The cloud ignores `FIRMWARE_UPDATE_STATUS` without a valid `push_id` (backend logs: `FIRMWARE_UPDATE_STATUS: invalid push_id`).

Typical lock/friend_node lifecycle (gateway → cloud):

```json
{ "type": "FIRMWARE_UPDATE_STATUS", "push_id": "…", "target_type": "lock", "version": "2.10.0", "status": "verifying" }
{ "type": "FIRMWARE_UPDATE_STATUS", "push_id": "…", "target_type": "lock", "version": "2.10.0", "status": "applying" }
{ "type": "FIRMWARE_UPDATE_STATUS", "push_id": "…", "target_type": "lock", "version": "2.10.0", "status": "success" }
```

`handleUpdateStatus` maps gateway status reports to push record updates:
- `success` → push status `complete` (only terminal success value)
- `failed` / `error` → push status `failed` with error message
- `verifying` / `applying` → push status `verifying` (progress bar may already show 100% while BLE relay/install continues)
- Any other status (e.g. `completed`, `applied`, `rebooting`) → logged as unknown; push is **not** updated

Terminal status updates (`success` / `failed` / `error`) require **`push_id`** correlation to avoid mutating the wrong push.

The cloud replies to each `FIRMWARE_UPDATE_STATUS` with:

```json
{ "type": "FIRMWARE_UPDATE_STATUS_ACK", "push_id": "…", "accepted": true, "push_status": "complete" }
```

When `accepted` is `false`, `reason` explains why (e.g. `push not found`, `invalid push_id`). Gateways should log ACK failures — a stuck 100% UI with no `success` ACK means the status never reached the cloud.

### Troubleshooting stuck at 100%

The progress bar hits **100% / verifying** when the cloud finishes sending chunks — **before** any gateway status message. A stuck UI does **not** prove the gateway's `verifying` / `applying` / `success` messages were received.

Check in order:

1. **Gateway ACK** — after each `FIRMWARE_UPDATE_STATUS`, expect `FIRMWARE_UPDATE_STATUS_ACK`. If missing, message was not sent on `/ws/gateway` after `AUTH`, or JSON was invalid.
2. **Backend logs** — search for `Firmware update status from facility=` with the `push_id`. No log line → message never arrived.
3. **`push not found`** — `push_id` must match the manifest JWT `push_id`, not `nonce`.
4. **`facility mismatch`** — `AUTH.facilityId` must match the push record's `facility_id`.
5. **Push events API** — accepted gateway statuses are recorded as `info` events on the push (`Gateway status: success (1.1)`).
6. **UI-only** — query `GET /firmware/push-status/:gatewayId?target_type=lock`. If DB shows `complete` but UI shows 100%, refresh or check dashboard WS connection.
7. **Dead socket after reboot** — gateway may send `success` on a closed socket during reboot. See [Gateway reconnect hardening](#gateway-reconnect-hardening) below.

### Gateway reconnect hardening

If the gateway reboots while a push is `verifying`, the cloud keeps the push open (180s disconnect grace, then full verify timeout on reconnect). The gateway **must** recover terminal status itself — the cloud cannot infer install success from silence.

**Recommended gateway behavior:**

1. **Persist `push_id`** when the manifest JWT is accepted (flash/NVS). Keep it until `FIRMWARE_UPDATE_STATUS_ACK` confirms `accepted: true` and `push_status: "complete"`.
2. **Reconnect WebSocket** as soon as the network stack is up after reboot.
3. **AUTH first** — all firmware messages on a socket that has not completed `AUTH` are rejected.
4. **On `FIRMWARE_PUSH_RESUME`** (cloud → gateway, sent after reconnect when verifying pushes exist):

```json
{
  "type": "FIRMWARE_PUSH_RESUME",
  "pushes": [
    { "push_id": "…", "target_type": "lock", "status": "verifying", "progress_percent": 100 }
  ]
}
```

   For each listed `push_id`, if local OTA finished successfully, resend:

```json
{ "type": "FIRMWARE_UPDATE_STATUS", "push_id": "…", "target_type": "lock", "status": "success" }
```

5. **Wait for `FIRMWARE_UPDATE_STATUS_ACK`**. If missing, `accepted: false`, or socket drops again, **retry with backoff** (e.g. 2s → 5s → 15s) until ACK or local give-up timeout.
6. **Idempotent** — resending `success` for an already-complete push is safe; cloud returns `accepted: true`.

Without persist + reconnect + retry, a `success` sent on a dead socket is lost and the UI stays at 100% until verify timeout.

### 5. FIRMWARE_PROGRESS (optional)

Optional gateway → cloud progress telemetry for dashboards. **Does not complete a push** — use `FIRMWARE_UPDATE_STATUS` with `status: "success"` for that.

```json
{
  "type": "FIRMWARE_PROGRESS",
  "push_id": "<push_id from manifest JWT>",
  "target_type": "lock",
  "progress_percent": 80,
  "phase": "installing",
  "message": "Installing on lock nodes",
  "devices": [
    { "device_id": "lock-1", "status": "installing", "progress_percent": 90 },
    { "device_id": "lock-2", "status": "downloading", "progress_percent": 30 }
  ]
}
```

Sending `progress_percent: 100` or per-device `status: "complete"` here updates UI progress only; the push remains `verifying` until `FIRMWARE_UPDATE_STATUS` reports success.

## Push Status API Hydration

- `GET /firmware/push-status/:gatewayId` supports `include_events=false` to return only the aggregate push record.
- Firmware tab initial load should use this lightweight mode to avoid expensive event-table hydration on first paint.

## Push Lifecycle States

```
pending → transferring → verifying → complete
                       ↘            ↘ failed
                        failed        cancelled (user-initiated)
                        cancelled
```

1. **pending**: Push record created, background task spawned
2. **transferring**: Manifest sent, chunks being delivered with ACK flow control
3. **verifying**: All chunks delivered to the gateway. The cloud sets progress to **100%** and status to `verifying`. The gateway may report intermediate `FIRMWARE_UPDATE_STATUS` values `verifying` or `applying`. Completion requires **`status: "success"`** on `FIRMWARE_UPDATE_STATUS` (with `push_id`); that transitions to `complete` immediately even if no prior `verifying`/`applying` messages were received. If no `success` arrives before timeout (default **300s** for `gateway` via `FIRMWARE_GATEWAY_VERIFY_TIMEOUT_SEC`, **900s** for other targets via `FIRMWARE_VERIFY_TIMEOUT_SEC`), the push is auto-failed.
4. **complete**: Gateway sent `FIRMWARE_UPDATE_STATUS` with **`status: "success"`** and the correct `push_id`.
5. **failed**: Chunk ACK timeout after max retries, SHA-256 mismatch, gateway reported failure, gateway disconnect, or other error
6. **cancelled**: User cancelled via API (atomic status transition); background task stops at next chunk boundary

**Important:** `executePush` sets the status to `verifying` (NOT `complete`) after all chunks are sent and broadcasts **100%** progress. Only **`FIRMWARE_UPDATE_STATUS` with `status: "success"`** closes the push. `verifying` / `applying` are optional progress signals; `FIRMWARE_PROGRESS` updates the UI only.

**Gateway developer contract:** After install/reboot, send:

```json
{ "type": "FIRMWARE_UPDATE_STATUS", "push_id": "<uuid from manifest>", "target_type": "gateway", "status": "success" }
```

Use `push_id` (snake_case) or `pushId` (camelCase). Do **not** send manifest `nonce` instead of `push_id`.

## Pre-Push Checks

Before initiating a push, the system verifies:
1. Firmware exists and is active
2. Gateway exists
3. Gateway is online (has active WebSocket connection)
4. No active push for the same target type on this gateway (enforced atomically in DB transaction)
5. `compatible_models` match (warning only, non-blocking)

## Ed25519 Signing and Verification

- The server holds an Ed25519 private key (generated at startup if absent)
- Every `FIRMWARE_MANIFEST` and `FIRMWARE_CHUNK` JWT is signed with this key and includes `exp`
- The corresponding public key (`ops_public_key`) is distributed to gateways via:
  - The HTTP login response (`POST /auth/login`)
  - The WebSocket `AUTH_OK` message
- Gateways verify JWT signatures and expiration before processing firmware payloads

## Chunk Size

- **`FIRMWARE_CHUNK_SIZE_BYTES = 2,356,320`** (~2.25 MB raw data)
- Sized to ~**80%** of the default **5 MB** gateway WebSocket `maxPayload` (`GATEWAY_MAX_MESSAGE_BYTES`), leaving ~20% margin for JWT + JSON envelope growth
- Signed chunk messages land at ~**4.19 MB** on the wire (validated with real Ed25519 JWTs)
- A 512 KB test firmware binary produces **1** chunk

## E2E bulk transfer (`ws:e2e`)

`backend/scripts/ws-gateway-e2e.js` includes a **50 MB** gateway OTA scenario on an **isolated facility + gateway**:

1. Generates a 50 MB binary, uploads via `POST /firmware/upload` (local storage in E2E).
2. Connects a fake gateway WS, ACKs every chunk with strict index/contiguity checks, per-chunk SHA-256 validation, and JWT verification.
3. Simulates `FIRMWARE_PROGRESS` milestones and the `FIRMWARE_UPDATE_STATUS` lifecycle (`verifying` → `applying` → `success`).
4. Asserts push-status `chunks_sent`/`chunks_total`, throughput floor, and byte-for-byte reassembly integrity.

Tunables (optional env):

| Variable | Default | Purpose |
|----------|---------|---------|
| `FIRMWARE_E2E_50MB_MIN_MBPS` | `1.0` | Minimum end-to-end transfer throughput (MB/s) |
| `FIRMWARE_E2E_50MB_MAX_SECONDS` | `600` | Maximum allowed push+delivery duration |

## Gateway Disconnect Handling

- When a gateway WebSocket disconnects, the transport layer notifies `FirmwareService.handleFacilityDisconnect(facilityId)`.
- **`pending` / `transferring` pushes** (still in `activePushes`) are **paused**, not failed. In-flight chunk ACK waits are unblocked so `executePush` can unwind quickly. A **transfer reconnect grace timeout** is armed (default **180s** via `FIRMWARE_TRANSFER_DISCONNECT_GRACE_SEC` or `FIRMWARE_VERIFY_DISCONNECT_GRACE_SEC`). If the gateway reconnects and re-`AUTH`s before grace expires, `resumePendingForFacility` calls `executePush`, which **resumes from `chunks_sent`** (re-sends manifest with a new `nonce`, then remaining chunks only).
- Mid-transfer **must not** hard-fail on “gateway offline” or on disconnect-rejected chunk ACKs — those paths pause + arm grace so AUTH resume can continue. Hard-fail only after grace expires without reconnect, or after true ACK timeouts while still connected.
- **`verifying` pushes** (chunks already delivered; gateway may be rebooting) are **not** failed immediately. Instead a shorter grace timeout is armed (same default **180s**). On reconnect (`resumePendingForFacility`), the full verify timeout is re-armed and the cloud sends **`FIRMWARE_PUSH_RESUME`** listing verifying pushes so the gateway can resend terminal `FIRMWARE_UPDATE_STATUS`.
- If the gateway does not reconnect within the grace window, the transfer or verify push is failed with a reconnect-timeout message.
- This avoids pushes failing when Cloud Run / GLB recycles the WebSocket mid-transfer or mid-verify.
- **Dev / e2e overrides:** `GET`/`PUT /api/v1/dev/firmware-timeouts` can temporarily set `transfer_disconnect_grace_ms` and/or `verify_disconnect_grace_ms` for the running process (ADMIN / DEV_ADMIN). Pass `null` to clear. `ws:e2e` sets a short transfer grace (~1.5s) before the mid-transfer disconnect failure scenario so it does not wait the full 180s product default.
## Upload Race Condition Handling

- If the DB insert fails (e.g. due to a unique constraint violation from a concurrent upload), the already-stored binary is cleaned up from disk automatically.
- The `initiatePush` background task catch handler also ensures orphaned push records are marked `'failed'` if `executePush` throws unexpectedly.

## Pluggable Storage Backends

Firmware storage uses the same shared base storage layer as BluDesign (`backend/src/services/storage/`). The backend is configurable at runtime — not hardcoded to local filesystem.

### Configuration

Firmware storage config is stored in the `system_settings` database table with two keys:
- `storage.firmware.provider_type` — `'local'`, `'gcs'`, or `'gdrive'`
- `storage.firmware.provider_config` — JSON string with provider-specific config

If no DB config exists, falls back to local storage using `FIRMWARE_STORAGE_PATH` env var (backward compatible).

### Admin Routes (`/api/v1/admin/storage-config`)

All require `DEV_ADMIN` role:
- `GET /` — Get current firmware storage config (secrets redacted)
- `PUT /` — Update firmware storage config
- `POST /test` — Test a storage config without saving

### Architecture

The `FirmwareStorageAdapter` wraps any `BaseStorageProvider`:
- `upload(firmwareId, filename, data)` → `base.uploadFile("firmware/{firmwareId}/{filename}", data)`
- `download(storagePath)` → `base.downloadFile(storagePath)` with traversal check
- `remove(storagePath)` → `base.deleteFile(storagePath)`

Migration `046_seed_default_storage_config.ts` seeds the default local provider type.

## Storage Cleanup

- When firmware is soft-deleted via the API, the binary is also removed from the configured storage backend.
- The storage provider's `remove()` method cleans up the file and its parent directory if empty (local provider).
- **Retention:** keep the newest **50** active packages per `target_type` (`FIRMWARE_IMAGES_RETENTION_PER_TARGET`). Excess packages are **hard-deleted** (storage object + DB row; push/events CASCADE). Packages with a non-terminal push are skipped until that push finishes.
- Prune runs on **startup**, after **upload** (multipart + signed finalize), and after **initiatePush**.

## API Endpoints

| Method | Path                                    | Description                                |
|--------|-----------------------------------------|--------------------------------------------|
| POST   | `/firmware/upload`                      | Multipart upload (local/small) **or** JSON `phase: prepare\|finalize` for large GCS uploads (DevTools only) |
| GET    | `/firmware?target_type=lock`            | List firmware catalog (filterable)         |
| GET    | `/firmware/:id`                         | Get firmware by ID                         |
| DELETE | `/firmware/:id`                         | Soft-delete firmware + remove binary       |
| POST   | `/firmware/:id/push/:gatewayId`         | Initiate push (body optional `{ delivery_mode?: "v1"\|"v2" }`) |
| GET    | `/firmware/push-status/:gwId?target_type=` | Current push status (filterable)       |
| GET    | `/firmware/push-history/:gwId?target_type=&limit=&offset=` | Push history (paginated) |
| POST   | `/firmware/push/:pushId/cancel`         | Cancel an active push (atomic)             |

## Frontend Components

- **FirmwareManagementTab** (DevTools, DEV_ADMIN): Upload form with target type selector, catalog with colored target type badges and filter bar
- **GatewayFirmwareTab** (Gateway detail): Tab selector for Gateway/Lock/Friend Node, each showing available firmware, active push progress, and push history for that target type

## GCS bucket CORS (direct browser upload)

Browser DevTools uploads PUT directly to a GCS resumable session URL (`storage.googleapis.com`). Configure CORS on the firmware bucket, e.g.:

```json
[
  {
    "origin": ["https://*.run.app", "http://localhost:5173", "http://localhost:3001"],
    "method": ["PUT", "GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Range", "Range", "Location"],
    "maxAgeSeconds": 3600
  }
]
```

Apply with `gcloud storage buckets update gs://YOUR_BUCKET --cors-file=cors.json` (or `gsutil cors set cors.json gs://YOUR_BUCKET`).

### Cloud Run service account (GCS firmware)

| Capability | Roles / permission | Notes |
|------------|--------------------|-------|
| Resumable upload (DevTools prepare/finalize) | Bucket **`storage.objectCreator`** + **`storage.objectViewer`** | Uses OAuth; does **not** need `signBlob` |
| OTA **v2** signed download URLs | Same storage roles **plus** **`roles/iam.serviceAccountTokenCreator`** on the runtime SA **to itself** | ADC on Cloud Run has no private key; `@google-cloud/storage` calls `iam.serviceAccounts.signBlob` |

Grant self-impersonation (example for the default Compute Engine SA used by Cloud Run):

```bash
PROJECT=blulok-cloud-dev
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --project="$PROJECT" \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountTokenCreator"
```

Without Token Creator, v2 push fails with `Permission 'iam.serviceAccounts.signBlob' denied` (v1 chunk push still works).

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/database/migrations/044_create_firmware_tables.ts` | Initial firmware tables |
| `backend/src/database/migrations/045_add_firmware_target_type.ts` | Adds target_type columns |
| `backend/src/database/migrations/048_add_access_control_firmware_type.ts` | Adds `access_control` target |
| `backend/src/database/migrations/098_add_bridge_firmware_type.ts` | Adds `bridge` target |
| `backend/src/models/firmware.model.ts` | FirmwareImage model + FirmwareTargetType |
| `backend/src/models/firmware-push.model.ts` | FirmwarePush model (includes atomicCancel) |
| `backend/src/services/firmware/firmware.service.ts` | Upload, push lifecycle, chunk delivery |
| `backend/src/services/firmware/firmware-storage.factory.ts` | Pluggable storage factory (wraps base providers) |
| `backend/src/services/storage/` | Shared base storage layer (Local/GCS/GDrive) |
| `backend/src/routes/firmware.routes.ts` | REST API routes with facility-scoping |
| `backend/src/routes/system-storage.routes.ts` | Admin routes for firmware storage config |
| `backend/src/database/migrations/046_seed_default_storage_config.ts` | Seeds default firmware storage config |
| `backend/src/services/crypto/ed25519.service.ts` | Ed25519 key management + JWT signing (with exp) |
| `backend/src/services/subscriptions/firmware-push-subscription-manager.ts` | Real-time push progress (includes targetType) |
| `frontend/src/components/DevTools/FirmwareManagementTab.tsx` | Upload UI |
| `frontend/src/components/Gateway/GatewayFirmwareTab.tsx` | Push UI |
