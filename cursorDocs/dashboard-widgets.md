# Dashboard widgets: data & security

## Layout system (v2)

- **Fixed viewport**: Dashboard route uses `DashboardLayout lockViewport` — no page scroll. Grid is **6 rows × 12 columns**; `rowHeight` is computed from available canvas height (`DashboardCanvas` + `ResizeObserver`).
- **Multi-page** (admin/dev_admin only): Up to **5** pages per user in `user_dashboard_pages`; widgets scoped by `page_id` on `user_widget_layouts`. UI: **bottom pager** (dots + prev/next chevrons, hidden when only one page) + **horizontal slide** (`DashboardPageStrip` — all pages stay **mounted** off-screen so heavy widgets e.g. 3D viewer do not reload on tab change); **rename/remove** via settings; **ArrowLeft/ArrowRight** keyboard nav. Canvas uses **full width** (no side gutters). Tenants and other read-only roles: single page, no pager. **`FacilityViewer3D`** defers WebGL init until its page is first visited; the **active page keeps rendering during slides**; off-screen pages pause WebGL and show an instant JPEG snapshot of the last frame (no opacity tween).
- **Per-page widget cap** is **12** (`MAX_WIDGETS_PER_PAGE` in `useDashboardState`); the actual limit is whatever fits in 6×12 via `findPlacement`.
- **`clampLayout` preserves widget size** when re-placing legacy/overflowing items; only shrinks W/H as a last resort. `dashboard-layout-engine.ts` (FE + BE).
- **Persistence**: `GET /api/v1/widget-layouts` returns `{ pages, layouts, isDefault }`; full save via **`POST { pages }`** (debounced in `useDashboardState`). Legacy `POST { layouts }` still saves to the default page. Client cache: `blulok-dashboard-v2` (WidgetGrid no longer writes `blulok-widget-layouts` by default). **`layoutConfig.position` (x, y, w, h) is the source of truth for grid geometry** on save and load. The **`size` enum is a content-tier label** (compact vs expanded in-widget UI) derived from w/h via `deriveContentTierFromGrid` / `snapGridToAllowedSize` — it does not force preset dimensions except when the user picks a size from the widget menu (including dock presets).
- **UX feedback**: Toasts when layouts are clamped on load, dashboard is full, dock/size changes fail, or save errors. `hideWidget` / `showWidget` accept optional `pageId` query (resolved via `resolvePageId`).
- **WebSocket**: `dashboard_layout` subscription sends `{ pages, layouts, widgetInstances }` (first page mirrored in `layouts` for backward compatibility).
- **Dock sizes**: `dock-top`, `dock-bottom`, `dock-left`, `dock-right`, `dock-bottom-two-thirds`, `dock-full` — anchored regions resolved by `layoutWithFlexibleDocks` in `dashboard-layout-engine` (FE + BE). **Docking is opt-in only** via the widget ⋮ menu (`Dock layout`); resizing a free widget to dimensions that match a dock preset (e.g. 12×3) does **not** dock it — `deriveContentTierFromGrid` / `standardSizesForWidget` exclude dock presets when inferring content tier from grid cells. Docked widgets are **not draggable** (`static` in react-grid-layout) but **share the page** with other widgets. Persisted `layoutConfig.size` must be a `dock-*` value for dock behaviour to apply on load.
- **Flexible docking algorithm**: Each dock's rect is computed directly from the free widgets' final positions (after the user releases drag/resize):
  - `dock-bottom` / `dock-bottom-two-thirds`: anchor to the bottom edge. Top edge = `max(default_top, max(intruder.y + intruder.h))`, capped at `maxRows - dock_minH`.
  - `dock-full`: starts as the full grid and shrinks from all four sides to the largest axis-aligned rect that still contains the grid center (`cols/2`, `maxRows/2`), stopping at `minW=3`, `minH=2`. Free widgets can sit on top, bottom, left, or right.
  - `dock-top`: anchor to the top edge. Height = `min(default_h, min(intruder.y))`, floored at `dock_minH`.
  - `dock-left` / `dock-right`: anchor horizontally; width shrinks along the same axis.
  - **Intrinsic dock bounds** (`dockBounds`) are independent of the widget's other allowed sizes so any dock can shrink as needed (e.g., `dock-bottom` can drop from `h=3` to `h=1`). If a dock hits its `minH`/`minW` and a free widget still overlaps, the free widget is pushed out along the same axis via `pushFreeWidgetOutOfDock` (never below `0` or past the grid edge).
