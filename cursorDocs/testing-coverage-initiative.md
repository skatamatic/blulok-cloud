# Testing & coverage initiative

This document records a **baseline audit** of Jest coverage (backend + frontend), explains what the numbers mean for BluLok, and defines a **phased plan** to improve **meaningful** coverage—**security, access control, and business workflows**—without chasing superficial line percentages.

## Baseline (current repo)

| Scope | Line coverage | Notes |
|--------|----------------|--------|
| Backend | **~55%** lines | Last full run: **54.8%** lines, **54.1%** statements, **41.5%** branches, **52.5%** functions. Migrations/seeds **excluded** from `collectCoverageFrom` (see `backend/jest.config.js`). |
| Frontend | **~21%** | Dominated by untested pages + large `bludesign/` 3D stack; use **area script** for interpretation. |
| Tests | Backend **157+** suites / **~2475+** passed (2 skipped); Frontend **49** suites / **~694** passed | — |

**Full backend coverage runs:** On some Windows environments Jest workers can hit `ENOMEM` during `test:coverage:areas`. Mitigations: set `CI=1` (see `backend/jest.config.js` `maxWorkers: 1`) or run `npx jest --coverage --maxWorkers=2`.

Raw percentages are **misleading** unless you segment by folder and purpose (see below).

### How to reproduce the area breakdown

```bash
# Backend
cd backend && npm run test:coverage:areas

# Frontend
cd frontend && npm run test:coverage:areas
```

These commands run Jest with `json-summary` and `scripts/print-coverage-by-area.mjs` to print **weighted line % by `src/` area**.

---

## Audit findings

### 1. Backend: what drags the average down (often *intentionally*)

| Category | Notes |
|----------|--------|
| **Knex migrations / seeds** | DDL scripts are not executed in unit tests. **Excluded from `collectCoverageFrom`** in `backend/jest.config.js` so CI metrics reflect application code, not migration files. |
| **`src/index.ts` bootstrap** | Entrypoint (server listen) rarely covered in Jest; acceptable if `app.ts` is covered. |
| **Models under `jest.mock` in `setup-mocks.ts`** | Many route tests use mocked `UserModel`, `DeviceModel`, etc. **Real model files show 0%** even when behavior is tested *via routes*. Prefer **route + integration tests** for business rules; add **direct model tests** only where logic is non-trivial and not exercised elsewhere. |
| **`database.service.ts` at 0%** | Mocked globally; connection behavior belongs in integration/smoke tests, not duplicated in every suite. |

**Interpretation:** Low file-level % on `*.model.ts` does **not** always mean missing tests—it may mean **mocks** are in play. Validate with **route tests** and targeted **unmocked** suites (see `auth.service.login-key-generation.test.ts`, `gateway-events.service.inbound-db-sync.test.ts`).

### 2. Backend: high-value gaps (under-covered *application* code)

Prioritize tests that assert **observable behavior** (responses, DB calls, side effects), not “function was called” unless that’s the contract.

| Priority | Area | Examples of desired tests |
|----------|------|---------------------------|
| **P0 – Security** | Auth, gateway WS, internal gateway routes | Already strengthened: login `key_generation_required`, inbound WS → `gateways.status`. Continue: token expiry edge cases, facility scope on `AUTH`. |
| **P0 – Safety** | Device commands, denylist, route passes | Existing suites—extend when changing behavior; add cases for cross-facility denial. |
| **P1 – Core product** | `devices.service.ts`, `gateway/gateway.service.ts`, `notifications/notification.service.ts`, `admin.routes.ts` | Assignment/unassignment invariants; gateway operations; admin-only branches. Prefer **service tests with controlled mocks** or **route tests** over snapshot-only UI. **`admin.routes.test.ts`** covers `requireDevAdmin` / `requireAdmin` gates (401/403) plus a few validation success paths in test env. **`rate-limit-bypass.service.test.ts`** exercises IP normalization, TTL, and scoped bypass. **`device-event.service.broadcast.test.ts`** covers `initialize()` + WebSocket broadcast listeners (with `WebSocketService` mocked). |
| **P2 – BluDesign backend** | `bludesign/routes/*`, `bludesign/services/*` | Treat as **feature modules**: API contract tests + permission checks. |

