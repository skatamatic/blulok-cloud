# Facility provisioning data — app integration guide

How the mobile app (and dashboard) upload, list, and download facility provisioning files over REST.

**Base path:** `/api/v1/facilities/:facilityId/provisioning-data`

**Auth (all steps except the byte upload PUT):**

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

**Roles:** `facility_admin` (assigned facilities only), `admin`, or `dev_admin`.

**App uploads:** send `X-App-Device-Id: <device-id>` on **complete** so the file is tagged `upload_source: "app"`. Omit it for dashboard uploads (`"dashboard"`).

**Limits:** max **500 MB** per file (`524_288_000` bytes). Filename must be a plain basename (no path separators).

---

## Data shapes

### `FacilityProvisioningFile`

Returned by **complete**, **list**, and implied after a successful upload.

```typescript
interface FacilityProvisioningFile {
  id: string;                    // UUID — same as upload_id from prepare
  facility_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  sha256_hash: string;           // hex SHA-256 of file bytes
  upload_source: 'app' | 'dashboard';
  created_by: string | null;     // user UUID who completed upload
  uploaded_at: string;           // ISO 8601
  created_at: string;
  updated_at: string;
}
```

`storage_path` is never exposed to clients.

### `FacilityProvisioningUploadSession`

Returned by **prepare**.

```typescript
interface FacilityProvisioningUploadSession {
  upload_id: string;             // UUID — use in complete; becomes file.id
  upload_url: string;            // PUT destination for raw bytes (not the BluLok API)
  upload_headers: Record<string, string>;  // headers required on PUT
  expires_in_seconds: number;    // typically 3600
  facility_id: string;
}
```

### List result

```typescript
interface FacilityProvisioningListResult {
  files: FacilityProvisioningFile[];
  total: number;                 // total rows for facility (for pagination)
}
```

### JSON envelope

Every JSON endpoint uses:

```typescript
// success
{ success: true, data: T }

// error
{ success: false, message: string }
```

Delete success: `{ success: true, deleted: true }`.

---

## Upload flow

Upload is always three HTTP calls: **prepare → PUT bytes → complete**.

```
┌─────────┐     POST /prepare (JWT)      ┌───────┐
│   App   │ ───────────────────────────► │ Cloud │
│         │ ◄── upload_id, upload_url ── │       │
│         │                                │       │
│         │     PUT upload_url (headers)   │       │
│         │ ───────────────────────────► │ store │
│         │                                │       │
│         │     POST /complete (JWT)       │       │
│         │ ───────────────────────────► │       │
│         │ ◄── FacilityProvisioningFile ─ │       │
└─────────┘                                └───────┘
```

The middle step goes to `upload_url` from prepare — **not** to `/api/v1/...`. Do not send the JWT on that PUT; use only `upload_headers` from prepare.

---

### Step 1 — Prepare

Reserve an upload slot and get a signed upload target.

```http
POST /api/v1/facilities/:facilityId/provisioning-data/prepare
Authorization: Bearer <JWT>
Content-Type: application/json
```

**Request body:**

