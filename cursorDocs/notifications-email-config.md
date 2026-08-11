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
| POST | `/api/v1/system-settings/notifications/test-connection` | SMTP `transporter.verify()` |

### Deeplink base

Prefer `notifications.config.deeplinkBaseUrl`. On save, the route also writes the legacy key `notifications.deeplink_base` so older readers stay consistent. `NotificationConfigService.resolveDeeplinkBase()` reads config first, then the legacy key.

### UI behavior

- SMS / email provider sections and templates show only when that channel is enabled.
- SMTP fields show only when email provider is `smtp`.
- Save is disabled until required provider fields are complete.
- See `backend/src/services/notifications/` for providers, template renderer, and config service.
