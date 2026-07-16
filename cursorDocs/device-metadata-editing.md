# Device metadata editing

Admin, dev admin, and facility admin users can edit device hardware identity and configuration from **Device Details** via **Edit device**, or set the same fields when **adding a device** from the facility devices tab.

Field names in the UI follow [gateway device inventory payload](./gateway-device-inventory-payload.md) where applicable (`lock_id` → hardware serial, `access_id`, `lock_number`, etc.).

## Manual add (facility UI)

From **Facility → Devices → Add device**:

**BluLok locks** — required: gateway, hardware serial (`lock_id`). Optional: lock number, secondary serial, display name, location note, firmware version, remote lock support, unit assignment. Lock number, display name, and location are stored in `device_settings` (`lockNumber`, `displayName`, `locationDescription`).

**Access control** — required: name, hardware serial (`access_id`), relay channel, location. Optional: device type (gate / elevator / door), access methods, remote lock support, widget timed-open support, and lock-feedback behavior. Disable **Hardware reports open/closed state** for relay-only access points; configure **Assume open for** in seconds (`0` keeps Open immediately available).

Create endpoints enforce **facility_admin** gateway scope, **duplicate serial** checks (409), **unit-in-facility** validation, and strip client `createdFromGatewaySync` flags while setting `metadata.manuallyAdded`. Facilities with multiple gateways show a gateway picker in the add-device wizard.

## Edit device (device details)

The edit dialog exposes the same admin-configurable inventory fields as add:

| UI label | BluLok API / storage | Access control API |
|----------|----------------------|--------------------|
| Hardware serial | `device_serial` (`lock_id`) | `device_serial` (`access_id`) |
| Secondary serial | `serial` | — |
| Lock number | `device_settings.lockNumber` | — |
| Display name | `device_settings.displayName` / `name` | `name` |
| Location | `device_settings.locationDescription` / `location_description` | `location_description` |
| Firmware | `firmware_version` | metadata (read-only in UI for AC) |
| Remote lock | `supports_remote_lock` | `supports_remote_lock` |
| Widget timed open | — | `supports_widget_timed_open` |
| Hardware lock feedback | — | `has_lock_feedback` |
| No-feedback open window | — | `no_feedback_open_timeout_sec` (0–3600 seconds) |
| Device type | — | `device_type` |
| Relay | — | `relay_channel` |
| Access methods | — | `access_methods` |

**Live telemetry** (lock status, online/offline, battery, signal, temperature, last seen) is shown read-only in edit. Gateway state sync is authoritative when `has_lock_feedback=true`. In no-feedback mode, cloud ignores gateway `locked` and owns the temporary logical-open window using the durable `no_feedback_unlock_until` deadline.

Saving other metadata fields while already in no-feedback mode must **not** clear an active open window. Cloud only resets `no_feedback_unlock_until` / forces locked when `has_lock_feedback` actually toggles (and cancels any in-memory open-window timer).

## API

| Method | Path | Roles |
|--------|------|-------|
| `PUT` | `/api/v1/devices/blulok/:id/metadata` | admin, dev_admin, facility_admin (scoped) |
| `PUT` | `/api/v1/devices/access-control/:id/metadata` | admin, dev_admin, facility_admin (scoped) |

Responses include `sideEffects`:

- `identityChanged` — serial and/or relay changed
- `accessCodesPushed` — gateway access-code push ran (access control relay/identity changes)
- `previousIdentity` — audit snapshot when identity changed

## Identity propagation

Access control identity is **`device_serial` (`access_id`) + `relay_channel`**. Changing either in the admin edit dialog is an **identity change** — the cloud row keeps the same UUID, but the gateway-facing target changes.

| Concern | Behavior on identity change |
|---------|------------------------------|
| **Access codes (DB scope)** | Codes remain on stable `device_id` (UUID). No code rows are moved or duplicated. |
| **Gateway push** | `ACCESS_CODE_UPDATE` is re-sent with updated `access_id` + `relay_channel` for that UUID (push may fail silently if gateway offline; `sideEffects.accessCodesPushed` reflects success). |
| **Effective / poll / app APIs** | Resolve from DB after update — new `access_id` and/or `relay_channel` appear immediately. |
| **Gateway inventory sync** | Sets `metadata.adminIdentityOverride` and clears `createdFromGatewaySync` so the row is **not** removed when the gateway still reports the old `{access_id}::{relay}` key. |
| **Conflict checks** | Rejects edits that would collide with another row’s `(gateway_id, device_serial, relay_channel)`. |
| **Units / groups** | Membership uses stable UUID — no rewiring on serial/relay change. |
| **Route passes / LOCK JWT** | Lock/unlock JWTs use hardware serial (`device_id` claim); users refresh passes after serial changes. Relay is not yet in LOCK/UNLOCK JWT (multi-relay same serial: use cloud UUID targeting in future if needed). |

**BluLok serial** is globally unique; updates set `metadata.adminIdentityOverride` so gateway inventory sync does not delete the row when the gateway still reports the old serial.

**Non-identity edits** (name, location, access methods) do not re-push access codes.

## E2E script

Against a running backend:

```bash
cd backend
npm run device-metadata:e2e

# Or target existing devices:
E2E_BLULOK_DEVICE_ID=<uuid> E2E_AC_DEVICE_ID=<uuid> npm run device-metadata:e2e
```

Uses `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` (same defaults as other backend e2e scripts).

The script verifies access-control **relay** and **serial** identity edits: `sideEffects.identityChanged`, `adminIdentityOverride`, metadata mirroring, and stable `device_id`. Full access-code push verification runs in `npm run ws:e2e` (requires live gateway WebSocket).
