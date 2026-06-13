# Gateway Provisioning Data Backup & Restore

Field gateways upload mesh provisioning zip backups to the cloud (up to **500 MB**). Admins manage backup history, request uploads from online gateways, and restore backups to a replacement gateway using the same ACK-gated WebSocket chunk protocol as firmware OTA.

## Storage

- **Bucket:** Reuses firmware GCS bucket / `storage.firmware.*` system settings
- **Prefix:** `provisioning/{gatewayId}/{backupId}/{filename}`
- **Max size:** 500 MB (`PROVISIONING_MAX_SIZE_BYTES`)
- **Validation:** `.zip` extension only; `application/zip` on resumable session

## Gateway → Cloud upload

Gateway (or cloud after upload request) uses internal PROXY routes:

| Route | Body | Response |
|-------|------|----------|
| `POST /api/v1/internal/gateway/provisioning/prepare` | `{ filename, size_bytes, facility_id? }` | `{ upload_id, upload_url, upload_headers, gateway_id }` |
| `POST /api/v1/internal/gateway/provisioning/complete` | `{ upload_id, filename, size_bytes, upload_source? }` | `{ backup }` (sanitized, no `storage_path`) |

Flow:

1. `prepare` — validate zip + size, create GCS resumable session
2. Gateway `PUT` zip directly to GCS
3. `complete` — verify object size + SHA-256, insert `gateway_provisioning_backups` row

`upload_source`: `gateway_push` (default) or `cloud_requested`.

## Cloud-initiated upload request

Admin UI or `POST /api/v1/gateways/:gatewayId/provisioning/request-upload` sends:

```json
{ "type": "PROVISIONING_UPLOAD_REQUEST", "jwt": "<signed>" }
```

JWT payload:

```json
{
  "cmd_type": "PROVISIONING_UPLOAD_REQUEST",
  "request_id": "<uuid>",
  "expires_at": "<unix_sec>"
}
```

Gateway should reject expired JWTs, then run prepare → PUT → complete with `upload_source: cloud_requested`.

## Cloud → Gateway restore

Admin `POST /api/v1/gateways/:gatewayId/provisioning/:backupId/restore` starts a restore push.

### WebSocket messages

**Outbound (cloud → gateway):**

| Type | JWT `cmd_type` |
|------|----------------|
| `PROVISIONING_MANIFEST` | `PROVISIONING_MANIFEST` |
| `PROVISIONING_CHUNK` | `PROVISIONING_CHUNK` |
| `PROVISIONING_UPLOAD_REQUEST` | `PROVISIONING_UPLOAD_REQUEST` |
| `PROVISIONING_RESTORE_RESUME` | (envelope only, on reconnect) |

**Manifest JWT fields:** `restore_id`, `backup_id`, `filename`, `sha256`, `size_bytes`, `chunk_count`, `chunk_size`, `nonce`

**Inbound (gateway → cloud):**

| Type | Purpose |
|------|---------|
| `PROVISIONING_CHUNK_ACK` | Per-chunk ACK (`nonce`, `chunkIndex`, `status`) |
| `PROVISIONING_RESTORE_STATUS` | Terminal success/failure after apply |

Cloud replies with `PROVISIONING_RESTORE_STATUS_ACK`.

Chunk size matches firmware: `FIRMWARE_CHUNK_SIZE_BYTES` (~2.25 MB raw).

## Admin API

| Method | Path | Roles |
|--------|------|-------|
| GET | `/api/v1/gateways/:gatewayId/provisioning` | ADMIN, DEV_ADMIN, FACILITY_ADMIN |
| DELETE | `/api/v1/gateways/:gatewayId/provisioning/:backupId` | ADMIN, DEV_ADMIN |
| POST | `/api/v1/gateways/:gatewayId/provisioning/request-upload` | ADMIN, DEV_ADMIN, FACILITY_ADMIN |
| POST | `/api/v1/gateways/:gatewayId/provisioning/:backupId/restore` | ADMIN, DEV_ADMIN, FACILITY_ADMIN |
| GET | `/api/v1/gateways/:gatewayId/provisioning/restore-status` | ADMIN, DEV_ADMIN, FACILITY_ADMIN |
| POST | `/api/v1/gateways/:gatewayId/provisioning/restore/:restoreId/cancel` | ADMIN, DEV_ADMIN, FACILITY_ADMIN |

## UI

**Facility Gateway → Provisioning Data** tab (`GatewayProvisioningTab`):

- Backup list (filename, size, uploaded, source)
- Request backup from gateway (requires WS online)
- Restore with progress (chunk count, cancel)
- Delete (platform admins only)

## Database

- `gateway_provisioning_backups` — catalog rows
- `gateway_provisioning_restores` — in-flight / history restores (one active per gateway)
- `gateway_provisioning_restore_events` — optional event log

## Gateway firmware contract (v1)

1. On `PROVISIONING_UPLOAD_REQUEST`: call internal prepare → PUT zip → complete.
2. On `PROVISIONING_MANIFEST` + chunks: ACK each chunk; apply zip locally; report `PROVISIONING_RESTORE_STATUS`.
3. Reject expired JWTs / expired `expires_at` on upload request.

Cloud implements first; gateway consumer ships in parallel.

## Out of scope (v1)

- Scheduled backups, retention/TTL, per-backup encryption, tenant access, signed-URL restore