```json
{
  "filename": "mesh-backup-2026-06-24.bin",
  "size_bytes": 1048576,
  "content_type": "application/octet-stream"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `filename` | yes | Basename only, e.g. `backup.bin` |
| `size_bytes` | yes | Exact byte length you will upload |
| `content_type` | no | Defaults to `application/octet-stream` |

**Response `200` — `data`:**

```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "upload_url": "https://storage.googleapis.com/...",
  "upload_headers": {
    "Content-Type": "application/octet-stream"
  },
  "expires_in_seconds": 3600,
  "facility_id": "238ae43f-b597-4bf0-bd64-95b452aba7a7"
}
```

Save `upload_id`, `upload_url`, and `upload_headers` for the next steps.

---

### Step 2 — Upload bytes

```http
PUT <upload_url>
<each header from upload_headers>
<raw file bytes as body>
```

- Body length must equal `size_bytes` from prepare.
- Use the exact `Content-Type` (and any other headers) from `upload_headers`.
- No `Authorization` header on this request.
- Expect `200` on success.

---

### Step 3 — Complete

Tell the cloud the upload finished; cloud verifies size + SHA-256 and creates the catalog row.

```http
POST /api/v1/facilities/:facilityId/provisioning-data/complete
Authorization: Bearer <JWT>
X-App-Device-Id: <device-id>          // optional; marks upload_source as "app"
Content-Type: application/json
```

**Request body:**

```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "mesh-backup-2026-06-24.bin",
  "size_bytes": 1048576,
  "content_type": "application/octet-stream"
}
```

`upload_id`, `filename`, and `size_bytes` must match the prepare call exactly.

**Response `200` — `data`:**

```json
{
  "file": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "facility_id": "238ae43f-b597-4bf0-bd64-95b452aba7a7",
    "filename": "mesh-backup-2026-06-24.bin",
    "content_type": "application/octet-stream",
    "size_bytes": 1048576,
    "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "upload_source": "app",
    "created_by": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "uploaded_at": "2026-06-25T05:00:00.000Z",
    "created_at": "2026-06-25T05:00:00.000Z",
    "updated_at": "2026-06-25T05:00:00.000Z"
  }
}
```

**Idempotent:** calling complete again with the same `upload_id` returns the existing `file` (no duplicate row).

**Optional client check:** compare your local SHA-256 to `file.sha256_hash`.

---

## List files

Browse what is stored for a facility (newest first).

```http
GET /api/v1/facilities/:facilityId/provisioning-data?limit=50&offset=0
Authorization: Bearer <JWT>
```

| Query | Default | Max |
|-------|---------|-----|
| `limit` | 50 | 100 |
| `offset` | 0 | — |

**Response `200` — `data`:**

```json
{
  "files": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "facility_id": "238ae43f-b597-4bf0-bd64-95b452aba7a7",
      "filename": "mesh-backup-2026-06-24.bin",
      "content_type": "application/octet-stream",
      "size_bytes": 1048576,
      "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "upload_source": "dashboard",
      "created_by": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "uploaded_at": "2026-06-25T05:00:00.000Z",
      "created_at": "2026-06-25T05:00:00.000Z",
      "updated_at": "2026-06-25T05:00:00.000Z"
    }
  ],
  "total": 1
}
```

Paginate: increment `offset` by `limit` until `files.length + offset >= total`.

Use `file.id` as the download path parameter.

---

## Download file

Downloads require JWT — fetch bytes through the API, not a direct storage URL.

```http
GET /api/v1/facilities/:facilityId/provisioning-data/:fileId/download
Authorization: Bearer <JWT>
```

**Response `200`:**

- Body: raw file bytes (not JSON)
- Headers:
  - `Content-Type` — from stored row (fallback `application/octet-stream`)
  - `Content-Length` — `size_bytes`
  - `Content-Disposition: attachment; filename="<filename>"`

**Response `404`:** JSON `{ success: false, message: "..." }`

### Client pattern

```typescript
const url = `${apiBase}/api/v1/facilities/${facilityId}/provisioning-data/${fileId}/download`;

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});

if (!response.ok) {
  const err = await response.json().catch(() => ({}));
  throw new Error(err.message ?? `Download failed (${response.status})`);
}

const bytes = await response.arrayBuffer();
// write to app storage, or verify SHA-256 against list/complete metadata
```

---

## Delete file (dashboard / platform admin only)

Mobile `facility_admin` users cannot delete. Only `admin` and `dev_admin`.

```http
DELETE /api/v1/facilities/:facilityId/provisioning-data/:fileId
Authorization: Bearer <JWT>
```

**Response `200`:**

```json
{ "success": true, "deleted": true }
```

**Response `403`:** `facility_admin` caller.

---

## Validation & errors

### Filename (prepare + complete)

- Non-empty basename
- No `/` or `\`
- No characters `\0<>:"|?*`

### Size

- `size_bytes` ≥ 1 and ≤ `524_288_000`

### Common HTTP codes

| Code | When |
|------|------|
| `400` | Validation failed, PUT not done before complete, size mismatch |
| `401` | Missing or invalid JWT |
| `403` | Wrong role or facility_admin accessing another facility |
| `404` | Unknown `fileId` on download/delete |

### Typical `400` messages

| Message | Cause |
|---------|--------|
| `Uploaded provisioning file not found in storage. Complete the signed URL upload first.` | Skipped or failed PUT step |
| `Uploaded size mismatch: expected N bytes, found M` | Body size ≠ declared `size_bytes` |
| `Filename does not match prepared upload session` | `filename` in complete ≠ prepare |
| `Too many provisioning upload requests for this facility — try again shortly` | >30 prepare calls per facility per minute |

---

## End-to-end app checklist

1. Authenticate → JWT.
2. Pick `facilityId` the user can manage.
3. Validate local file (size ≤ 500 MB, safe filename).
4. **Prepare** → save `upload_id`, `upload_url`, `upload_headers`.
5. **PUT** file bytes to `upload_url`.
6. **Complete** with matching `upload_id` / `filename` / `size_bytes` + `X-App-Device-Id`.
7. Store returned `file.id` and `sha256_hash`.
8. **List** to show catalog; **download** via authenticated GET when user picks a file.

Dashboard uses the same API from **Facility Details → Provisioning Data** (`FacilityProvisioningDataTab`).

Type definitions: `frontend/src/types/facility-provisioning.types.ts`.
