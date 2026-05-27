## BluLok Security Design (Cloud Backend)

This document summarizes the new centralized trust model implemented in the backend.

### Trust Model
- Cloud is the single signing authority.
- Locks verify Cloud-signed Route Passes and commands using Ops public key; only Root key can rotate Ops key.
- Apps hold device-bound Ed25519 keypair (private key in Secure Enclave/Keystore) and a long-lived User JWT for Cloud API.
- Gateways proxy offline flows and broadcast secure time.

### Core Flows
- Flow A (Online Pass): App requests Route Pass; Cloud signs Ed25519 JWT with Ops key including `device_pubkey`.
- Flow B (Offline Unlock): App presents Route Pass to lock; lock verifies signature/time/denylist, then challenges app; app signs nonce with device private key.
- Flow C (Fallback): App signs short-lived JWT with device private key; Gateway forwards to Cloud; Cloud verifies with stored device public key and issues Route Pass.
- Flow D (Revocation): Cloud pushes signed Denylist Update Command to Gateway to target locks.
- Flow E (Time Sync): Cloud issues signed Secure Time Sync Command; Gateway broadcasts periodically; locks reject older timestamps.
- Flow F (Firmware OTA): Cloud signs firmware manifest and chunked binary data as EdDSA JWTs; Gateway verifies each JWT using the Ops public key received in AUTH_OK; Gateway reassembles binary, verifies SHA-256 integrity, verifies manufacturer signature, then distributes to lock hardware.
- Flow G (Keypad Access Codes): Cloud resolves active keypad access codes per relay target, signs `ACCESS_CODE_UPDATE` command JWT, and unicasts to the facility gateway; gateway can also poll the same resolved code mappings via internal route.

### Data Artifacts
- Route Pass (JWT, Ed25519): `iss`, `sub`, `aud[]`, `iat`, `exp`, `jti`, `device_pubkey`, `user_role` (lowercase underscore-separated role, e.g. `facility_admin`, aligned with `UserRole`).
- Gateway Commands (JWT, Ed25519): All cloud-to-gateway commands are standard JWTs with embedded signature.
  - Common claims: `iss: 'BluCloud:Root'`, `iat`, `cmd_type` (CAPS_CASE)
  - DENYLIST_ADD: `{ cmd_type:'DENYLIST_ADD', denylist_add:[{ sub, exp }], target: ['deviceId1', ...] }`
  - DENYLIST_REMOVE: `{ cmd_type:'DENYLIST_REMOVE', denylist_remove:[{ sub, exp }], target: ['deviceId1', ...] }`
  - LOCK: `{ cmd_type:'LOCK', device_id: 'deviceId' }`
  - UNLOCK: `{ cmd_type:'UNLOCK', device_id: 'deviceId' }`
  - SECURE_TIME_SYNC: `{ cmd_type:'SECURE_TIME_SYNC', ts }`
  - FIRMWARE_MANIFEST: `{ cmd_type:'FIRMWARE_MANIFEST', push_id, target_type, version, sha256, size, chunk_count, chunk_size, nonce, compatible_models }`
  - FIRMWARE_CHUNK: `{ cmd_type:'FIRMWARE_CHUNK', nonce, chunk_index, chunk_sha256, data:'<base64>' }`
  - ACCESS_CODE_UPDATE: `{ cmd_type:'ACCESS_CODE_UPDATE', facility_id, nonce, codes:[{ device_id, relay_channel, code, valid_until }] }`
- WebSocket command envelope: `{ type: 'COMMAND', jwt: 'eyJ...' }`
- WebSocket firmware envelopes: `{ type: 'FIRMWARE_MANIFEST', jwt: 'eyJ...' }`, `{ type: 'FIRMWARE_CHUNK', jwt: 'eyJ...' }`
- WebSocket access-code envelope: `{ type: 'ACCESS_CODE_UPDATE', jwt: 'eyJ...' }`
- Gateway firmware responses: `{ type: 'FIRMWARE_CHUNK_ACK', nonce, chunkIndex, status:'ok'|'error' }`, `{ type: 'FIRMWARE_UPDATE_STATUS', push_id, status, target_type?, version?, error? }`, `{ type: 'FIRMWARE_PROGRESS', push_id, ... }` (optional)

#### Route Pass Audience Formats
- Direct lock access: `lock:{lockId}`
- Shared access: `shared_key:{primaryTenantId}:{lockId}`
  - `primaryTenantId` is the owner of the unit at time of sharing.
  - Lock validation: If a presented pass contains a shared audience and the `primaryTenantId` is on the device denylist, deny the unlock.

