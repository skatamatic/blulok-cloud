# Gateway device inventory & state payload reference

Definitive field reference for **lock (BluLok)** and **access control** devices pushed from the Java gateway to BluLok Cloud over the inbound WebSocket **PROXY** API.

**Source of truth (validation):** `backend/src/routes/internal-gateway.routes.ts`  
**Processing:** `backend/src/services/device-sync.service.ts`, `backend/src/utils/gateway-sync.utils.ts`

---

## Transport: WebSocket PROXY_REQUEST

The gateway does **not** POST to HTTP directly. It sends a framed message on `/ws/gateway` after `AUTH`:

```json
{
  "type": "PROXY_REQUEST",
  "id": "<uuid-correlation-id>",
  "method": "POST",
  "path": "/internal/gateway/devices/inventory",
  "headers": { "Content-Type": "application/json" },
  "body": { }
}
```

Cloud responds with `PROXY_RESPONSE` (`status`, `body`, same `id`).

| PROXY field | Required | Type | Notes |
|-------------|----------|------|-------|
| `type` | yes | `"PROXY_REQUEST"` | Fixed |
| `id` | yes | string | Correlates with `PROXY_RESPONSE.id` |
| `method` | yes | string | `"POST"` for inventory/state |
| `path` | yes | string | See endpoints below |
| `headers` | no | object | Typically `{ "Content-Type": "application/json" }` |
| `body` | yes | object | JSON documented in this file |

**Auth:** Facility-scoped JWT in the WebSocket `AUTH` message (Facility Admin). The cloud resolves the gateway row via `gateways.facility_id` — the facility must already have a gateway assigned.

---

## Endpoints

| Purpose | `path` | Body root array |
|---------|--------|-----------------|
| Full inventory reconcile (add/remove sync-managed devices) | `/internal/gateway/devices/inventory` | `devices[]` |
| Partial telemetry / state only | `/internal/gateway/devices/state` | `updates[]` |

---

## Top-level request body fields

Both inventory and state bodies share these optional envelope fields:

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `tid` | no | number \| string | — | Transaction id injected by gateway proxy for correlation (ignored by sync logic) |
| `facility_id` | no* | string (UUID) | from JWT | Target facility. *Required if the JWT is not already facility-scoped |
| `devices` | yes (inventory) | array | — | Mixed lock + access_control items |
| `updates` | yes (state) | array | — | Mixed lock + access_control partial updates |

---

## Device kind (required)

Every element in `devices[]` or `updates[]` **must** include `"kind": "lock"` or `"kind": "access_control"`. The cloud does not infer kind from field presence.

| `kind` | Identity field | Stored as |
|--------|----------------|-----------|
| `"lock"` | `lock_id` (required) | `blulok_devices.device_serial` |
| `"access_control"` | `access_id` (required) | `access_control_devices.device_serial` |

Admin REST APIs use `device_serial` for both device types; the gateway PROXY contract uses **`lock_id`** and **`access_id`** only.

---

## Lock (BluLok) — inventory item (`devices[]`)

Stored in `blulok_devices`. Primary identity: **`lock_id`** (persisted as `device_serial`).

| Field | Required | Type | Default | Enum / constraints | Cloud mapping |
|-------|----------|------|---------|-------------------|---------------|
| `kind` | **yes** | string | — | `"lock"` | Discriminator |
| `lock_id` | **yes** | string | — | non-empty trim | `blulok_devices.device_serial` |
| `lock_number` | no | number | — | — | `device_settings.lockNumber` (create + inventory refresh) |
| `name` | no | string | — | max 255 | `device_settings.displayName` (create + inventory refresh) |
| `location_description` | no | string | — | max 255 | `device_settings.locationDescription` (create + inventory refresh) |
| `state` | no | string | — | `CLOSED`, `OPENED`, `ERROR`, `UNKNOWN` | `lock_status`: CLOSED→locked, OPENED→unlocked, ERROR→error, UNKNOWN→unknown |
| `locked` | no | boolean | — | — | `lock_status` locked/unlocked (if `state` absent) |
| `battery_level` | no | number | — | raw units (typically **mV**, not %) | `battery_level` |
| `battery_unit` | no | string | — | e.g. `"mV"` | accepted; not stored separately |
| `online` | no | boolean | — | — | `device_status` online/offline |
| `signal_strength` | no | number | — | typically dBm | `signal_strength` |
| `temperature_value` | no | number | — | — | `temperature` |
| `temperature_unit` | no | string | — | e.g. `"°C"` | accepted; not stored separately |
| `firmware_version` | no | string | — | — | `firmware_version` |
| `last_seen` | no | string (ISO-8601) or Date | — | — | `last_seen` |