- **Reflow timing**: `WidgetGrid` skips `onLayoutChange` while a drag or resize is in progress (`isInteractingRef`). The single commit fires inside `onDragStop` / `onResizeStop` and is routed through `commitLayout`, which calls the parent's `onLayoutChange` (returns `boolean` — `false` = reject).
- **Strict placement validation** (`validateProposedFreeLayout`): every drag/resize stop runs the proposed layout through the dock-aware reflow and is **rejected** if any free widget had to be pushed off its proposed position, or if any free widget still overlaps another free widget or a dock that hit its minimum size. Rejected commits call `WidgetGrid.resyncGridLayoutAfterReject`: a two-frame props resync (rejected layout → parent layouts) that resets react-grid-layout internal state **without remounting widgets**. This guarantees: (a) no two free widgets can overlap, and (b) you can only drop a widget into a dock's area if the dock can shrink enough to make room.
- **Live dock shrink during drag/resize**: `useDashboardState.computeLiveDockGestureForPage` is passed to `WidgetGrid`. On each RGL `onDrag` / `onResize` tick (coalesced to one `requestAnimationFrame` per frame), `computeLiveDockGesture` runs **`layoutWithFlexibleDocks` once** and returns both dock preview rects and placement validity. The engine is **skipped when the snapped grid cell (x/y/w/h) is unchanged** — common while dragging within the same cell — but cached dock rects are still re-applied to the DOM because RGL's per-tick re-render wipes inline overrides. Dock elements are cached at gesture start to avoid repeated `querySelector` work. Inline `transform` / `width` / `height` styles are written on each dock's `[data-widget-id]` wrapper. A `useLayoutEffect` driven by an internal `liveTick` re-applies the overrides after every commit. On `onDragStop` / `onResizeStop` we **only drop our bookkeeping refs** — we do NOT `removeProperty` the inline styles: React's style differ skips re-setting any property whose vdom value didn't change since the previous render, so stripping the inline style and then re-rendering with the same value would leave the element with no transform/width/height (the dock would visually collapse to `top:0,left:0` and overlap everything as if it had become a left-anchored dock). Leaving the last live values in place keeps DOM and React state consistent — the engine produces the same rect on commit as the live overlay (same inputs), and anything that does change post-commit (validation reject → remount, or the engine settling on a different rect) appears as a vdom diff and React overwrites our value.
- **react-grid-layout configuration**: `allowOverlap: true` + `compactType: null` + `isBounded: true`, with docks marked `static`. `allowOverlap` short-circuits RGL's collision handling entirely (`moveElement` returns immediately on collision, without invoking the buggy `moveElementAwayFromCollision` branch that mutates sibling positions when `compactType: null`). The dragged widget moves freely anywhere in the grid — including visually on top of a dock during the gesture — and every other RGL-controlled item stays put. The reflow engine on `onDragStop` / `onResizeStop` is the final arbiter (and decides whether to accept or revert, per the strict-validation bullet above). **`breakpoint="lg"`** keeps the grid on 12 columns at all viewport widths (dashboard geometry is always 6×12). RGL **`onLayoutChange` is ignored** (breakpoint/width mutations must not overwrite persisted layout); the parent **`useDashboardState` layout is the preferred geometry** and is re-applied via a **debounced `ResizeObserver` resync** (~200ms after container width settles, skipped while dragging/resizing). Layout commits and debounced saves run **only** from `onDragStop` / `onResizeStop`.
- **Explicit grid container height**: with `autoSize: false`, RGL only sets `style.height` when `autoSize` is on, otherwise the container has no explicit height. Its children are absolutely positioned so it collapses to 0px, which makes GridItem's drag handler clamp `top` to `0 - itemHeightPx` (negative) → widgets get pinned to row 0 and only horizontal drag works (width is measured by `WidthProvider`, not `offsetParent`). `WidgetGrid` passes an explicit `style.height = maxRows * rowHeight + (maxRows - 1) * marginV` so vertical drag has the full row range.
- **Undock**: `WidgetSizeDropdown` renders an **Undock** entry beneath the dock options whenever the widget's current size is a dock preset and the widget has at least one standard (non-dock) size in its `availableSizes`. Clicking it routes through the regular `onSizeChange` flow (`updateWidgetSize` → `applyWidgetSizeToPage`). **Undock preserves the widget's current grid w/h** (including flex-shrunk dock dimensions). The **`size` enum** maps to the matching standard content tier via `contentTierForUndock` (e.g. `dock-bottom` → `large-wide`) and stays stable while the grid remains dock-shaped. **`getWidgetLayoutProfile`** accepts optional `gridW`/`gridH` so free-form widgets at dock-shaped footprints keep the same interior layout (compact density, column visibility, list caps) as the dock preset. Dashboard passes live grid dimensions into widgets via `gridSize`. Docking via the menu still applies preset geometry.
- **Placement**: `findPlacement` / `clampLayout` on add and load; widgets must not overlap or exceed row bound.
- **Drag resize** (staff, active page): While resizing, `onResize` updates the **content tier preview** only when the snapped grid cell (w/h) crosses a threshold — stored in a lightweight ref (`previewResizeRef`) so the full `pages` tree is not rewritten on every step. Only the resizing widget receives an updated `displaySize`; other widgets stay memoized. On mouse-up, **grid w/h from the resize grip are kept as-is** (clamped to grid bounds only). The **`size` enum updates** to the nearest content tier via `deriveContentTierFromGrid`. Dock-free pages use a fast overlap-only live validation path during resize; docked pages still run the full reflow but only when the snapped grid cell changes.
- **Live placement guide**: During drag/resize, `computeLiveDockGestureForPage` runs the same `buildProposedFreeFromGesture` + `validateProposedFreeLayout` check as drop. The invalid class `widget-grid--placement-invalid` is applied on the **grid element** (alongside `widget-grid`) so the RGL placeholder and dragging/resizing widget outline turn **red** when the placement would be rejected. `setPlacementInvalid` only fires when validity flips to avoid extra React commits.
- **Add widget fallback**: `findPlacementWithFallback` tries `defaultSize` first, then progressively **smaller** allowed sizes; toast only when nothing fits.

