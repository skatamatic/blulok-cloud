# Outbound email & SMS notification configuration

Admin setup for invite / OTP / password-reset delivery. UI: **Settings → Notifications** (`/settings?tab=notifications`). API under `/api/v1/system-settings/notifications*`. Admin / Dev Admin only.

## Channels & providers

| Channel | Providers | Notes |
|---------|-----------|--------|
| SMS | `console` (dev), `twilio` | Credentials in `notifications.config` JSON |
| Email | `console` (dev), `smtp` | Nodemailer; host/port/encryption/auth |

Config key: `system_settings.notifications.config` (`NotificationsConfig`).

### SMTP fields

- `host`, `port` (default 587)
- `encryption`: `none` | `starttls` | `tls`
- `authMode`: `none` | `plain` | `login`
- `username` / `password` (when auth enabled)
- `fromEmail`, optional `fromName`, `replyTo`
- `rejectUnauthorized` (TLS cert verify; default true)

### Secrets at rest

Twilio `authToken` and SMTP `password` are encrypted with AES-256-GCM when `SETTINGS_ENCRYPTION_KEY` is set (see `deployment.md`). Format `enc:v1:<iv>:<tag>:<ciphertext>`. Legacy plaintext values still decrypt/pass through until the next save.

`GET /notifications` returns the mask sentinel `••••••` instead of secrets. `PUT` with the same sentinel keeps the existing stored value.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/system-settings/notifications` | Load config (secrets masked) |
| PUT | `/api/v1/system-settings/notifications` | Save config (encrypt secrets) |
| POST | `/api/v1/system-settings/notifications/test` | Send TEST invite/OTP messages |
| POST | `/api/v1/system-settings/notifications/test-connection` | SMTP login **and** From-address probe (not auth-only `verify()`) |

### Deeplink base

Prefer `notifications.config.deeplinkBaseUrl`. On save, the route also writes the legacy key `notifications.deeplink_base` so older readers stay consistent. `NotificationConfigService.resolveDeeplinkBase()` reads config first, then the legacy key.

### UI behavior

- **Channel hubs**: SMS and Email sit side-by-side. Each hub has an enable toggle and **Setup | Messages** tabs so provider credentials and templates never stack in one scroll.
- Setup pane: provider selection + Twilio / SMTP fields (SMTP includes **Test connection**).
- Messages pane: invite / OTP / password-reset copy for that channel only.
- Shared **deeplink base** strip below the hubs; compact credentials callout; sticky **Send test** / **Save**.
- Save is disabled until required provider fields are complete.
- See `backend/src/services/notifications/` for providers, template renderer, and config service.

### Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `553 … Sender address rejected: not owned by user …` | **From email** is not an address the SMTP username may send as. Set From to the mailbox / allowed alias for that login (often the same as Username), then Save and **Test SMTP connection** (probes MAIL FROM, not just login). |
| Test SMTP says OK but invites fail | Older builds only ran auth `verify()`. Current test also probes the From address; redeploy if the button still only checks login. |
| Invite / reset returns friendly “Failed to send email/text… check settings” | Delivery failed (SMTP/Twilio). Full provider text is logged server-side only; fix Settings → Notifications and retry. |
| `reference_id` / `ER_DATA_TOO_LONG` on backend_error alerts | Fixed by hashing long API paths before insert; full path remains in notification metadata. |