### Lock auto-provision defaults (new inventory row)

When `lock_id` is in the payload but not in the DB, the cloud creates the row then applies any state/telemetry fields from the same inventory item (battery, online, `state`, etc.).

| Cloud field | Default |
|-------------|---------|
| `supports_remote_lock` | `true` |
| `metadata.createdFromGatewaySync` | `true` |
| `lock_status` | From `state` / `locked` when provided; otherwise DB default (`unknown`) |
| `device_status` | From `online` when provided; otherwise DB default (`offline`) |

**Removal:** Omitted sync-managed locks are **deleted**. Manually created locks (`metadata.createdFromGatewaySync` absent) are **preserved** (`skipped_manual` in sync log).

**Cloud-initiated removal (tombstone):** When the cloud deletes inventory via **`DELETE /devices/blulok/:id`** or **`DELETE /devices/access-control/:id`**, it sends **`DEVICE_DELETED`** to the gateway. The gateway should record a local tombstone keyed by `lock_id` or `access_id::relay_channel` and **omit** those devices from subsequent inventory uploads. If the device reappears in inventory before the tombstone is delivered, the cloud cancels the pending outbox row.

**Property refresh:** When an existing lock remains in inventory, non-identity fields (`name`, `lock_number`, `location_description`) are merged into `device_settings`. Changes emit `deviceTelemetryUpdated` → dashboard **`device_status_update`** WebSocket payloads include `name` and `device_settings`.

### Sync-managed metadata (locks and access)

| Flag | Meaning |
|------|---------|
| `metadata.createdFromGatewaySync` | **Canonical.** Row was auto-provisioned from gateway inventory/state; eligible for removal when omitted from the next inventory sync. |
| `metadata.manuallyAdded` | Set on admin UI / REST create — never removed by gateway delta. |

---

## Access control — inventory item (`devices[]`)

Stored in `access_control_devices`. Identity: **`access_id` + `relay_channel`** (composite key `{access_id}::{relay_channel}`).

| Field | Required | Type | Default | Enum / constraints | Cloud mapping |
|-------|----------|------|---------|-------------------|---------------|
| `kind` | **yes** | string | — | `"access_control"` | Discriminator |
| `access_id` | **yes** | string | — | non-empty trim | `device_serial` |
| `relay_channel` | no | integer | **1** | **1–8** | `relay_channel` (relay output on **this** keypad; not globally unique on the gateway) |
| `device_type` | no | string | **`door`** on create | `gate`, `door`, `elevator` | `device_type` |
| `name` | no | string | **`"{access_id} relay {n}"`** | max 255 | `name` (create + inventory refresh) |
| `location_description` | no | string | **`"Gateway relay {n}"`** | max 255 | `location_description` (create + inventory refresh) |
| `online` | no | boolean | — | — | `status` online/offline |
| `locked` | no | boolean | — | — | `is_locked` |
| `last_seen` | no | string (ISO-8601) or Date | — | — | `last_activity` (invalid timestamps skipped; triggers WebSocket when changed) |

### Access control auto-provision defaults (new inventory row)

| Cloud field | Default |
|-------------|---------|
| `access_methods` | `["keypad"]` |
| `metadata.createdFromGatewaySync` | `true` |
| `device_type` | `"door"` if omitted |
| `relay_channel` | **1** if omitted |

After access inventory changes, the cloud **pushes access codes** to the gateway.

**Identity key:** `{access_id}::{relay_channel}` (relay defaults to **1**). Two keypads on the same gateway may both omit `relay_channel` or send `relay_channel: 1` — they remain distinct rows because `access_id` differs.

**Removal:** Same policy as locks — only sync-managed rows removed when omitted.