## Widget fullscreen (focus mode)

- Some widgets opt in via **`supportsFullscreen: true`** in the widget registry (currently `facility-viewer` and `units-manager`). Entering focus pins **`activePageId`** to the widget’s page; exiting does not remount the page strip (bottom pager hidden while focused).

## User Management widget

- Registry type: **`user-management`** (admin / facility_admin / dev_admin). Medium/large sizes.
- Searchable user list honoring the global facility selector; each row shows invite status (`never_invited` / `invite_pending` / `active` / `placeholder`) and shared **InviteActions** (Resend Invite or Reset Account & Re-invite).
- See [auth.md](./auth.md) for the reset-account API.
- UI: `Widget` header shows a maximize/minimize button when `onFullscreenToggle` is supplied. The widget renders in `FullscreenWidgetView` (`frontend/src/components/Dashboard/FullscreenWidgetView.tsx`) — an in-canvas overlay that takes the full dashboard real estate (the route stays no-scroll). **Page navigator** is hidden while focused.
- Exit: floating **Back** pill, header minimize, or **Esc**.
- State: `useDashboardState.focusedWidgetId` (single widget at a time); persisted in `blulok-dashboard-v2` so refresh restores focus. Cleared automatically on page switch and on widget removal.
- Single-instance guarantee: while focused, the underlying grid cell renders an empty placeholder so heavy widgets (3D viewer / data fetchers / WebSocket subscribers) do **not** double-mount.
- Sizing strategy: when a chosen size doesn't fit on the current page, the toast hint suggests using **Fullscreen** for widgets that support it; fullscreen never mutates persisted layouts.

