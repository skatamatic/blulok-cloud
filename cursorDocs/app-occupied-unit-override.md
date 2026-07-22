# App guide — Occupied Unit Override

Staff unlocking an **occupied** unit (someone else’s) **may** supply a structured reason and optional notes. Occupants unlocking **their own** unit — or a unit shared with them via key share — never need this.

> **Current policy:** override is **optional** (`OCCUPIED_UNIT_OVERRIDE_REQUIRED = false`). Apps can call unlock without override fields; unlocks succeed and Access History simply omits `tenant_unlock_override`. Flip the flag when mobile ships the override UX.

> **Web UI note:** the cloud dashboard still prompts staff for Occupied Unit Override on occupied units (`requiresOccupiedUnitOverride`). That is intentional while the web dialog exists — the API accepts unlocks without override metadata; only the web client continues to collect a reason.

Applies to both paths:

| Path | How unlock happens | Override API |
|------|--------------------|--------------|
| **Cloud remote** | `PUT /api/v1/devices/blulok/:id/lock` | Optional body fields `tenant_override_reason` (+ optional `tenant_override_notes`) |
| **On-ground (BLE / route pass)** | App unlocks at the lock; optional intent first | Optional `POST /api/v1/devices/blulok/:id/occupied-unit-override` |

## Who may send override

| Caller | Unit occupied? | Override |
|--------|----------------|----------|
| Primary / shared assignee or active key-share recipient | yes or no | **Never send** (not applicable) |
| Staff / other non-occupant with access | yes | **Optional** (recommended when UX available) |
| Anyone | no (vacant) | **No** |

When `OCCUPIED_UNIT_OVERRIDE_REQUIRED` is re-enabled, missing staff reason on cloud remote unlock → `400` with `code: TENANT_UNLOCK_OVERRIDE_REQUIRED`. Invalid reason codes (when sent) → `400` / validation error.

On-ground BLE unlocks do **not** require a prior intent call; if an intent was registered, access-event ingestion attaches it when the actor matches and the method is on-ground (`app`, `mobile_key`, or `route_pass`). `admin_remote_open` does not consume an occupied unlock intent.

## Reason codes

Same codes as the cloud UI dialog:

- `tenant_locked_phone` — Tenant locked phone in unit
- `emergency` — Emergency (Fire, flood, other)
- `testing_maintenance` — Testing and/or Maintenance

Optional `notes` / `tenant_override_notes` max **500** characters.

## Cloud remote unlock

```http
PUT /api/v1/devices/blulok/{deviceId}/lock
Authorization: Bearer <user-jwt>
Content-Type: application/json

{
  "lock_status": "unlocked",
  "tenant_override_reason": "emergency",
  "tenant_override_notes": "optional"
}
```

Minimum body (works today):

```json
{ "lock_status": "unlocked" }
```

Occupants omit the override fields entirely. Until override is required again, staff may also omit them.

Pending remote attribution (who initiated the remote command) is separate from override reason metadata and always works from the authenticated user. It expires with the facility lock-command timeout, or **60s** in one-shot mode, and is consumed only on a **real** lock-status transition matching the command (never a same-state telemetry re-report).

## On-ground intent (optional, before BLE unlock)

1. Staff completes the override form in the app (when UX is available).
2. App calls:

```http
POST /api/v1/devices/blulok/{deviceId}/occupied-unit-override
Authorization: Bearer <user-jwt>
Content-Type: application/json

{
  "reason": "emergency",
  "notes": "optional"
}
```

Success:

```json
{
  "success": true,
  "data": {
    "intent_id": "<uuid>",
    "expires_at": "<iso8601>",
    "device_id": "<uuid>",
    "unit_id": "<uuid>"
  }
}
```

3. App proceeds with route-pass / BLE unlock within the TTL (**default 60s**, env `OCCUPIED_UNLOCK_INTENT_TTL_SEC`, clamped 15–120).
4. Gateway reports `POST …/access-events` (grant) then `devices/state` (unlocked). Cloud stamps Access History with `tenant_unlock_override` when the access-event actor matches the intent user (optional `metadata.occupied_unlock_intent_id` for stricter binding).

Skipping step 1–2 is fine: BLE unlock still works; Access History just won’t include override reason metadata.

Error codes (only when calling the optional intent endpoint):

| Code | Meaning |
|------|---------|
| `TENANT_UNLOCK_OVERRIDE_NOT_REQUIRED` | Unit vacant / not applicable |
| `TENANT_UNLOCK_OVERRIDE_NOT_APPLICABLE` | Caller is occupant/share recipient |
| `OCCUPIED_UNLOCK_INTENT_IN_USE` | Another user’s intent is already pending for this device |

## Access History

When override was supplied, successful staff unlocks (remote or on-ground) include:

```json
"tenant_unlock_override": {
  "reason": "emergency",
  "reason_label": "Emergency (Fire, flood, other)",
  "notes": "…"
}
```

Related: [gateway-access-events.md](./gateway-access-events.md), [access-notifications-activity-apis.md](./access-notifications-activity-apis.md).
