# Dashboard widgets: data & security

## Facility scope

- **Selector**: `GlobalFacilityContext` (`selectedFacilityId`, `ALL_FACILITIES_ID`).
- **Dashboard**: `DashboardPage` computes `effectiveFacilityId` (undefined when “All facilities”) and passes **`facilityFilter`** into widgets that support it (activity monitor, remote gate, histogram, notifications, battery, unlocked units).
- **Hooks**: `useUnitsData(facilityId)` forwards **`facility_id`** to `GET /units` and `GET /units/unlocked`.
- **General stats**: `useGeneralStatsData` passes optional **`facility_id`** to **`GET /dashboard/general-stats`** when a single facility is selected. WebSocket **`general_stats`** updates are **ignored** while facility-scoped (WS is aggregate-only); rely on REST for per-facility numbers.

## Backend: dashboard general stats

| Endpoint | Notes |
|----------|--------|
| **`GET /dashboard/general-stats?facility_id=<uuid>`** | Optional query. When present, **`AuthService.canAccessFacility`** must pass; scope is that facility only. Omit for aggregate stats (admin/dev_admin/facility_admin/maintenance per route rules). |

## Automated tests (dashboard stats)

| Area | Location |
|------|----------|
| **REST route** auth, query validation, `facility_id` passthrough, `AccessDeniedError` | `backend/src/__tests__/routes/dashboard.routes.test.ts` |
| **`GeneralStatsService.getScopedStats`** (incl. facility option) | `backend/src/__tests__/services/general-stats.service.test.ts` |
| **WebSocket `general_stats` subscribe** (mock must expose `canSubscribeToGeneralStats`) | `backend/src/__tests__/services/websocket-security.test.ts` |
| **`apiService.getDashboardGeneralStats`** | `frontend/src/__tests__/services/api.service.test.ts` |
| **`useGeneralStatsData`** (REST params, WS ignore when scoped) | `frontend/src/__tests__/hooks/useGeneralStatsData.test.tsx` |

## Backend enforcement (verified patterns)

| Endpoint | Notes |
|----------|--------|
| **`GET /units`**, **`GET /units/unlocked`** | `UnitsService.getUnits` applies role scope; **`facility_id`** query is honored when present and **`canAccessFacility`** prevents cross-facility reads for facility-limited roles. Unlocked route forwards **query** merged with `lock_status: 'unlocked'`. |
| **`GET /access-history`** | Scoped via access services / tenant–unit rules (see `access-history.routes.ts` and read services). |
| **`GET /notifications`** | `NotificationService.getUserNotifications` enforces **own user** (except admins); optional **`facilityId`** requires **`canAccessFacility`**. |

## RBAC: Add Widget modal

- Registry **`requiredPermissions`** lists roles allowed to add each widget type (including **`maintenance`** alongside **`facility_admin`** where appropriate, **`tenant`** for tenant-facing widgets).
- **`AddWidgetModal`** uses **`filterWidgetsByRole`** (`rbac.utils.ts`): **`dev_admin`** is treated like **`admin`** where `admin` is listed; **`maintenance`** may use widgets that include **`facility_admin`**.

## Notifications widget

- Data from **`GET /api/v1/notifications`** with optional **`facilityId`**.
- **“Action required”** is **derived** in **`notification-display.utils.ts`** from **`priority`** (`high`, `urgent`) and **`notification_type`** (`security_alert`, `maintenance_alert`) — not a DB column.
- Real-time: WebSocket subscription type **`notifications`**; `websocket.service` routes `notifications_update`, `notification_created`, etc., to the same handlers.