## Facility scope

- **Selector**: `GlobalFacilityContext` (`selectedFacilityId`, `ALL_FACILITIES_ID`).
- **Dashboard**: `DashboardPage` computes `effectiveFacilityId` (undefined when “All facilities”) and passes **`facilityFilter`** into widgets that support it (activity monitor, remote gate, histogram, notifications, battery, unlocked units).
- **Shared hook**: `useDashboardFacilityScope(facilityFilter)` — single facility → that ID; global admin + all facilities → no filter; scoped roles + all facilities → live facility list from `GlobalFacilityContext` (`GET /facilities`). Used by notifications widget and histogram.
- **Notifications widget**: loads up to 100 rows per page from REST with **`includeExpired: true`** (historical + expired alerts); default tab is **All**; WebSocket merges live updates. Not the same data as Activity Monitor.
- **Hooks**: `useUnitsData(facilityId)` forwards **`facility_id`** to `GET /units` and `GET /units/unlocked`, and refreshes on **`device_status` / `units`** via `useLockDeviceRealtime`.
- **General stats**: `useGeneralStatsData` passes optional **`facility_id`** to **`GET /dashboard/general-stats`** when a single facility is selected. WebSocket **`general_stats`** updates apply only for “all facilities”; when facility-scoped, **`device_status` / `units`** trigger debounced REST refetch. Occupancy-driving mutations (`UnitsService` assign / unassign / status update / overlock, including FMS sync) broadcast both **`units_update`** and **`general_stats_update`** so widgets refresh without a page reload.
- **Histogram / activity widgets**: subscribe to **`activity`** (with `facility_id` when scoped) and debounce **`getActivityStats`** / access-history REST reloads. Histogram aggregates **access attempts and unlocks only** (lock events are excluded).

## Live WebSocket subscriptions (dashboard `/ws`)

- **Transport** (`frontend/src/services/websocket.service.ts`): JWT auth on connect; **infinite reconnect** with exponential backoff (**first retry immediate, then cap 5s**) while a token exists; bidirectional JSON heartbeats every **5s**; client forces reconnect if no server traffic for **15s** (3× heartbeat); `pagehide` / tab close suspends quietly (no reconnect storm); `visibilitychange` / bfcache `pageshow` resumes aggressively. Subscriptions are **deduped by `type + JSON.stringify(filters)`**; subscribe while offline **queues intent** and sends on reconnect. Operator toasts (`useLiveDataToasts`): warn after **10s** without live data; success when it resumes after a confirmed outage.
- **React layer** (`WebSocketContext`): multiple components can share one server subscription per type+filters; **unsubscribe only when the last local handler unmounts**. On reconnect, re-asserts any active local subscriptions if transport lost them. Prefer **`useWebSocketSubscription`** or subscribe in `useEffect` **without** tearing down on `isConnected === false` (disconnect must not unsubscribe — that dropped live feeds before reconnect).
- **Lock / units realtime**: **`useLockDeviceRealtime`** — facility- or device-scoped **`device_status`** + optional **`units`** debounced refresh.
- **Access codes (app widget)**: **`access_codes`** subscription (optional `{ facility_id }`); server pushes **`access_codes_update`** after rotation/manual set; RBAC via `AccessCodeService.getAppCodesForUser`.
- **Access code push state (admin Access Groups)**: **`access_code_push_state`** requires `{ facility_id }`; ADMIN / DEV_ADMIN / FACILITY_ADMIN with facility RBAC; live push outbox status plus optional `refresh_effective_codes` nudge for REST refetch.- **Shared keys**: **`key_sharing`** subscription (optional `{ facility_id }`); server pushes **`key_sharing_update`** after create/update/revoke; RBAC mirrors REST `/key-sharing`.
- **Unsubscribe fallback**: server resolves unsubscription by `subscriptionType` + `data` filters when `subscriptionId` is missing/stale.
- **Dashboard header**: live connection pill (`Live` / `Reconnecting…` / `Offline`) reflects transport state; use **`useWebSocketSubscription`** in widgets instead of inline `subscribe()` effects.
- **Backend** (`backend/src/services/websocket.service.ts`): JWT on upgrade; server heartbeats every **5s** (`DASHBOARD_WS_HEARTBEAT_MS`); **idle sever** after **15s** without a client heartbeat (`DASHBOARD_WS_IDLE_MS`, close `1001`); idle sweep ~every 2s; expected closes (`1000`/`1001`) log at debug, unexpected disconnects at warn; **`FacilityAccessService.getUserFacilityIds`** on connect (refreshed on heartbeat + association changes via `scope_update`); duplicate subscribe requests for the same type+filters return the existing subscription id; subscription managers validate facility/device/unit access per filter.
- **No per-widget Refresh buttons** — dashboard escape hatch is the page-level reload control only.

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
| **`GET /access-sessions`** | Session-aggregated Access History (widget + page). Scoped via access services / tenant–unit rules. |
| **`GET /access-history`** | Raw event rows by default (`view=raw`); transitional `view=sessions` bridge. |
| **`GET /notifications`** | `NotificationService.getUserNotifications` enforces **own user** (except admins); optional **`facilityId`** requires **`canAccessFacility`**. |