**Property refresh:** Existing rows get `name`, `location_description`, and `device_type` updates when provided. Changes emit `deviceTelemetryUpdated` → dashboard **`device_status_update`** includes `name` and `location_description`.

### Valid minimal access_control inventory (single-relay hardware)

This payload is accepted (relay defaults to 1):

```json
{
  "kind": "access_control",
  "access_id": "f759bd50-a70e-5bba-81c5-25e9a7c695c1",
  "online": false,
  "last_seen": "2026-05-29T14:08:18.852437Z"
}
```

---

## Lock — state update item (`updates[]`)

Partial update by **`lock_id`**. Only provided fields are written.

| Field | Required | Type | Default | Enum / constraints | Cloud mapping |
|-------|----------|------|---------|-------------------|---------------|
| `kind` | **yes** | string | — | `"lock"` | Discriminator |
| `lock_id` | **yes** | string | — | non-empty | lookup key |
| `lock_number` | no | number | — | — | `device_settings.lockNumber` on auto-create; refreshed on inventory when sent |
| `serial` | no | string | — | non-empty | `serial` column |
| `state` | no | string | — | `CLOSED`, `OPENED`, `ERROR`, `UNKNOWN` | `lock_status` |
| `locked` | no | boolean | — | — | `lock_status` |
| `battery_level` | no | number | — | mV | `battery_level` |
| `battery_unit` | no | string | — | — | ignored |
| `online` | no | boolean | — | — | `device_status` |
| `signal_strength` | no | number | — | — | `signal_strength` |
| `temperature` | no | number | — | — | `temperature` |
| `temperature_value` | no | number | — | — | `temperature` (alias) |
| `temperature_unit` | no | string | — | — | ignored |
| `firmware_version` | no | string | — | — | `firmware_version` |
| `last_seen` | no | ISO-8601 / Date | — | — | `last_seen` |
| `error_code` | no | string \| null | — | — | `error_code` |
| `error_message` | no | string \| null | — | — | `error_message` |
| `source` | no | string | — | `GATEWAY`, `USER`, `CLOUD` | accepted; not persisted on all paths |

Unknown `lock_id` → listed in response `not_found[]`.

---

## Access control — state update item (`updates[]`)

Partial update by **`access_id` + `relay_channel`**.

| Field | Required | Type | Default | Enum / constraints | Cloud mapping |
|-------|----------|------|---------|-------------------|---------------|
| `kind` | **yes** | string | — | `"access_control"` | Discriminator |
| `access_id` | **yes** | string | — | non-empty | lookup with relay |
| `relay_channel` | no | integer | **1** | **1–8** | lookup key |
| `online` | no | boolean | — | — | `status` online/offline |
| `locked` | no | boolean | — | — | `is_locked` |
| `last_seen` | no | ISO-8601 / Date | — | — | `last_activity` (invalid timestamps skipped) |

Unknown composite key → `not_found[]` entry like `KP-001::2`.

### Access control telemetry side effects

When `online`, `locked`, or `last_seen` change on an existing row, the cloud persists the update and emits WebSocket **`device_status_update`** (via `device_status` subscription) so admin UI lists refresh. Invalid `last_seen` values are ignored. Heartbeat-only `last_seen` updates (status unchanged) still broadcast telemetry.

---

## Enum quick reference

### Lock `state` (gateway shorthand)

| Value | Meaning | DB `lock_status` |
|-------|---------|------------------|
| `CLOSED` | Locked | `locked` |
| `OPENED` | Unlocked | `unlocked` |
| `ERROR` | Fault | `error` |
| `UNKNOWN` | Unknown | `unknown` |

### Access `device_type`

| Value | Use |
|-------|-----|
| `gate` | Gate / perimeter |
| `door` | Door (default on auto-provision) |
| `elevator` | Elevator relay |

---

## Mixed inventory example

