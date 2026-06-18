# Gateway Swap / Recovery Architecture

When a facility gateway is replaced, the cloud must not trust inventory from the new hardware until a phased recovery completes. This document describes the cloud-side state machine, gating rules, WebSocket protocol extensions, and REST API.

**Operational guide (sys admins + gateway developers):** [Gateway Swap / Recovery — Operator & Developer Guide](./gateway-swap-recovery-operators-guide.md)

See also: [Firmware OTA Architecture](./firmware-ota-architecture.md).

## Problem

- `POST /internal/gateway/devices/inventory` deletes sync-managed locks omitted from the payload. A new gateway reporting partial inventory can wipe cloud devices.
- Previously, WebSocket AUTH was facility-scoped with "last AUTH wins", allowing a replacement unit to take over silently.

## Identity binding

Gateways send optional `gatewayId` (GUID from `gateways.id`) in the AUTH message:

```json
{ "type": "AUTH", "token": "…", "facilityId": "…", "gatewayId": "…" }
```

Transport behavior:

| Case | Result |
|------|--------|
| `gatewayId` matches bound facility gateway | Active session (replaces same-GUID connection only) |
| `gatewayId` differs from bound gateway | Parked as **swap candidate** if `gateway.facility_id` is null or matches this facility; rejected otherwise |
| No `gatewayId` (legacy) | Legacy active session (rollout compatibility) |

`AUTH_OK` includes `sessionRole`: `active`, `swap_candidate`, or `legacy`.

## Recovery state machine

Statuses: `detected` → `awaiting_config` → `firmware` → `provisioning` → `inventory_push` → `complete` (or `failed`, `cancelled`, `bypassed`).

Phases delegate to existing services:

1. **Firmware** — `FirmwareService.initiatePush` (default: highest semver `target_type=gateway`)
2. **Provisioning** — `ProvisioningRestoreService.initiateRestore` (default: most recent backup)
3. **Inventory push** — new `INVENTORY_SNAPSHOT_*` chunk protocol

Child operation completion is watched to auto-advance. On `complete`, device rows are rebound to the new gateway and the swap candidate WS is promoted to the active session.

## Command gating

While recovery is active (not `complete` or `bypassed`):

**Inbound (blocked):**

- `POST /internal/gateway/devices/inventory` → **409** `recovery_in_progress`

**Outbound (blocked via `GatewayEventsService.unicastToFacility`):**

- Lock commands (`LockCommandService`)
- Access-code push (`ACCESS_CODE_UPDATE`)
- Denylist add/remove (`DENYLIST_ADD`, `DENYLIST_REMOVE`)

Operational JWT/object commands are dropped when a blocking recovery is active. Recovery push messages (`FIRMWARE_*`, `PROVISIONING_*`, `INVENTORY_SNAPSHOT_*`) are still delivered.

**Recovery push routing:** During `firmware`, `provisioning`, or `inventory_push`, recovery outbound messages route to the parked swap-candidate WebSocket only. If the swap candidate is offline, recovery push messages are **dropped** (not sent to the bound gateway). Operational traffic continues to the bound (active) gateway session until finalize promotes the candidate.

**Inbound recovery messages:** While a recovery push target is armed, firmware/provisioning/inventory ACK and status messages are accepted **only** from the swap-candidate session whose `gatewayId` matches the armed target. The bound gateway cannot spoof recovery status.

**Online checks during recovery:** Chunk push `isOnline` and provisioning restore preflight use swap-candidate connectivity when a recovery push target is armed (not merely “any gateway connected”).

**Disconnect handling:** Active gateway disconnect does not pause recovery pushes when the swap candidate remains online. Swap-candidate disconnect pauses only recovery-linked pushes.

**Bypass:** `POST …/recovery/bypass` requires platform admin (`ADMIN` / `DEV_ADMIN`) and `confirm: true`.

**Concurrency:** At most one non-terminal recovery per facility (`active_facility_key` unique index, migration 079).

**Blocking check:** `isBlockingActiveForFacility` fails closed (treats DB errors as blocking). A TTL-backed in-memory cache (5s) backs fast outbound gating via `isBlockingActiveForFacilitySync`.

**On complete/bypass:** `finalizeRecovery` rebinds device rows to the new gateway inside a DB transaction, clears `facility_id` on the old gateway, sets `facility_id` on the new gateway, evicts the previous bound WebSocket session, and promotes the swap candidate when connected.

**Failed recovery:** `failed` is terminal — inventory sync is unblocked so operators can retry or intervene. Outbound gating re-engages when a retry enters an active phase.

**Inventory verify timeout:** After all inventory chunks are sent, the cloud waits up to 5 minutes for `INVENTORY_SNAPSHOT_STATUS success`; otherwise recovery moves to `failed`. Success is only accepted when recovery status is `inventory_push`.

**Allowed:** firmware/provisioning/inventory snapshot chunks, ACK/status messages, time-sync, access-code poll, non-destructive state updates.

## Inventory snapshot protocol (cloud → gateway)

Mirrors provisioning restore chunk flow via `GatewayChunkPushEngine`:

| Message | Direction |
|---------|-----------|
| `INVENTORY_SNAPSHOT_MANIFEST` | Cloud → gateway |
| `INVENTORY_SNAPSHOT_CHUNK` | Cloud → gateway |
| `INVENTORY_SNAPSHOT_CHUNK_ACK` | Gateway → cloud |
| `INVENTORY_SNAPSHOT_STATUS` | Gateway → cloud (`success` / failure) |
| `INVENTORY_SNAPSHOT_STATUS_ACK` | Cloud → gateway |
| `INVENTORY_SNAPSHOT_RESUME` | Cloud → gateway (reconnect) |

Gateway firmware must rebuild its device DB from the snapshot and reply `INVENTORY_SNAPSHOT_STATUS` with `status: success` and the `recovery_id` / `snapshot_id`.

**Snapshot schema v2** includes operational devices (locks, access control) plus sync-managed network infra (`bridge`, `friend_node`). The facility **gateway entity itself is never included** in the snapshot payload.

## REST API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/gateways/:gatewayId/recovery/status` | Active/latest recovery |
| GET | `/gateways/facility/:facilityId/recovery/candidates` | Parked swap candidates |
| GET | `/gateways/:gatewayId/recovery/inventory-preview` | Devices in snapshot |
| POST | `/gateways/:gatewayId/recovery/initiate` | Start phased recovery |
| POST | `/gateways/:gatewayId/recovery/advance` | Manual phase advance |
| POST | `/gateways/:gatewayId/recovery/bypass` | Escape hatch (`confirm: true`) |
| GET | `/gateways/:gatewayId/recovery/options` | Firmware + provisioning backup selectors |
| GET | `/gateways/:gatewayId/recovery/:recoveryId/events` | Recovery event timeline |
| POST | `/gateways/:gatewayId/recovery/retry` | Retry failed recovery from last configured phase |
| POST | `/gateways/:gatewayId/recovery/:recoveryId/cancel` | Cancel |

Dashboard WebSocket subscription: `gateway_recovery_progress` → `gateway_recovery_progress_update`.

## Testing

- Backend: `npm run test:serial`
- Frontend: `npm test`
- Integration: `npm run ws:e2e` (Gateway Swap Recovery section; skip with `SKIP_SWAP_RECOVERY_E2E=1` locally only)

## Gateway firmware dependencies

1. Send `gatewayId` in AUTH.
2. Handle `INVENTORY_SNAPSHOT_*` messages (manifest, chunks, resume).
3. Reply `INVENTORY_SNAPSHOT_STATUS success` after applying snapshot.