## RBAC: Add Widget modal

- Registry **`requiredPermissions`** lists roles allowed to add each widget type (including **`maintenance`** alongside **`facility_admin`** where appropriate, **`tenant`** for tenant-facing widgets).
- **`AddWidgetModal`** uses **`filterWidgetsByRole`** (`rbac.utils.ts`): **`dev_admin`** is treated like **`admin`** where `admin` is listed; **`maintenance`** may use widgets that include **`facility_admin`**.

## Dashboard settings modal (tabbed)

- **`DashboardSettingsModal`** uses Headless UI **`Tab.Group`**: **Pages** (admin/dev_admin only — `canEditLayout`, independent of current page count) · **Widgets** · **Saved dashboards** (admin/dev_admin only).
- **Layout editing** (drag, resize, add/remove widgets, multi-page, settings cog) is restricted to **`admin`** and **`dev_admin`** on both frontend (`isAdmin()` in `DashboardPage`) and backend (`requireAdmin` on widget-layout POST/PUT/DELETE/show/reset). Non-admins may **read** via `GET /widget-layouts` only.
- **Read-only roles** (`facility_admin`, `maintenance`, `blulok_technician`, `tenant`) receive their resolved working layout via **`GET /widget-layouts`** but cannot mutate it.

## Saved dashboard library

Two persistence layers:

| Layer | Tables | Who writes | Purpose |
|-------|--------|------------|---------|
| **Working state** | `user_dashboard_pages`, `user_widget_layouts` | Auto-saved on edit (admin/dev_admin) | What each user sees now |
| **Saved library** | `saved_dashboards` | Admin/dev_admin via settings modal | Org-wide named templates (snapshot JSON) |

- **API**: `GET/POST/PATCH/DELETE /api/v1/saved-dashboards`, **`POST /api/v1/saved-dashboards/:id/load`** — all require **`requireAdmin`**.
- **Save current**: server reads caller's working layout from DB (after frontend flushes pending canvas saves), validates/clamps, stores `{ version: 1, pages: [...] }` snapshot. Name is org-wide unique.
- **Load**: copies snapshot into caller's working tables via `UserWidgetLayoutModel.saveDashboardState`; frontend replaces canvas via `useDashboardState.replaceFromApiResponse`.
- **Frontend hook**: `useSavedDashboards` fetches the library when the Saved tab opens; wired from `DashboardPage`.

