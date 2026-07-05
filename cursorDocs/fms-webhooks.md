# FMS Webhooks (Storable Edge)

BluLok receives real-time updates from [Storable Edge CloudEvents](https://webhooks.storable.io/event-catalog/discover/events) at a public endpoint per facility.

## Webhook URL

```
POST {API_BASE}/api/v1/fms/webhook/{blulokFacilityId}
```

Configure webhook security in the facility **FMS Integration** tab under **Webhook security**.

## Webhook authentication modes

Per-facility setting: `config.syncSettings.webhookAuthMode`

| Mode | Config value | Use when |
|------|--------------|----------|
| **HMAC signature** (default) | `hmac` | Provider sends HMAC-SHA256 of the raw JSON body (e.g. `X-Storable-Signature`) |
| **Shared secret in header** | `header_secret` | Provider only supports static custom headers (Storable Edge UI) |
| **None** | `none` | Local/dev only — **not for production** |

### HMAC mode (`hmac`)

- Set **HMAC signing secret** in BluLok (shared with provider when available).
- Optional **Signature header name** (default `X-Storable-Signature`).
- BluLok verifies `HMAC-SHA256(secret, rawBody)` against the header (hex or `sha256=<hex>`).

### Header secret mode (`header_secret`)

- Generate a long random **Shared secret value** in BluLok.
- Set **Auth header name** (default `Authorization`).
- Configure the same header + value in the provider's webhook **custom headers** UI.
- Supports plain secret or `Bearer <secret>`.

### No auth mode (`none`)

- Accepts any POST without credentials.
- Logs a security warning on each delivery.
- Intended for local testing only.

Legacy configs without `webhookAuthMode` default to **HMAC** and require `webhookSecret` (same as before).

**Storage:** Auth settings live in `fms_configurations.config` JSON (`syncSettings`); no dedicated DB columns or migration is required when adding new auth modes.

## Envelope format

All events use the same CloudEvents-style envelope:

```json
{
  "id": "<uuid>",
  "time": "2024-01-16T19:10:07Z",
  "type": "com.storedge.tenant.created.v1",
  "attempt_number": 2,
  "sent_at": "2024-01-16T19:10:09Z",
  "body": { }
}
```

## Supported events

| Storable type | BluLok action |
|---|---|
| [com.storedge.tenant.created.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.tenant.created/1) | Create/map tenant user |
| [com.storedge.tenant.updated.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.tenant.updated/1) | Update tenant profile |
| [com.storedge.ledger.moved-in.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.ledger.moved-in/1) | Assign tenant to unit |
| [com.storedge.ledger.moved-out.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.ledger.moved-out/1) | Unassign tenant (does **not** delete users) |
| [com.storedge.unit.created.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.created/1) | Fetch unit from API → create unit |
| [com.storedge.unit.deleted.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.deleted/1) | Remove mapped unit (guarded if assigned/device linked) |
| [com.storedge.unit.overlock-applied.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.overlock-applied/1) | Set `units.is_overlocked = true` |
| [com.storedge.unit.overlock-removed.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.overlock-removed/1) | Clear overlock flag |

## Processing flow

1. Verify signature and parse envelope (`StoredgeProvider`).
2. Deduplicate by envelope `id` (`fms_webhook_events` table). A row is considered **processed** only after the full pipeline succeeds (`processed_at` set). Failed deliveries delete the in-flight row so Storable retries are re-processed; successful deliveries return `duplicate: true` on retry.
3. When **autoAcceptChanges** is off, consecutive webhooks append pending changes to the same open webhook sync log (`changes_pending > 0`) so operators can review/apply one batch.
4. Create or reuse `fms_sync_logs` (`triggered_by = webhook`).
5. Insert `fms_changes` rows (same review/apply pipeline as manual sync).
6. If **autoAcceptChanges** is enabled on the facility FMS config, apply immediately; otherwise changes appear in the FMS review UI.

## Overlock status

- Stored on `units.is_overlocked` (boolean).
- **Effective display status**: when a unit has tenant assignments and `is_overlocked`, UI shows **Overlocked** instead of **Occupied**.
- Cleared automatically when the unit becomes vacant (no assignments).
- Admins can toggle manually via `PUT /api/v1/units/:id/overlock` or the device details page when a lock is assigned to a unit.

## Security

- Webhook route is **public** (no JWT); authenticity relies on configured auth mode (`hmac`, `header_secret`, or `none`).
- **`none` mode must not be used in production** — anyone who knows the URL can inject events.
- `body.facility_id` must match the configured Storable facility ID.
- Facility must have FMS enabled.
