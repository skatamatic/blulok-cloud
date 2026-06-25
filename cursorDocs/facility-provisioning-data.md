# Facility Provisioning Data

Facility-scoped provisioning files (mesh configs, backups, etc.) are stored in the cloud and managed via REST. The mobile app and dashboard upload and download files directly — there is no gateway WebSocket push/restore flow and no provisioning phase in swap recovery.

## Storage

- **Bucket:** Reuses firmware GCS bucket / `storage.firmware.*` system settings
- **Prefix:** `facility-provisioning/{facilityId}/{fileId}/{filename}`
- **Legacy prefix:** `provisioning/...` paths remain readable for migrated rows (dual-prefix validation)
- **Max size:** 500 MB (`PROVISIONING_MAX_SIZE_BYTES`)
- **Validation:** Safe basename only (no `..`, path separators); any content type allowed

## Upload flow (app + dashboard)

1. `POST /api/v1/facilities/:facilityId/provisioning-data/prepare` — validate filename + size, create resumable upload session (response omits internal `storage_path`)
2. Client `PUT` bytes to `upload_url` with returned `upload_headers`
3. `POST /api/v1/facilities/:facilityId/provisioning-data/complete` — verify object size + SHA-256, insert `facility_provisioning_files` row

**Complete is stateless for GCS:** the storage path is deterministic (`facility-provisioning/{facilityId}/{uploadId}/{filename}`), so `complete` does not require the prepare session to live on the same backend instance. The in-memory prepare map is only required for local dev direct-upload token validation.

**Local dev:** signed upload resolves to `PUT /api/v1/facilities/:facilityId/provisioning-data/direct-upload/:uploadId` with header `X-Provisioning-Upload-Token`.

`upload_source`: `dashboard` (default) or `app`.

## Download

`GET /api/v1/facilities/:facilityId/provisioning-data/:fileId/download` streams bytes through the authenticated backend (`Content-Disposition`, `Content-Type` from stored row). Works for LOCAL and GCS storage without signed-GET IAM.

## REST API

| Method | Path | Roles |
|--------|------|-------|
| GET | `/api/v1/facilities/:facilityId/provisioning-data` | ADMIN, DEV_ADMIN, FACILITY_ADMIN |
| POST | `/api/v1/facilities/:facilityId/provisioning-data/prepare` | same |
| POST | `/api/v1/facilities/:facilityId/provisioning-data/complete` | same |
| GET | `/api/v1/facilities/:facilityId/provisioning-data/:fileId/download` | same |
| DELETE | `/api/v1/facilities/:facilityId/provisioning-data/:fileId` | ADMIN, DEV_ADMIN |
| PUT | `/api/v1/facilities/:facilityId/provisioning-data/direct-upload/:uploadId` | token header (local dev) |

Facility access is enforced the same way as other facility-scoped admin routes.

## UI

**Facility Details → Provisioning Data** tab (`FacilityProvisioningDataTab`):

- Versioned file list (filename, size, uploaded, source)
- Upload from dashboard (prepare → PUT → complete)
- Download via authenticated endpoint
- Delete (platform admins only)

No gateway-online requirement, no restore progress, no WebSocket subscription.

## Database

- `facility_provisioning_files` — catalog rows (migration 087)
- Dropped: `gateway_provisioning_backups`, `gateway_provisioning_restores`, `gateway_provisioning_restore_events`

## Gateway / app contract

- **Mobile app:** uses facility REST prepare/complete/download (Bearer JWT, facility-scoped roles)
- **Gateway firmware:** remove `PROVISIONING_*` WebSocket handlers and internal `/internal/gateway/provisioning/*` PROXY routes
- **Swap recovery:** firmware → inventory snapshot only; provisioning zips are no longer pushed during gateway replacement

## Out of scope (v1)

- Scheduled uploads, retention/TTL, per-file encryption, tenant self-service without facility admin role
