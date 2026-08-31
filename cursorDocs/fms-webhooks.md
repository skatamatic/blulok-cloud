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
| [com.storedge.lead.moved-in.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.lead.moved-in/1) | Same assign path as ledger move-in. Storable fires this when a **lead converts to occupancy**; `ledger_id` is often still null. If both lead + ledger move-in arrive, the second assign is a no-op. |
| [com.storedge.ledger.moved-out.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.ledger.moved-out/1) | Unassign tenant (does **not** delete users); companion `unit_updated` when FMS unit status/type differs (e.g. vacant kick-out / status write) |
| [com.storedge.unit.created.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.created/1) | Fetch unit from API → create unit |
| [com.storedge.unit.deleted.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.deleted/1) | Remove mapped unit (guarded if assigned/device linked) |
| [com.storedge.unit.overlock-applied.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.overlock-applied/1) | Set `units.is_overlocked = true` |
| [com.storedge.unit.overlock-removed.v1](https://webhooks.storable.io/event-catalog/docs/events/com.storedge.unit.overlock-removed/1) | Clear overlock flag |

## Other catalog events (recorded, not applied)

Valid Storable CloudEvents that BluLok does not act on (contacts, insurance, gate-access, `lead.created`, `lead.cancelled`, and any unrecognized `com.storedge.*` type) are **acknowledged** (`200`) and stored as `status=ignored`. This stops Storable retries and keeps the payload in the webhook log for review.

**Lead vs ledger (current call):** apply `lead.moved-in` and `ledger.moved-in` as occupancy assigns. Ignore `lead.created` / `lead.cancelled` until we have production evidence they should create or revoke BluLok users. Revisit if a site only fires lead events for reservations that should get keys.

## Webhook log (FMS setup)

- Facility admins see the last **5 successful** (`processed`) events.
- **Admin / Dev Admin** see the last **20** events including **failed** and **ignored**. Collapsed rows show only the event title, time, and outcome badge (Failed / Not applied / Auto-applied / Pending review / etc.). Technical `error_message` and the raw JSON envelope (`raw_payload`) stay behind an expand on that row.
- Failed apply/processing keeps the row (`status=failed`, `error_message`) instead of deleting it. A later Storable retry of the same envelope `id` reprocesses that failed row.

## Processing flow

1. Verify signature and parse envelope (`StoredgeProvider`). Unknown catalog types no longer throw.
2. Deduplicate by envelope `id` (`fms_webhook_events` table). A row is considered **processed** when `status` is `processed` or `ignored`. Failed rows (`status=failed`) are retried. Successful / ignored deliveries return `duplicate: true` on retry.
3. When **autoAcceptWebhookChanges** is off (or unset and **autoAcceptChanges** is off), consecutive webhooks append pending changes to the same open webhook sync log (`changes_pending > 0`) so operators can review/apply one batch.
4. Create or reuse `fms_sync_logs` (`triggered_by = webhook`).
5. Insert `fms_changes` rows (same review/apply pipeline as manual sync).
6. If **autoAcceptWebhookChanges** is enabled (or legacy **autoAcceptChanges** when the webhook flag is unset), **valid** changes are reviewed and applied immediately. Invalid payloads and apply failures stay in the manual review queue (`sync_status = pending_review`, amber UI badges). Partial success shows e.g. “1 applied · 2 need review” in the webhook feed.

### Change review settings (`config.syncSettings`)

| Field | Applies to |
|-------|------------|
| `autoAcceptWebhookChanges` | Inbound webhook events only |
| `autoAcceptChanges` | Full / manual sync (and future scheduled sync) |
| `invitePolicy` | When newly created FMS tenants receive invite SMS/email |

When `autoAcceptWebhookChanges` is unset, it falls back to `autoAcceptChanges` for backward compatibility.

### Tenant invite policy (`config.syncSettings.invitePolicy`)

Controls whether FMS-created (or placeholder-upgraded) tenants automatically receive invite SMS/email. Stored in the facility `fms_configurations.config` JSON — **no migration**.

| Value | Behavior |
|-------|----------|
| `none` (default when unset) | Never auto-send. Row recorded in `deferred_user_invites` (`reason=policy_none`). Admins can still invite manually. |
| `device_equipped` | Auto-send only when the tenant is assigned to a unit that has a BluLok device. Otherwise defer (`reason=awaiting_blulok_device`) until a device is assigned or the tenant is assigned to an equipped unit. |
| `all` | Auto-send to every non-placeholder tenant with email or phone. |

**Breaking change on deploy:** existing facilities that previously always invited will default to `none` until an admin sets a policy. Configure under Facility → FMS Integration → Tenant invites.

Deferred invites with `awaiting_blulok_device` are resolved by `DeferredInviteListenerService` (subscribes to `tenant:assigned` and `deviceAssigned`). Concurrent handlers claim the deferred row atomically before sending to avoid duplicate invites; a failed send reopens the claim. `deferred_user_invites.user_id` is unique — re-deferring after resolve reopens the existing row. Manual `POST /users/:id/resend-invite` and account reset bypass the policy.

### Pending review UI

- **Dashboard FMS Sync widget**: shows an amber **N changes pending review** callout when `fms_sync_status` reports open pending changes; click opens the review modal.
- **Dashboard notifications**: `fms_webhook_received` / `fms_sync_complete` cards that still need review show a **Review changes** button, which opens the same modal via `metadata.syncLogId` (or `reference.id` on older `fms_sync` rows). The widget re-checks each referenced sync log (`changes_pending`); after apply or dismiss the button is hidden and the copy says those changes have **already been reviewed or dismissed**. Consecutive unread `fms_webhook_received` cards for the same facility + tenant collapse into one expandable card (each event listed under **Each update**). A different notification in between, or a card that is already read, starts a new group. Once a run has been grouped, those instance ids stay together after they are marked read (the stack stays one card). Independently read cards are not retroactively grouped. When auto-apply is blocked — invalid payloads, mapping collisions (shared email/phone), or apply failures — the card is **Action Required**, explains that **automatic sync did not apply because a problem was detected**, includes the first operator-facing reason, and tells the admin to open review for the fix (unique FMS contact per tenant, or remap the user). Successful no-review `fms_sync_complete` cards stay informational and do not show the button.
- **Facility → FMS Integration tab**: same banner on load when any non-failed sync log still has `changes_pending > 0` (a later failed full sync does not hide an earlier webhook batch).
- **Full sync cleanup**: starting a manual/scheduled sync discards only previous **manual/automatic** pending-review batches. Webhook review rows stay so occupancy events are not deleted when a later full sync fails.
- **Shared FMS contacts vs mapped collisions**: email and phone may be shared. Each tenant still needs **one exclusive contact** as `login_identifier` (`UserLoginIdentityService`). HQ testers with distinct emails (`t2@` / `t3@`) and the same `+12504882375` become **two users** (valid `TENANT_ADDED`, email logins, phone is contact-only). A tenant with **no** exclusive email or phone is an invalid `TENANT_ADDED` (`NO_UNIQUE_LOGIN_HANDLE`). Email and phone that exclusively belong to **two different** users is `IDENTITY_CONFLICT`. Grouped collision rows (`after_data.collidingExternalIds`) are only for a tenant that matches a BluLok user **already mapped to a different FMS id** — never merge two FMS mappings onto one user.
- **Apply progress**: when accepting changes in the review modal, a full-panel overlay shows percent complete, operation count, elapsed time, and ETA via `fms_sync_progress` WebSocket events (`step: applying`). Bulk apply uses a 5-minute HTTP timeout; Twilio invites are sent asynchronously so they do not block the batch.
- **Apply order**: changes apply in dependency order — unassignments and tenant removals run before unit status updates; assignments run after. Failed applies remain in the pending list until successfully applied.
- **`unit_updated` occupancy self-heal**: BluLok status is assignment-gated. Applying a vacant FMS status (`available` / `maintenance` / `reserved`) **unassigns all tenants** on that unit (denylist via the normal unassign path), **revokes active key shares**, and **deactivates** any tenant who then has no remaining unit assignments and no active shared keys. Applying `occupied` with no current assignment **assigns** the mapped FMS `tenantId` only after the tenant user exists (ordering runs `tenant_added` first); inactive tenants are **reactivated** via the same restore path as `tenant_unit_changed` assign. Unmapped `tenantId` fails clearly rather than inventing a user from the unit payload. Storable does not emit a dedicated unit-status webhook — full sync detects `unit_updated` from unit diffs; **ledger.moved-in / moved-out** webhooks fetch the unit from the FMS API and emit a companion `unit_updated` when mapped BluLok status/type differs, so webhook apply uses the same self-heal path. Single-resource GETs unwrap `{ unit }` / `{ tenant }` envelopes (same shape as collection lists). Companion rows always persist `external_id` from the fetched unit or the webhook `unit_id`. An unusable fetch (no id/status after unwrap) skips the companion so the assign/unassign still records instead of failing MySQL `external_id` NOT NULL.
- **`tenant_unit_changed` unassign**: last-unit deactivates (same remaining-assignment + shared-key guard as `tenant_removed`). When the unit has **no remaining assignees**, also **revokes active key shares** (same as vacant `unit_updated`).
- **Assign/unassign payload contract**: the action lives in `after_data.action` (assign) or `before_data.action` (unassign) and is resolved from **either** side (`resolveTenantUnitAction`). Unassign rows must send `after_data: null` — an empty object (`{}`) previously made the row sort as an assign and apply as a no-op. A row with no resolvable action fails loudly instead of silently doing nothing.
- **Move-out is the primary unassign**: the companion vacant `unit_updated` is a **backup** that reconciles unit status and clears *all* remaining assignees/shares; it is skipped when the unit is unmapped or the FMS unit fetch fails, so move-out itself must do the tenant-level unassign. Move-out rows for an unmapped tenant or unit are marked **invalid** for review rather than failing during apply.
- **Occupied unit blockers (detection-time)**: BluLok can only store `occupied` once a tenant is assigned, so detection checks up front whether the FMS-named tenant can ever be held (`fms-unit-occupancy-validation.utils.ts`). A `unit_updated` moving a unit to `occupied` is emitted **invalid** when FMS names no tenant, names a tenant missing from the FMS tenant list, or names a tenant this batch cannot create (e.g. missing first/last name) **and there is no invalid `tenant_added` already covering that tenant**. If `tenant_added` is already blocked, the occupied unit row is omitted — the tenant card is the root problem. Units already reading `occupied`/`overlocked` in BluLok have assignments, so they are never flagged; tenants already mapped, or created earlier in the same batch (`tenant_added` sorts before occupied `unit_updated`), are not blockers. **Missing email and phone is not a blocker** — those tenants become non-loginable placeholders. Webhook companion `unit_updated` uses the same check against the batch's `tenant_added` rows, minus the unknown-tenant rule (a webhook batch only sees one event).
- **Unit status is SoT for occupancy (ledger conflicts)**: Storable can disagree with itself — `units.status` vacant while `ledgers/current` still lists a tenant (sandbox units 101/806). BluLok **trusts unit status** for occupancy. Ledger-driven `tenant_unit_changed` **assign** rows against a vacant/maintenance/reserved unit, and **unassign** rows against a unit still `occupied` by that tenant, are emitted **invalid** with a clear “fix the ledger or unit status in your FMS” message so they cannot flip-flop on successive syncs. Multiple vacant ledger units **or** multiple occupied unassigns for the **same tenant** collapse into one blocked row. Vacant `unit_updated` still applies (and may note the conflicting ledger in `impact_summary`). New `tenant_added` only assigns unitIds whose FMS status is occupied; skipped vacant ledger units share that one blocked assign row.
- **Review UI grouping**: the change-review modal titles every blocked row as a **problem** (not the raw change type) and clusters leftover sibling invalids from earlier syncs into one card per root cause: already mapped to another FMS tenant, no unique login handle, ledger vs vacant unit status, ledger vs occupied unit status, incomplete tenant plus leftover occupied-unit rows, unmapped tenant/unit, and failed FMS unit fetches. Dismiss on a grouped card dismisses every stored row in that cluster. Opaque FMS UUIDs are hidden in the card copy. Action chips are omitted on blocked cards because those changes cannot be applied.
- **Apply failure toasts**: when apply partially or fully fails, toasts summarize counts by failure reason (e.g. “2 unit updates failed: tenant isn't in BluLok yet — create the tenant first”) using structured `errorDetails` from the apply API—no raw FMS UUIDs or change_type dumps. A single shared reason omits the redundant per-reason count. Failed rows stay in the review modal for inspection.
- **Failure reasons survive reload**: a failed apply writes the reason onto the change row (`markApplyFailed` sets `is_valid = false` + `validation_errors`), so reopening the review queue still explains it instead of showing the row as freshly pending. The card heading reads **This change failed to apply** (vs **Cannot apply this change** for payloads that were never applicable), distinguished by `didFmsChangeFailToApply` — accepted, unapplied, and invalid.
- **Tenant contact identity / placeholders**: tenants are valid with **email, phone, both, or neither**. When neither is present, sync/apply creates a real `users` row with `is_placeholder=true`, reserved `login_identifier` `fms-ph:{facilityId}:{externalId}`, and no invite. Auth rejects login; UI shows a **No login** badge. When FMS or an admin later adds email/phone, the placeholder is upgraded (`is_placeholder=false`, normal login identity) and invite delivery follows **`invitePolicy`** (may send or defer). Review impact labels use `placeholder — no login`. Stale pending rows that still carry older “missing email/phone” identity errors are rewritten on read (contact-only errors stripped so the row becomes valid).
- **Dismiss changes**: invalid payloads and failed applies can be dismissed individually or in bulk from the review modal (`POST /api/v1/fms/changes/dismiss`). Dismissed changes leave the pending review queue without being applied.
- **Tenant removal**: applying `tenant_removed` stamps the facility's FMS entity mapping with `metadata.removed_from_fms_at`, removes the user–facility association, and skips re-detection on later syncs. When the tenant reappears in FMS, sync emits a restore/update change (even if profile fields are unchanged), apply clears the stamp, re-adds the facility association, and reactivates the user if they were deactivated by removal.
- **Inactive but still in FMS**: If an admin deactivates a tenant who remains present in FMS, the next sync emits `tenant_updated` (even without profile diffs), apply restores/reactivates them and updates profile fields as needed.
- **Webhook realtime UX**: each processed FMS update push sends a facility-scoped in-app notification (`fms_webhook_received`, titled **FMS Update Push**) to admin/dev_admin/facility_admin roles — low priority when auto-applied/no changes, high priority (Action Required) when review is pending — with user-friendly detail rows (update type, subject, status) instead of raw IDs. Subject uses the BluLok unit number and tenant name when mapped (e.g. `Unit WS-01` or `Jane Doe · Unit 101`); Storable `unit_id` / `tenant_id` UUIDs are never shown. Existing notifications that already stored a UUID subject hide it on read. Broadcasts `fms_sync_status_update` with a facility-scoped `webhookEvent` payload. The facility FMS tab keeps the last 5 webhook entries and live-reconciles stale pending-review badges after apply. Auto-accept that fails partial apply marks `pending_review` (not completed) and does not claim auto-applied. A feed row with 0 applied and no remaining review queue labels **Not applied** (not `0/3 applied`).

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