```json
{
  "facility_id": "fac-uuid",
  "devices": [
    {
      "kind": "lock",
      "lock_id": "3969d612-abcd-4ef0-b123-456789abcdef",
      "lock_number": 2453,
      "firmware_version": "2.10.0",
      "online": true,
      "state": "CLOSED",
      "battery_level": 3423,
      "last_seen": "2026-05-29T14:08:18.852437Z"
    },
    {
      "kind": "access_control",
      "access_id": "KP-7F2A-001",
      "relay_channel": 2,
      "device_type": "door",
      "name": "Main keypad",
      "online": true,
      "locked": true
    }
  ]
}
```

## Success response shape (inventory)

```json
{
  "success": true,
  "message": "Inventory sync completed",
  "data": {
    "gateway_id": "...",
    "added": 1,
    "removed": 0,
    "unchanged": 2,
    "skipped_manual": 0,
    "errors": [],
    "access_control": {
      "added": 0,
      "removed": 0,
      "unchanged": 1,
      "errors": []
    }
  }
}
```

### Multi-door keypad (same `access_id`, different relays)

One physical keypad managing multiple doors appears in cloud inventory as **separate rows** per relay output:

```json
{
  "devices": [
    { "kind": "access_control", "access_id": "f759bd50-a70e-5bba-81c5-25e9a7c695c1", "relay_channel": 1, "name": "Main Door" },
    { "kind": "access_control", "access_id": "f759bd50-a70e-5bba-81c5-25e9a7c695c1", "relay_channel": 2, "name": "Side Door" }
  ]
}
```

Cloud keys: `f759bd50-...::1` and `f759bd50-...::2`. Each row has its own cloud `device_id`; access codes are resolved and pushed per **`device_id` + `access_id` + `relay_channel`**. For **different codes per door**, use **device-scoped** overrides or separate access-code groups — a single group assigns the same code to all member rows.

---

## Inventory sync behavior (access control)

Each sync is a **full reconcile** of what the gateway reports in `devices[]`:

1. **Identity key:** `{access_id}::{relay_channel}` — if `relay_channel` is omitted, cloud uses **1**.
2. **Remove:** Sync-managed rows (`metadata.createdFromGatewaySync`) missing from the payload are deleted. Manually added admin rows (`metadata.manuallyAdded` or not sync-managed) are **kept** and reported as `skipped_manual`.
3. **Add:** Each incoming key not already in the DB is auto-provisioned (unless admin identity override applies — see below).
4. **Update:** Matching keys get state/metadata updates; reported as `unchanged`.

### Two keypads on one gateway

Send **one inventory item per keypad**. Both may use the default relay:

```json
{
  "devices": [
    { "kind": "access_control", "access_id": "KEYPAD-A-UUID", "online": true },
    { "kind": "access_control", "access_id": "KEYPAD-B-UUID", "online": true }
  ]
}
```

Cloud stores two rows: `KEYPAD-A-UUID::1` and `KEYPAD-B-UUID::1`. Relay **1** on keypad A is unrelated to relay **1** on keypad B — uniqueness is per `(gateway, access_id, relay_channel)`, not relay alone.

Include `relay_channel` only when that keypad uses a non-default output (2–8).

### Admin identity override (reconcile)

If an admin manually created a device on relay N with a placeholder serial and `metadata.adminIdentityOverride`, the **first** gateway inventory item for that relay with a new `access_id` updates that row in place (reason: `"Admin identity override reconciled to gateway inventory serial"`). This applies only when exactly **one** override device exists on that relay.

---

## Common validation errors

| HTTP | Message pattern | Cause |
|------|-----------------|-------|
| 400 | `"devices[0]" does not match any of the allowed types` | Missing required `kind`, `lock_id`, or `access_id`, or invalid enum |
| 400 | `lock_id` required | Lock item without `lock_id` |
| 400 | `access_id` required | Access item without `access_id` |
| 400 | `kind` required | Item missing explicit `kind` |
| 403 | facility scope | JWT facility ≠ body `facility_id` |
| 404 | Gateway not found | No gateway row for facility |

---

## Related docs

- `cursorDocs/device-metadata-editing.md` — admin add/edit UI field mapping to these payload names
- `cursorDocs/gateway-integration.md` — WS auth, PROXY, operational notes
- `cursorDocs/facilities-devices-schema.md` — DB schema & admin REST API
- `cursorDocs/firmware-ota-architecture.md` — firmware OTA (separate from inventory sync)
