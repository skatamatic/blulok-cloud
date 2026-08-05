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
| [com.storedge.ledger.moved-in.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.ledger.moved-in/1) | Assign tenant to unit; if mapped unit status/type differs from FMS, also emit companion `unit_updated` |
| [com.storedge.ledger.moved-out.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.ledger.moved-out/1) | Unassign tenant (does **not** delete users); companion `unit_updated` when FMS unit status/type differs (e.g. vacant kick-out / status write) |
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
6. If **autoAcceptWebhookChanges** is enabled (or legacy **autoAcceptChanges** when the webhook flag is unset), **valid** changes are reviewed and applied immediately. Invalid payloads and apply failures stay in the manual review queue (`sync_status = pending_review`, amber UI badges). Partial success shows e.g. “1 applied · 2 need review” in the webhook feed.

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
- **`unit_updated` occupancy self-heal**: BluLok status is assignment-gated. Applying a vacant FMS status (`available` / `maintenance` / `reserved`) **unassigns all tenants** on that unit (denylist via the normal unassign path), **revokes active key shares**, and **deactivates** any tenant who then has no remaining unit assignments and no active shared keys. Applying `occupied` with no current assignment **assigns** the mapped FMS `tenantId` only after the tenant user exists (ordering runs `tenant_added` first); inactive tenants are **reactivated** via the same restore path as `tenant_unit_changed` assign. Unmapped `tenantId` fails clearly rather than inventing a user from the unit payload. Storable does not emit a dedicated unit-status webhook — full sync detects `unit_updated` from unit diffs; **ledger.moved-in / moved-out** webhooks fetch the unit from the FMS API and emit a companion `unit_updated` when mapped BluLok status/type differs, so webhook apply uses the same self-heal path.
- **`tenant_unit_changed` unassign**: last-unit deactivates (same remaining-assignment + shared-key guard as `tenant_removed`). When the unit has **no remaining assignees**, also **revokes active key shares** (same as vacant `unit_updated`).
- **Assign/unassign payload contract**: the action lives in `after_data.action` (assign) or `before_data.action` (unassign) and is resolved from **either** side (`resolveTenantUnitAction`). Unassign rows must send `after_data: null` — an empty object (`{}`) previously made the row sort as an assign and apply as a no-op. A row with no resolvable action fails loudly instead of silently doing nothing.
- **Move-out is the primary unassign**: the companion vacant `unit_updated` is a **backup** that reconciles unit status and clears *all* remaining assignees/shares; it is skipped when the unit is unmapped or the FMS unit fetch fails, so move-out itself must do the tenant-level unassign. Move-out rows for an unmapped tenant or unit are marked **invalid** for review rather than failing during apply.
- **Occupied unit blockers (detection-time)**: BluLok can only store `occupied` once a tenant is assigned, so detection checks up front whether the FMS-named tenant can ever be held (`fms-unit-occupancy-validation.utils.ts`). A `unit_updated` moving a unit to `occupied` is emitted **invalid** when FMS names no tenant, names a tenant missing from the FMS tenant list, or names a tenant this batch cannot create (e.g. **Missing both email and phone number**). The validation error names the unit, the blocking tenant, and the reason, so the row appears as blocked + dismissible instead of failing on every apply until FMS is corrected. Units already reading `occupied`/`overlocked` in BluLok have assignments, so they are never flagged; tenants already mapped, or created earlier in the same batch (`tenant_added` sorts before occupied `unit_updated`), are not blockers. Webhook companion `unit_updated` uses the same check against the batch's `tenant_added` rows, minus the unknown-tenant rule (a webhook batch only sees one event).
- **Unit status is SoT for occupancy (ledger conflicts)**: Storable can disagree with itself — `units.status` vacant while `ledgers/current` still lists a tenant (sandbox units 101/806). BluLok **trusts unit status** for occupancy. Ledger-driven `tenant_unit_changed` **assign** rows against a vacant/maintenance/reserved unit, and **unassign** rows against a unit still `occupied` by that tenant, are emitted **invalid** with a clear “fix the ledger or unit status in your FMS” message so they cannot flip-flop on successive syncs. Vacant `unit_updated` still applies (and may note the conflicting ledger in `impact_summary`). New `tenant_added` only assigns unitIds whose FMS status is occupied; skipped vacant ledger units get their own blocked assign rows.
- **Apply failure toasts**: when apply partially or fully fails, toasts summarize counts by failure reason (e.g. “2 unit updates failed: tenant isn't in BluLok yet — create the tenant first”) using structured `errorDetails` from the apply API—no raw FMS UUIDs or change_type dumps. A single shared reason omits the redundant per-reason count. Failed rows stay in the review modal for inspection.
- **Failure reasons survive reload**: a failed apply writes the reason onto the change row (`markApplyFailed` sets `is_valid = false` + `validation_errors`), so reopening the review queue still explains it instead of showing the row as freshly pending. The card heading reads **This change failed to apply** (vs **Cannot apply this change** for payloads that were never applicable), distinguished by `didFmsChangeFailToApply` — accepted, unapplied, and invalid.
- **Tenant contact identity**: tenants are valid with **email, phone, or both**. When neither is present, review UI shows **Missing both email and phone number** (and impact summary `(no email or phone)`). Pending rows with older email-only copy are rewritten on read.
- **Dismiss changes**: invalid payloads and failed applies can be dismissed individually or in bulk from the review modal (`POST /api/v1/fms/changes/dismiss`). Dismissed changes leave the pending review queue without being applied.
- **Tenant removal**: applying `tenant_removed` stamps the facility's FMS entity mapping with `metadata.removed_from_fms_at`, removes the user–facility association, and skips re-detection on later syncs. When the tenant reappears in FMS, sync emits a restore/update change (even if profile fields are unchanged), apply clears the stamp, re-adds the facility association, and reactivates the user if they were deactivated by removal.
- **Inactive but still in FMS**: If an admin deactivates a tenant who remains present in FMS, the next sync emits `tenant_updated` (even without profile diffs), apply restores/reactivates them and updates profile fields as needed.
- **Webhook realtime UX**: each processed FMS update push sends a facility-scoped in-app notification (`fms_webhook_received`, titled **FMS Update Push**) to admin/dev_admin/facility_admin roles — low priority when auto-applied/no changes, high priority (Action Required) when review is pending — with user-friendly detail rows (update type, subject, status) instead of raw IDs. Broadcasts `fms_sync_status_update` with a facility-scoped `webhookEvent` payload. The facility FMS tab keeps the last 5 webhook entries and live-reconciles stale pending-review badges after apply. Auto-accept that fails partial apply marks `pending_review` (not completed) and does not claim auto-applied.

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

### `unit.created` testing notes

Storable's [`com.storedge.unit.created.v1`](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.created/1) webhook body contains only `unit_id` (plus facility/company IDs) — no unit name, type, or size. BluLok **must fetch the full unit** from the FMS API before creating the change.

When testing with the simulator against a **Storedge** facility:

- Replace the default `unit-demo-001` placeholder with a **real unit UUID** from your Storable facility (create the unit in Storable first, or copy an existing unit's ID from a manual sync).
- If the unit does not exist in FMS, the change appears under **Invalid** with *Could not fetch unit … from FMS API*.

For **simulated** or **generic REST** flat webhooks, you can include inline `unit_number` / `unit_type` fields in the payload when API lookup is unavailable.