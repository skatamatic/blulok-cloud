# Firmware OTA Architecture

## Overview

The firmware OTA (Over-The-Air) system delivers signed firmware binaries from the cloud to field devices through gateway WebSocket connections. Firmware can target three distinct device types, and the gateway acts as a relay for all targets.

## Target Types

| Target Type   | Description                                      | Delivery Path                                |
|---------------|--------------------------------------------------|----------------------------------------------|
| `gateway`     | Applied to the gateway hardware itself           | Cloud → Gateway WS → Gateway self-applies    |
| `lock`        | Broadcast to all BluLok locks on the BLE network | Cloud → Gateway WS → Gateway relays via BLE  |
| `friend_node` | Broadcast to all friend nodes (BLE mesh relays)  | Cloud → Gateway WS → Gateway relays via BLE  |

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

### Storage Path Safety

- Uploaded filenames are sanitized with `path.basename()` to prevent path traversal attacks.
- All storage operations (`upload`, `download`, `remove`) validate the resolved path stays inside the firmware storage base directory.
- The base `LocalBaseStorage` provider has additional `resolveSafe()` path-traversal protection.

### Inbound WS Message Validation

- `FIRMWARE_CHUNK_ACK` messages are validated: `nonce` must be a string (1-128 chars), `chunkIndex` must be an integer (0-100000), `status` and `message` must be strings if present.
- `FIRMWARE_UPDATE_STATUS` messages are validated: `status` required string (1-64 chars), optional fields (`nonce`, `version`, `error`, `target_type`) are type-checked and length-limited.

### API Response Sanitization

- `storage_path` (internal filesystem path) is stripped from all API responses via `sanitizeFirmwareImage()`.

## Database Schema

### `firmware_images`

Stores the firmware binary catalog. Managed by DEV_ADMIN users.

| Column            | Type    | Notes                                           |
|-------------------|---------|-------------------------------------------------|
| `id`              | UUID    | Primary key                                     |
| `version`         | VARCHAR | e.g. `2.1.0`                                    |
| `target_type`     | ENUM    | `gateway`, `lock`, `friend_node`                |
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
| `status`       | ENUM    | `pending`, `transferring`, `verifying`, `complete`, `failed`, `cancelled` |
| `chunks_total` | INT     | Total chunk count                                  |
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
| `target_type`      | string | `gateway`, `lock`, or `friend_node`        |
| `version`          | string | Firmware version                           |
| `sha256`           | string | SHA-256 hex hash of the full binary        |
| `size`             | number | Binary size in bytes                       |
| `chunk_count`      | number | Total number of chunks                     |
| `chunk_size`       | number | Chunk size in bytes (128KB)                |
| `nonce`            | string | UUID for replay protection + ACK correlation |
| `compatible_models`| array  | Compatible device models (optional)        |
| `iss`              | string | `BluCloud:Root`                            |
| `iat`              | number | Issued at (Unix timestamp)                 |
| `exp`              | number | Expiration (Unix timestamp, default iat+1800) |

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

Sent from gateway to cloud to report final update outcome.

```json
{
  "type": "FIRMWARE_UPDATE_STATUS",
  "nonce": "<manifest nonce>",
  "target_type": "gateway",
  "status": "success",
  "version": "2.1.0"
}
```

`handleUpdateStatus` maps gateway status reports to push record updates:
- `success` / `applied` → push status `complete`
- `failed` / `error` → push status `failed` with error message
- `verifying` → push status `verifying`
- Terminal status updates (`success`/`applied`/`failed`/`error`) require nonce correlation to avoid mutating the wrong push.

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
3. **verifying**: All chunks delivered to the gateway. The gateway is applying (for `gateway` target) or BLE-relaying (for `lock`/`friend_node` targets) the firmware. Completion depends on `FIRMWARE_UPDATE_STATUS`; if no final status arrives before timeout, the push is auto-failed.
4. **complete**: Gateway confirmed firmware applied successfully via `FIRMWARE_UPDATE_STATUS` with `status: 'success'` or `'applied'`
5. **failed**: Chunk ACK timeout after max retries, SHA-256 mismatch, gateway reported failure, gateway disconnect, or other error
6. **cancelled**: User cancelled via API (atomic status transition); background task stops at next chunk boundary

**Important:** `executePush` sets the status to `verifying` (NOT `complete`) after all chunks are sent. The final `complete` status is only set by `handleUpdateStatus` when the gateway reports success. This prevents premature "complete" indicators for lock/friend_node targets where BLE relay is still in progress.

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

- **CHUNK_SIZE_BYTES = 128KB** raw data
- Base64 encoding yields ~171KB, well within the 512KB WebSocket frame limit
- A 1MB firmware binary produces 8 chunks

## Gateway Disconnect Handling

- When a gateway WebSocket disconnects, the transport layer notifies `FirmwareService.handleFacilityDisconnect(facilityId)`.
- Any active firmware pushes for that facility are failed immediately (atomic non-terminal -> `failed`) and in-flight ACK waits are unblocked.
- This avoids pushes getting stuck in `pending`/`transferring` and makes retry behavior explicit.

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

## API Endpoints

| Method | Path                                    | Description                                |
|--------|-----------------------------------------|--------------------------------------------|
| POST   | `/firmware/upload`                      | Upload firmware binary (DEV_ADMIN only)    |
| GET    | `/firmware?target_type=lock`            | List firmware catalog (filterable)         |
| GET    | `/firmware/:id`                         | Get firmware by ID                         |
| DELETE | `/firmware/:id`                         | Soft-delete firmware + remove binary       |
| POST   | `/firmware/:id/push/:gatewayId`         | Initiate push (target_type from firmware)  |
| GET    | `/firmware/push-status/:gwId?target_type=` | Current push status (filterable)       |
| GET    | `/firmware/push-history/:gwId?target_type=&limit=&offset=` | Push history (paginated) |
| POST   | `/firmware/push/:pushId/cancel`         | Cancel an active push (atomic)             |

## Frontend Components

- **FirmwareManagementTab** (DevTools, DEV_ADMIN): Upload form with target type selector, catalog with colored target type badges and filter bar
- **GatewayFirmwareTab** (Gateway detail): Tab selector for Gateway/Lock/Friend Node, each showing available firmware, active push progress, and push history for that target type

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/database/migrations/044_create_firmware_tables.ts` | Initial firmware tables |
| `backend/src/database/migrations/045_add_firmware_target_type.ts` | Adds target_type columns |
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