### Backend Changes
- Added Ed25519 signing via `jose` and new envs for Ops/Root keys.
- New services: `ed25519.service`, `passes.service`, `fallback.service`, `time-sync.service`, `denylist.service`.
- New API:
  - App: `POST /api/v1/passes/request` (rate-limited)
  - Gateway: `GET /api/v1/internal/gateway/time-sync`, `POST /api/v1/internal/gateway/request-time-sync`, `POST /api/v1/internal/gateway/fallback-pass`
  - Gateway Device Sync (NEW):
    - `POST /api/v1/internal/gateway/devices/inventory` - Sync lock + access_control inventory (mixed `devices[]` with `kind` discriminator; sync-managed removal only)
    - `POST /api/v1/internal/gateway/devices/state` - Partial lock and access_control state updates (`lock_id` or `access_id` + `relay_channel`)
    - `POST /api/v1/internal/gateway/device-sync` (DEPRECATED) - Legacy combined endpoint, use `/devices/inventory` + `/devices/state`
    - `GET /api/v1/internal/gateway/access-codes` - Poll resolved active keypad codes for facility devices
  - Admin: `POST /api/v1/admin/ops-key-rotation/broadcast` (DEV_ADMIN only)
  - Dev Tools (DEV_ADMIN, non-production only): `POST /api/v1/admin/dev-tools/gateway-command` - sends DENYLIST_ADD, DENYLIST_REMOVE, LOCK, UNLOCK commands to gateway for testing
  - Firmware OTA:
    - `POST /api/v1/firmware/upload` - Upload firmware binary (DEV_ADMIN only, multer multipart)
    - `GET /api/v1/firmware` - List active firmware (ADMIN/DEV_ADMIN/FACILITY_ADMIN)
    - `GET /api/v1/firmware/:id` - Get firmware details
    - `DELETE /api/v1/firmware/:id` - Soft-delete firmware (DEV_ADMIN only)
    - `POST /api/v1/firmware/:id/push/:gatewayId` - Initiate firmware push (ADMIN/DEV_ADMIN/FACILITY_ADMIN)
    - `GET /api/v1/firmware/push-status/:gatewayId` - Current push state for page hydration
    - `POST /api/v1/firmware/push/:pushId/cancel` - Cancel in-progress push
  - Access Codes & Groups:
    - `GET /api/v1/access-codes/my` - User-specific device/code pairings (facility-scoped RBAC)
    - `GET/PUT /api/v1/access-codes/config/:facilityId` - Access-code policy management (ADMIN/DEV_ADMIN/FACILITY_ADMIN)
    - `GET /api/v1/access-codes?facility_id=...` - Active scoped codes by facility
    - `GET /api/v1/access-codes/effective?facility_id=...` - Effective per-device resolved codes + source scope metadata for admin UX
    - `POST /api/v1/access-codes/rotate` - Forced random rotation
    - `PUT /api/v1/access-codes/manual/set` - Manual code set for scope
    - `POST /api/v1/access-codes/push/:facilityId` - Push signed ACCESS_CODE_UPDATE command to gateway
    - `POST/GET/PUT/DELETE /api/v1/device-groups...` - Generic device group management
- Websocket Gateway at `/ws/gateway` (facility-scoped) for:
  - **Mesh / Docker sim**: see `cursorDocs/gateway-integration.md` (`CLOUD_WS`, `CLOUD_API`, Cloud Run caveats).
  - Secure command delivery (denylist add/remove, time sync) via unicast/broadcast
  - Full REST API proxying over WS using loopback HTTP with facility guard
  - Auth: JWT required; roles allowed: DEV_ADMIN, ADMIN, FACILITY_ADMIN; one facilityId per connection
  - Protocol (JSON frames):
    - Client→Server: `{type:'AUTH', token, facilityId}`, `{type:'PROXY_REQUEST', id, method, path, headers?, query?, body?}`, `{type:'PONG'}`, `{type:'COMMAND_ACK', id, status, message?}`, `{type:'FIRMWARE_CHUNK_ACK', nonce, chunkIndex, status, message?}`, `{type:'FIRMWARE_UPDATE_STATUS', push_id, status, target_type?, version?, error?}`, `{type:'FIRMWARE_PROGRESS', push_id, ...}` (optional)
    - Server→Client: `{type:'AUTH_OK', facilityId, ops_public_key}`, `{type:'PROXY_RESPONSE', id, status, headers?, body?}`, `{type:'PING'}`, `{type:'FIRMWARE_MANIFEST', jwt}`, `{type:'FIRMWARE_CHUNK', jwt}`, `{type:'ACCESS_CODE_UPDATE', jwt}`
  - Facility Guard: FACILITY_ADMIN requests must not target other facilities (path/body checked)
  - Proxy Security: server re-signs a short-lived passthrough JWT with same identity and injects `Authorization: Bearer <token>`
