# Device metadata editing

Admin, dev admin, and facility admin users can edit device hardware identity and configuration from **Device Details** via **Edit device**.

## Manual add (facility UI)

From **Facility → Devices → Add device**, BluLok locks require only **hardware serial** and a resolved facility gateway. **Unit assignment is optional** — leave unassigned and assign later from device or unit details. Optional **display name** is stored in `device_settings.displayName` for admin lists.

Access control devices still require name, serial, relay, and location on the configure step.

Create endpoints enforce **facility_admin** gateway scope, **duplicate serial** checks (409), **unit-in-facility** validation, and strip client `createdFromGatewaySync` flags while setting `metadata.manuallyAdded`. Facilities with multiple gateways show a gateway picker in the add-device wizard.

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