## Dashboard assignments (hierarchical)

Resolution order for **`GET /widget-layouts?activeFacilityId=`** (`__ALL_FACILITIES__` = all-facilities view):

1. **Admin/dev_admin with personal working rows** → personal layout
2. **User override** → saved snapshot
3. **Facility** (`facility_id` = active facility or `NULL` for all-facilities) → snapshot
4. **Global** → snapshot
5. **Personal / role defaults** (fallback; non-admins ignore legacy personal rows)

Within each tier, highest **`priority`** wins. Assigned layouts are read-only for non-admins; focus mode remains available.

- **Widget visibility on assigned layouts**: When resolving a saved snapshot for a role, widgets are authorized via the **code registry** (`WidgetTypeHelper` / `requiredPermissions`), not only rows in `default_widget_templates`. DB templates still enrich names/sizes when present. Widgets the role cannot access are stripped from the snapshot before the API response.

- **API**: `GET/POST/PATCH/DELETE /api/v1/dashboard-assignments` — admin/dev_admin only; `PATCH` updates template (`savedDashboardId`) and/or `priority`
- **Settings UI**: System Settings → **Dashboard** — personal layout tools (admin/dev_admin) plus org template library and assignment rules (admin/dev_admin); slide-over panel for add/edit rules
- **Template library**: Dashboard settings modal → Saved dashboards — save as new template, **update existing template** (preserves assignments), load, rename, delete
- **Live updates**: WebSocket `dashboard_layout` + refetch on facility selector change

## Units Manager widget (dockable)

- Dock-friendly grid view that scopes to the global facility selector (`facilityFilter`).
- Source: **`GET /units?facility_id=<uuid>&limit=200`** via `apiService.getUnits`. Backend: `UnitModel.getUnitsListForUser` returns lock state, battery, signal, last activity, primary tenant (with email + phone), and BluLok device id.
- **Live updates**: `useLockDeviceRealtime` merges **`device_status`** for lock telemetry and debounces a background list refetch on **`units_update`** (tenant assign/unassign, FMS occupancy sync, unit status) so occupancy/tenant columns stay fresh without a manual refresh.
- **Grid columns** (dock / large+): sticky header — Unit (sortable, natural order) · Tenant (widest column) · Device (online/offline badge only) · Status (battery, signal, lock icons) · Last access (sortable).
- **Quick filters** (toolbar, not persisted): **Occupied**, **Unoccupied**, **Unlocked**, and **Low batt** toggle like radio buttons — mutually exclusive, deselectable to show all. Occupied/unoccupied match unit `status` (`occupied` / `available`). Low batt includes low/critical levels (&lt;30%), `low_battery` device status, and unknown battery. Empty filter state shows a contextual message plus “Show all units”.
- **Sort**: unit name (default, natural) or last access — click column headers to sort; click again to reverse.
- Search matches unit number, facility, tenant name/email, and **device serial**.
- Expanding a row (one at a time) uses a **3-column** panel with **inline section links** (same style as Recent access “View all”): unit details, view all activity, view tenant (`/users/:id/details`), device details. **Remote unlock** remains the only primary button in the device column.
- **View all** activity → `/access-history?unit_id=:id&facility_id=:facilityId` (when known). `AccessHistoryPage` reads `unit_id` / `facility_id` from the query string, pre-fills filters, expands the filter panel, and fetches scoped logs.
- RBAC: visible to admin / dev_admin / facility_admin / maintenance.
- Animations: `framer-motion` `layout` transitions, spring lock-icon morph, height-auto expand, list stagger.

## Notifications widget

- Data from **`GET /api/v1/notifications`** with optional **`facilityId`**.
- **“Action required”** is **derived** in **`notification-display.utils.ts`** from **`priority`** (`high`, `urgent`) and **`notification_type`** (`security_alert`, `maintenance_alert`) — not a DB column.
- Real-time: WebSocket subscription type **`notifications`**; `websocket.service` routes `notifications_update`, `notification_created`, etc., to the same handlers.