- Login now returns `isDeviceRegistered` for the presented `X-App-Device-Id`.

### RBAC for Route Pass Issuance
Route Passes are scoped by role to enforce least-privilege access:
- **DEV_ADMIN/ADMIN**: Audience includes all locks across all facilities.
- **FACILITY_ADMIN**: Audience limited to locks in facilities the admin is assigned to.
- **TENANT**: Audience limited to locks for units assigned via FMS (`unit_assignments` table).
- **MAINTENANCE**: Audience limited to explicitly granted units (future: `maintenance_unit_access` table).

Pass requests require authentication; device binding via `X-App-Device-Id` (preferred) or latest active device (fallback).

### Denylist Policy (Owner vs Shared Users)
- Owner deactivation:
  - Denylist the owner on devices from both primary and shared units.
  - Inactivate all active, unexpired shares granted by the owner.
  - Do NOT denylist invitees as part of owner deactivation.
- Owner reactivation:
  - Remove owner from device denylists.
  - Reactivate previously deactivated, unexpired shares the owner had granted.
- Per-share revoke (owner or admin revokes a single share):
  - Denylist the invitee on the unit’s devices.
- Per-share (re)grant:
  - Remove the invitee from device denylists for that unit.

### Legacy Cleanup
- Legacy per-lock key distribution and queues are deprecated. A migration exists to drop `device_key_distributions`, `gateway_commands`, `gateway_command_attempts`, and `users.key_status` when ready to finalize removal.

### Firmware OTA Security
- Firmware binaries are uploaded by DEV_ADMIN via DevTools and stored with SHA-256 hash.
- Before delivery, a manifest JWT is signed with the Ops Ed25519 key: `{ cmd_type:'FIRMWARE_MANIFEST', push_id, target_type, version, sha256, size, chunk_count, chunk_size, nonce, compatible_models }`.
- Binary is split into 128KB raw chunks; each chunk is signed as a JWT: `{ cmd_type:'FIRMWARE_CHUNK', nonce, chunk_index, chunk_sha256, data:'<base64>' }`.
- The manifest `nonce` correlates chunk ACKs; the manifest `push_id` correlates `FIRMWARE_UPDATE_STATUS` / `FIRMWARE_PROGRESS` messages (do not substitute one for the other).
- Gateway verifies each JWT using the Ops public key received in `AUTH_OK`.
- After reassembly, gateway verifies full SHA-256 against manifest, then verifies manufacturer signature on the binary.
- Trust chain (no CA required): TLS secures transport → JWT auth verifies gateway identity → `AUTH_OK` delivers Ops public key → public key verifies all signed firmware payloads.
- Push tasks run as background operations with state persisted in `firmware_pushes` table.
- Progress broadcast via `firmware_push_progress` WebSocket subscription (facility-scoped RBAC).

### Access Code Resolution Determinism
- Effective keypad code precedence is deterministic and enforced as:
  - `device` scope override
  - then `device_group` scope override (stable group selection order)
  - then `facility` scope fallback
- For duplicate active rows in a given scope target, newest active row is used.

### Implementation Notes
- Abstractions:
  - `GatewayTransport` interface enables swapping transports (WebSocket/MQTT) without changing callers.
  - `GatewayEventsService` delegates to the active transport (`WebsocketGatewayTransport` by default).
  - `ApiProxyService` handles loopback proxying with optional `GATEWAY_PROXY_BASE_URL` override.
  - `FacilityGuardService` centrally enforces facility scoping for FACILITY_ADMIN proxy calls.
- Defaults and limits:
  - `GATEWAY_MAX_MESSAGE_BYTES` (default 512KB).
  - Keepalive strategy (hardcoded best-practice values, not env-configurable):
    - **RFC6455 `ping` frames every 20s** per connection: helps **LB/NAT/proxy idle** paths (many only count WebSocket control frames, not JSON). **Does not** reset **Cloud Run’s per-request `timeout`** (default 300s); raise `--timeout` on the backend service (see `cursorDocs/gateway-integration.md`).
    - **JSON `PING` after 10s idle**: application-level health check; gateway responds with JSON `PONG`.
    - **Inactivity timeout 30s**: connection closed if no data, JSON `PONG`, or WS `pong` frame received.
    - **Heartbeat sweep every 5s**: frequency at which server evaluates idle timeouts.
    - **TCP keepalive 30s**: OS-level probes on the upgraded socket to detect silent half-open connections.
  - One active connection per facility (latest connection replaces previous).

### Dashboard & widget API scoping
- See **`cursorDocs/dashboard-widgets.md`** for facility-scoped dashboard widgets, notifications RBAC, and related API patterns.