**Next backend targets (from last `coverage-summary.json` sweep — skip `models/*.ts` at 0% when exercised only via `setup-mocks.ts`):**

| Priority | File / area | Notes |
|----------|-------------|--------|
| P1 | `src/services/fms/` (e.g. `fms.service.ts`) | Weighted area ~16%; high business value for facility sync. **`fms.service.facility-access.test.ts`** uses `jest.requireActual` (global `FMSService` is mocked in `setup-mocks.ts`) to assert `validateFacilityAccess` for ADMIN / DEV_ADMIN / FACILITY_ADMIN / TENANT. |
| P1 | `src/services/otp.service.ts` | **`otp.service.test.ts`**: invalid delivery throws, SMS/email dispatch, `createOtpRecord` code shape, `verifyOtp` empty rows. Knex mock extended with **`.modify()`** for OTP queries. |
| P2 | `src/routes/dev.routes.ts` | **`dev.routes.test.ts`**: 401 unauthenticated, 403 tenant/facility_admin, 200 admin/dev_admin on `/dev/websocket-stats` and 403 tenant on `/dev/logs`. |
| P2 | `src/services/notifications/` (beyond core `notification.service`) | Sub-area ~30%; debug/auxiliary paths. |
| P2 | `src/bludesign/routes/assets.routes.ts`, `projects.routes.ts` | **`bludesign-projects-assets.routes.test.ts`**: list projects (with `findByOwner` spy), 404/403 project get, asset list 403 vs 200 with `isOwner` / asset model spies. |

**Note:** `FMSService` is **mocked globally** in `setup-mocks.ts` for route tests; FMS tests that need the real class must use `jest.requireActual('@/services/fms/fms.service')`.

**Added (critical-path focus):**

| Area | Suite | What it covers |
|------|--------|----------------|
| FMS routes | `fms.routes.critical.test.ts` | `POST /fms/config` **400** validation; `GET .../changes/:syncLogId/pending` **derived `validation_errors`** for invalid tenant rows (with `FMSSyncLogModel` + `getPendingChanges` wired for the scenario). |
| BluDesign | `bludesign-themes.routes.test.ts` | `GET /bludesign/themes` **401** / **200** list. |
| Routes | `commands.routes.test.ts` | `GET /commands/pending` auth; `POST .../retry` **403** for tenant (`requireAdmin`). |
| Types (dashboard) | `widget-type-helper.extract.test.ts` | `WidgetTypeHelper.extractWidgetTypeFromId` legacy ID mapping (stats, shared-keys, sync-fms, fallbacks) — real business rules in `widget.types.ts`. |

### 3. Frontend: why ~21% is expected

| Factor | Impact |
|--------|--------|
| **Large `bludesign/` 3D stack** | Three.js, gizmos, managers—hundreds of LOC with **minimal** Jest value; visual/regression or targeted hook tests are more appropriate than 80% line coverage. |
| **Pages vs. widgets** | Dashboard, login, user management pages often **0%** unless dedicated tests exist; many flows are covered only indirectly via `App.test.tsx` or not at all. |
| **`api.service.ts`** | Partially tested; critical paths should be covered for **auth headers, error handling, and facility-scoped calls**. |

**High-value frontend targets (non-superficial):**

| Priority | Focus | Examples |
|----------|--------|----------|
| **P0** | Auth/session | Login, token storage, logout, 401 handling (where not already covered). |
| **P1** | Facility admin flows | User management, gateway tab, device assignment—**user-visible outcomes** and error states. |
| **P2** | BluDesign editor | Defer blanket unit tests; use **smoke tests** + **E2E** for critical authoring flows if/when introduced. |

---

## What we avoid (anti-patterns)

1. **Coverage for coverage’s sake** — e.g. testing getters/setters, private CSS class names, or “renders without crash” with no assertion on business text or ARIA.
2. **Duplicating production logic in mocks** — global `AuthService` mock in `setup-mocks.ts` is fine for routes; **real** behavior belongs in **`jest.unmock`** suites (see existing auth tests).
3. **Unit-testing every migration** — validated by **running migrations** in CI/staging, not Jest line hits.
4. **Chasing 90% global frontend** while the codebase includes a **3D editor** — split metrics (see below).

