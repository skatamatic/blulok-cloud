# Date/Time Conventions

BluLok stores instants in UTC and displays them in each user's local timezone.

## Storage (MySQL)

| Rule | Detail |
|------|--------|
| **Timezone** | All instants are written and read as **UTC** (`mysql2` connection `timezone: 'Z'` in `database.service.ts` and `knexfile.ts`). |
| **Column types** | `TIMESTAMP` (majority) and `DATETIME` (gateway commands, notifications `read_at`, activity `occurred_at`, etc.). Both are treated as UTC at the application layer. |
| **No unix columns** | Unix seconds/ms appear on the wire only (JWT claims, gateway liveness), not in MySQL. |
| **Schedule windows** | `TIME` columns (`start_time`, `end_time`) are **facility-local time-of-day**, not UTC instants. |
| **Security TTL** | OTP, invites, password reset, denylist expiry use `UTC_TIMESTAMP()` in SQL. |

No schema migration is required for timezone correctness when the app writes UTC consistently. Future migrations may align column types, but existing data is valid UTC.

## Wire format (REST + WebSocket)

| Rule | Detail |
|------|--------|
| **Default** | ISO-8601 UTC with `Z` suffix: `2026-06-16T18:30:00.000Z` |
| **Serialization** | Prefer explicit `toIsoString()` / `toIsoStringOrEpoch()` from `backend/src/utils/datetime.utils.ts` at route boundaries. |
| **Date-only filters** | `YYYY-MM-DD` is legacy UTC calendar-day bounds. **Preferred:** full ISO UTC from the client (`buildLocalDateRangeQuery` on the frontend). |
| **Exceptions** | Gateway `lastActivityAt` (unix ms), JWT `iat`/`exp`/`ts` (unix seconds). |

### JSON field naming

- **Database:** `snake_case` (`created_at`, `occurred_at`)
- **REST:** mixed today — facilities/devices use `snake_case`; users/notifications/activity use `camelCase`. New APIs should use `camelCase` with route-layer mappers.
- **Frontend types:** instants are `string` on the wire; `Date` only in view models after `mapApi*` / `parseInstant`.

## Frontend display

All user-facing formatting goes through **`frontend/src/utils/datetime.utils.ts`**:

| Function | Use |
|----------|-----|
| `formatDateTime` | Tables, detail panels — local date + time |
| `formatDate` | Date-only metadata |
| `formatTime` | Time-only when date is shown elsewhere |
| `formatRelativeTime` | Dashboard widgets — relative then absolute |
| `formatRelativeWithExact` | Relative label + `title` tooltip with exact local time |
| `RELATIVE_LAST_SEEN_OPTS` | Device last-seen widgets — relative days, never absolute |
| `RELATIVE_UNITS_ACTIVITY_OPTS` | Units manager — relative up to 30 days, then date-only |
| `formatUtcDateTime` | Security-sensitive UTC labels (signed commands) |
| `formatNotificationTimestamp` | Notifications widget compact/relative rules |
| `formatDateTimeParts` | Split date/time columns (telemetry logs) |

### Forms

| Input | Outbound |
|-------|----------|
| `<input type="date">` | UI holds `YYYY-MM-DD` (local). API gets UTC ISO via `buildLocalDateRangeQuery` or `localDateInputToUtcStartIso` / `EndIso`. |
| `<input type="datetime-local">` | Convert with `datetimeLocalToIso` before API calls. Populate with `isoToDatetimeLocal`. |

### Parsing

- `parseInstant(iso)` — safe `Date | null` from API strings.
- Never render raw `*_at` / `*At` fields without a formatter.

## Backend utilities

**`backend/src/utils/datetime.utils.ts`**

- `toIsoString` / `toIsoStringOrEpoch` — API responses
- `parseQueryDateFrom` / `parseQueryDateTo` — query filter bounds (`access-history-date.utils.ts` re-exports for compatibility)

## Related docs

- `access-notifications-activity-apis.md` — notifications/activity API shapes
- `database-schema.md` — audit column types
- `gateway-integration.md` — telemetry `logged_at`
- `firmware-ota-architecture.md` — JWT unix timestamps
