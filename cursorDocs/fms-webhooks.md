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
3. When **autoAcceptWebhookChanges** is off (or unset and **autoAcceptChanges** is off), consecutive webhooks append pending changes to the same open webhook sync log (`changes_pending > 0`) so operators can review/apply one batch.
4. Create or reuse `fms_sync_logs` (`triggered_by = webhook`).
5. Insert `fms_changes` rows (same review/apply pipeline as manual sync).
6. If **autoAcceptWebhookChanges** is enabled (or legacy **autoAcceptChanges** when the webhook flag is unset), apply immediately; otherwise changes appear in the **FMS Sync** dashboard widget and Facility FMS tab as **pending review** — click to open the existing change review modal.

### Change review settings (`config.syncSettings`)

| Field | Applies to |
|-------|------------|
| `autoAcceptWebhookChanges` | Inbound webhook events only |
| `autoAcceptChanges` | Full / manual sync (and future scheduled sync) |

When `autoAcceptWebhookChanges` is unset, it falls back to `autoAcceptChanges` for backward compatibility.

### Pending review UI

- **Dashboard FMS Sync widget**: shows an amber **N changes pending review** callout when `fms_sync_status` reports open pending changes; click opens the review modal.
- **Facility → FMS Integration tab**: same banner on load when sync history has `changes_pending > 0`.
- **Apply progress**: when accepting changes in the review modal, a full-panel overlay shows percent complete, operation count, elapsed time, and ETA via `fms_sync_progress` WebSocket events (`step: applying`). Bulk apply uses a 5-minute HTTP timeout; Twilio invites are sent asynchronously so they do not block the batch.
- **Apply order**: changes apply in dependency order — unassignments and tenant removals run before unit status updates; assignments run after. Failed applies remain in the pending list until successfully applied.
- **Tenant removal**: applying `tenant_removed` stamps the facility's FMS entity mapping with `metadata.removed_from_fms_at`, removes the user–facility association, and skips re-detection on later syncs. Tenants who return in FMS clear the stamp when added/updated again.

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

## Gateway Simulator — webhook testing

The **Gateway Simulator** desktop app includes a **Webhooks** catalog (sidebar tab) for local end-to-end testing.

### Sign in

Use the cached **Cloud API session** (same store as user import, separate from gateway setup login):

- **Admin**, **Dev Admin**, or **Facility Admin** can simulate webhooks.
- Only Admin / Dev Admin can import users (unchanged).

Credentials persist in `catalog-session.json` under the simulator data directory.

### Workflow

1. Open the **Webhooks** tab in the simulator sidebar.
2. Sign in against your backend URL (dev quick-login buttons available when the backend is in dev mode).
3. **Refresh** to load webhook-enabled FMS configs via `GET /api/v1/fms/config?webhooks_only=true`.
4. Select a **target facility** — the panel shows provider type, auth mode, and webhook URL.
5. Pick an **event template** (Storable CloudEvents or flat format for simulated/generic REST providers).
6. Edit the payload in **Form**, **JSON**, or review **Headers** (auth headers are applied automatically from FMS config).
7. Click **Send webhook** — the main process POSTs to `POST /api/v1/fms/webhook/{facilityId}` with the correct HMAC or header secret.

### Auth auto-application

| FMS `webhookAuthMode` | Simulator behavior |
|-----------------------|-------------------|
| `hmac` | Signs raw JSON body; default header `X-Storable-Signature` (or configured signature header) |
| `header_secret` | Sends shared secret in configured header (default `Authorization: Bearer …`) |
| `none` | No credentials; warning banner shown in UI |

Additional custom headers can be added in the Headers tab and are merged with auth headers on send.

### API used by simulator

- `GET /api/v1/fms/config?webhooks_only=true` — list configs (RBAC-scoped; includes webhook secrets for authorized roles).
- `POST /api/v1/fms/webhook/{facilityId}` — public receiver (no JWT).

Template definitions live in `gateway-simulator/src/protocol/fms-webhook-templates.ts`.

