# Outbound email & SMS notification configuration

Admin setup for invite / OTP / password-reset delivery. UI: **Settings → Notifications** (`/settings?tab=notifications`). API under `/api/v1/system-settings/notifications*`. Admin / Dev Admin only.

## Channels & providers

| Channel | Providers | Notes |
|---------|-----------|--------|
| SMS | `console` (dev), `twilio` | Credentials in `notifications.config` JSON |
| Email | `console` (dev), `smtp` | Nodemailer; host/port/encryption/auth |

Config key: `system_settings.notifications.config` (`NotificationsConfig`).

## Delivery policy (one rule for every outbound message)

`NotificationService` owns channel selection for invites, OTPs and password resets. Callers pass **both** contacts and never pre-pick a channel. `notification-delivery.ts` then applies:

1. Send on **every enabled channel that has a recipient** — a user with a phone and an email receives both.
2. If no enabled channel has a recipient, **fall back to any channel that does** and log a warning. An email-only account still gets invited when email is toggled off; a contactable user is never silently skipped.
3. Channels are attempted **independently**. A failing email cannot discard an SMS that already went out, because retrying would invalidate the token the user just received.
4. If nothing was delivered, **throw**: `400` when the account has no phone or email, `502` when every channel failed. Nothing reports success without delivering.

Partial delivery returns a `warning` up the stack. `POST /users`, `POST /users/:id/resend-invite`, `POST /users/:id/reset-account` and the key-share invite all return `inviteSent` plus `inviteWarning`, and the UI shows a warning toast rather than a plain success.

Account reset is the important case: the identity wipe is already committed when the invite is sent, so a delivery failure returns `success: true, inviteSent: false` with a warning telling the operator to resend — never a bare error that reads as "nothing happened".

### SMTP fields

- `host`, `port` (default 587)
- `encryption`: `none` | `starttls` | `tls`
- `authMode`: `none` | `plain` | `login`
- `username` / `password` (when auth enabled)
- `fromEmail`, optional `fromName`, `replyTo`
- `rejectUnauthorized` (TLS cert verify; default true)

### Secrets at rest

Twilio `authToken` and SMTP `password` are encrypted with AES-256-GCM when `SETTINGS_ENCRYPTION_KEY` is set (see `deployment.md`). Format `enc:v1:<iv>:<tag>:<ciphertext>`. Legacy plaintext values still decrypt/pass through until the next save.

`GET /notifications` returns the mask sentinel `••••••` instead of secrets. On `PUT`, a secret field that is **masked, blank or absent** keeps the stored ciphertext; only a real new value is re-encrypted. The debug log of the request body redacts both secrets.

If a stored secret cannot be decrypted (wrong or missing `SETTINGS_ENCRYPTION_KEY`), only that field is blanked and the failure is logged as an error. The provider factory then rejects the incomplete config with an actionable message instead of the whole config silently collapsing to console providers.

### Partial saves

`PUT` merges into the stored config rather than replacing it. Sections omitted from the payload (`enabledChannels`, `defaultProvider`, `twilio`, `smtp`, `templates`) keep their stored values, and a partially supplied section is merged key-by-key. Saving just `deeplinkBaseUrl` cannot wipe SMTP credentials.

### Deeplink allowlist

