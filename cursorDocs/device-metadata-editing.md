# Device metadata editing

Admin, dev admin, and facility admin users can edit device hardware identity and configuration from **Device Details** via **Edit device**, or set the same fields when **adding a device** from the facility devices tab.

Field names in the UI follow [gateway device inventory payload](./gateway-device-inventory-payload.md) where applicable (`lock_id` → hardware serial, `access_id`, `lock_number`, etc.).

## Manual add (facility UI)

From **Facility → Devices → Add device**:

**BluLok locks** — required: gateway, hardware serial (`lock_id`). Optional: lock number, secondary serial, display name, location note, firmware version, remote lock support, unit assignment. Lock number, display name, and location are stored in `device_settings` (`lockNumber`, `displayName`, `locationDescription`).

**Access control** — required: name, hardware serial (`access_id`), relay channel, location. Optional: device type (gate / elevator / door), access methods, remote lock support.

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
| Device type | — | `device_type` |
| Relay | — | `relay_channel` |
| Access methods | — | `access_methods` |

**Live telemetry** (lock status, online/offline, battery, signal, temperature, last seen) is shown read-only in edit — updated by gateway state sync, not editable in admin forms.

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

- **Units / groups / access-code DB scope** use stable device UUIDs — no rewiring on serial change.
- **BluLok serial** is globally unique; updates set `metadata.adminIdentityOverride` so gateway inventory sync does not delete the row when the gateway still reports the old serial.
- **Gateway-sync-managed devices:** lock number and telemetry can be overwritten on the next gateway inventory update unless the row is admin-corrected for serial identity.
- **Access control** updates validate `(gateway_id, relay_channel)` and `(gateway_id, serial, relay)` uniqueness, mirror serial into metadata for lock-command JWTs, and push access codes when relay/identity changes.
- **Route passes** embed serial at issuance; users refresh passes after serial changes.

## E2E script

Against a running backend:

```bash
cd backend
npm run device-metadata:e2e

# Or target existing devices:
E2E_BLULOK_DEVICE_ID=<uuid> E2E_AC_DEVICE_ID=<uuid> npm run device-metadata:e2e
```

Uses `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` (same defaults as other backend e2e scripts).