---

## Optional: split metrics (future)

- **Backend:** `npm run test:coverage` after migration exclusion already improves interpretability.
- **Frontend:** Consider a second Jest project or `collectCoverageFrom` override that **excludes `src/components/bludesign/**`** for a **“product shell” coverage %** used in CI, while full collect remains for local exploration.

---

## Phased roadmap

### Phase 1 — Instrumentation & gates (done / ongoing)

- [x] Document baseline and priorities (this file).
- [x] Exclude `src/database/migrations/**` and `src/database/seeds/**` from backend coverage collection.
- [x] Add `print-coverage-by-area.mjs` + `test:coverage:areas` scripts.
- [x] **Targeted high-signal tests added:** `facilities.service.test.ts` (delete impact + cascade), `devices.service.unit.test.ts` (assign/unassign/access), `LoginPage.test.tsx` (login + errors + fake-timer cleanup), `api.service.test.ts` (facility delete-impact + delete API).
- [ ] (Optional) Add CI comment or artifact: area breakdown + total (no hard global threshold until baselines stabilize).

### Phase 2 — Security & access (highest ROI)

- Expand **real** `AuthService` tests when login/device rules change.
- Gateway: connection lifecycle, facility mismatch, **single connection per facility** behavior (already partially covered).
- Users/facilities: **RBAC** tests at route layer (many exist—keep aligned with product changes).

### Phase 3 — Core business services

- `DevicesService`: assignment conflict rules, facility consistency, event emission (where applicable)—**one focused test file** beats dozens of shallow tests.
- Notifications, FMS touchpoints: assert **who receives what**, not every branch.

### Phase 4 — Frontend product shell

- Login and **api.service** error/redirect behavior.
- Critical modals (add user, assign device): **primary path + one failure path** each.

### Phase 5 — BluDesign / 3D (separate track)

- Treat as **editor product**: prioritize **manual QA checklist** + future **E2E**; unit tests only for **pure utilities** (e.g. geometry helpers—some already exist).

---

## Related docs

- `cursorDocs/auth.md` — login / `key_generation_required` regression tests.
- `cursorDocs/gateway-integration.md` — gateway WS vs DB row; automated tests listed there.

### New / expanded test modules (behavior-focused)

| File | What it covers |
|------|----------------|
| `backend/src/__tests__/services/facilities.service.test.ts` | `getDeleteImpact` aggregates; `deleteFacilityCascade` throws when no row deleted; happy-path delete ordering |
| `backend/src/__tests__/services/devices.service.unit.test.ts` | `assignDeviceToUnit` validation + event emission; `unassignDeviceFromUnit`; `hasUserAccessToDevice` RBAC |
| `frontend/src/__tests__/pages/LoginPage.test.tsx` | Successful navigation, API errors, 401 mapping, 5s error clear with `jest.useFakeTimers` + `useRealTimers` in `afterEach` |
| `frontend/src/__tests__/services/api.service.test.ts` | `getFacilityDeleteImpact`, `deleteFacility` HTTP contracts |
| `backend/src/__tests__/services/facility-access.service.test.ts` | `FacilityAccessService` global vs facility scope, `hasAccessToFacility` secure default |
| `backend/src/__tests__/services/lock-command.service.test.ts` | `LockCommandService` gateway failure revert, timeout revert with fake timers |
| `frontend/src/__tests__/contexts/AuthContext.test.tsx` | Bootstrap from `localStorage` + `verifyToken`, login/logout, role helpers |

**LoginPage + Jest:** `LoginPage` uses `isViteDev()` from `appConfig` (eval-based `import.meta`) so the file parses under ts-jest without bare `import.meta` syntax.

### Coverage review (least covered + high impact)

Prioritize in this order when expanding tests:

1. **Facility / access** — `FacilityAccessService` (now covered), `admin.routes.ts` (admin-only operations), `auth.routes.ts` edge cases.
2. **Device control** — `LockCommandService` (now covered), gateway send paths.
3. **Frontend session** — `AuthContext` (now covered), then `GlobalFacilityContext` / `FMSSyncContext` if changing those flows.
4. **Avoid** chasing 0% on `database.service.ts` (globally mocked) or Knex migrations.
