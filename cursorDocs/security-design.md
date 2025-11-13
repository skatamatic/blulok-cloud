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

### Data Artifacts
- Route Pass (JWT, Ed25519): `iss`, `sub`, `aud[]`, `iat`, `exp`, `jti`, `device_pubkey`.
- Denylist Update Command: `[ { cmd_type:'DENYLIST_ADD', denylist_add:[{ sub, exp }], targets: { device_ids: [...] } }, signature ]`.
- Secure Time Sync Command: `[ { cmd_type:'SECURE_TIME_SYNC', ts }, signature ]`.

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
  - Admin: `POST /api/v1/admin/ops-key-rotation/broadcast` (DEV_ADMIN only)
- Gateway WS at `/ws/gateway` for event push (denylist/time-sync broadcast/unicast).
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