`deeplinkBaseUrl` is embedded in every invite and reset message, so only `blulok://`, `https://`, and loopback `http://` (localhost / 127.0.0.1, for local development) are accepted. Anything else — `javascript:`, `data:`, an arbitrary external `http://` host — is rejected with a `400`.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/system-settings/notifications` | Load config (secrets masked) |
| PUT | `/api/v1/system-settings/notifications` | Save config (encrypt secrets) |
| POST | `/api/v1/system-settings/notifications/test` | Send TEST invite / OTP / password-reset messages |
| POST | `/api/v1/system-settings/notifications/test-connection` | SMTP login **and** From-address probe (not auth-only `verify()`) |

### Deeplink base

Prefer `notifications.config.deeplinkBaseUrl`. On save, the route also writes the legacy key `notifications.deeplink_base` so older readers stay consistent. `NotificationConfigService.resolveDeeplinkBase()` reads config first, then the legacy key.

### UI behavior

- **Channel hubs**: SMS and Email sit side-by-side. Each hub has an enable toggle and **Setup | Messages** tabs so provider credentials and templates never stack in one scroll.
- Setup pane: provider selection + Twilio / SMTP fields (SMTP includes **Test connection**).
- Messages pane: invite / OTP / password-reset copy for that channel only.
- Shared **deeplink base** strip below the hubs; compact credentials callout; sticky **Send test** / **Save**.
- **Send test notifications** requires a recipient for each enabled channel (email and/or E.164 phone). It uses the live form as `configOverride` (including unsaved edits) and sends TEST invite, OTP **and password reset** on every enabled channel — six messages when both channels are on. Templates receive sample `{{code}}` / `{{deeplink}}` values the same way real sends do. A blank secret in the override resolves to the stored credential, so a test never fails for a secret the user simply did not retype.
- Clearing a secret field and clicking away restores the `••••••` sentinel, matching the API's "blank means unchanged" rule.
- **Test SMTP connection** only probes login + From; it does not send a message.
- Save is disabled until required provider fields are complete.

### Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `553 … Sender address rejected: not owned by user …` | **From email** is not an address the SMTP username may send as. Set From to the mailbox / allowed alias for that login (often the same as Username), then Save and **Test SMTP connection** (probes MAIL FROM, not just login). |
| Test SMTP says OK but invites fail | Older builds only ran auth `verify()`. Current test also probes the From address; redeploy if the button still only checks login. |
| Settings test reaches SMS+email but real invites only email | **Send test** uses the live form (`configOverride`), including unsaved toggles/providers. **Save settings** first. Also confirm the invitee has a phone number if you expect SMS, and that SMS provider is **Twilio** (Console only logs on the server). |
| Test invite SMS/email still shows `{{code}}` | Fixed: test invite rendering now passes a sample code like real invites. Redeploy if you still see the placeholder. |
| Invite / reset returns friendly “Failed to send email/text… check settings” | Every channel failed (502). Full provider text is logged server-side only; fix Settings → Notifications and retry. |
| “Invite partly delivered” warning toast | One channel succeeded and another failed. The user has a usable invite — do **not** resend blindly, since that invalidates the token they already received. Fix the failing channel first. |
| “Account reset — invite not delivered” | The reset committed but delivery failed. The user is locked out until someone uses **Resend invite**. |
| Saving one field wiped my SMTP settings | Fixed: `PUT` now deep-merges into the stored config and treats blank secrets as unchanged. |
| Sends stopped working after a key rotation | Look for `failed to decrypt … check SETTINGS_ENCRYPTION_KEY` in the logs, then re-enter and save the affected secret. |
| `reference_id` / `ER_DATA_TOO_LONG` on backend_error alerts | Fixed by hashing long API paths before insert; full path remains in notification metadata. |

### Regression coverage

| Area | Test |
|------|------|
| Channel selection, fallback, partial success | `backend/src/__tests__/services/notifications/notification-delivery.test.ts` |
| Invite / OTP / reset / test-send policy end to end | `backend/src/__tests__/services/notifications/notification-channel-policy.test.ts` |
| Partial saves, blank secrets, log redaction | `backend/src/__tests__/services/notification-secrets.utils.test.ts` |
| Deeplink allowlist | `backend/src/__tests__/services/notifications/deeplink.utils.test.ts` |
| SMTP From header injection | `backend/src/__tests__/services/notifications/smtp-from-header.test.ts` |
| Settings route validation and merge behaviour | `backend/src/__tests__/routes/system-settings.routes.test.ts` |
| Masked-secret input behaviour | `frontend/src/__tests__/pages/settings/SecretField.test.tsx` |
| Partial-delivery warnings in the admin UI | `frontend/src/__tests__/components/UserManagement/InviteActions.test.tsx` |
| Live settings → invite → reset flow | `backend/npm run ws:e2e` — **Notification Delivery Stack** section |
