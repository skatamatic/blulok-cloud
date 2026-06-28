# Gateway Simulator (Electron)

Desktop app at `gateway-simulator/` that impersonates an on-site mesh-manager gateway against the BluLok Cloud backend over **`/ws/gateway`**.

## Purpose

- Run e2e/manual tests without physical gateway hardware
- Configure contrived scenarios (device inventory, ACK modes, firmware outcomes)
- Multiple simulated gateways in a sidebar + detail layout
- Persist per-gateway profiles under Electron `userData` (auto-restore on launch)

## Persistence

Stored in Electron `userData` (main process only — tokens never sent to renderer):

| Path | Contents |
|------|----------|
| `gateway-profiles/{id}.json` | One file per gateway tab: label, facility, gatewayId, gateway name/serial cache, **deviceRecords** (inventory + sim state), behavior, auth token |
| `user-profiles/{id}.json` | One file per simulated user profile |
| `session.json` | Last login: backend URL, email, token |
| `catalog-session.json` | Admin catalog import session |
| `app-state.json` | Last active tab id |

Legacy monolithic `gateway-profiles.json` / `user-profiles.json` bundles are migrated once on startup into per-profile files and archived as `*.migrated`.

**Durability:** All JSON writes use atomic replace (temp file → fsync → backup previous → rename), serialized through a write lock to avoid read-modify-write races when multiple gateways persist at once. Loads fall back to `.bak` when the primary file is truncated or corrupt (e.g. after OOM kill mid-write).

Gateway tabs are saved immediately on create and restored when the app starts. Device/behavior changes persist on each mutation. Removing a tab deletes its profile from disk.

## Undo / redo

Main-process snapshot history (up to 50 steps). Toolbar buttons, **Edit → Undo/Redo**, and **Ctrl+Z / Ctrl+Y** (skipped while typing in inputs).

**Undoable:** add/remove gateway tab, gateway settings, behavior changes, add/update/remove/clear devices, **device detail edits** (inventory + sim state, denylist, access codes), reset device to defaults, reset gateway state.

**Not undoable:** connect/disconnect, sync inventory/state, access events, navigation/tab selection, login, cloud fetch, inventory snapshot pushes from the server.

Device slider edits coalesce into one undo step per device field.

| Real gateway behavior | Simulator implementation |
|----------------------|---------------------------|
| WS connect + AUTH | `GatewayConnection` → `ws://<host>/ws/gateway` |
| PING/PONG heartbeat | Auto-reply when `respondToPing` enabled |
| PROXY inventory/state/logs | `ProxyClient` → `/internal/gateway/*` |
| PROXY access events | `ProxyClient.accessEvents()` → `/internal/gateway/access-events` |
| JWT commands (LOCK, denylist, etc.) | `CommandRouter` + handlers — see **Device simulation** below |
| Firmware OTA | `FirmwareReceiver` (chunk ACK + FIRMWARE_UPDATE_STATUS) |
| Device kinds | `lock`, `access_control`, `bridge`, `friend_node`, `gateway` |

Canonical backend types: `backend/src/services/gateway/message-types.ts`

Reference client: `backend/scripts/ws-gateway-e2e.js`

## Run

```bash
# From repo root (backend should be running on :3000)
npm run dev:simulator
```

Setup flow: **reuse saved session** (if logged in before) or sign in → pick **existing facility** → configure **sim tab name**, **cloud gateway name**, and **serial** (pre-filled defaults) → new auto-registering gateway or existing gateway record → Connect.

## Tests

```bash
npm run test                # unit + component tests (437 tests)
npm run test:coverage       # v8 coverage with enforced thresholds (must pass)
npm run test:live-api       # live REST API tests (login, facilities, gateways)
npm run test:live           # full smoke including WS AUTH
```

Includes protocol contract tests that assert parity with backend constants and message literals.

**Component tests** (`__tests__/components/*.test.tsx`): React Testing Library + happy-dom. Covers interaction flows — confirm/remove dialogs, device inventory CRUD, list filters, toasts, connection badges — without asserting exact marketing copy. Shared helpers in `__tests__/components/test-utils.tsx` mock `window.simulator`.

**Coverage scope:** `src/main`, `src/protocol`, and `src/renderer/utils` (pure helpers). Component `.tsx` files are tested via RTL but excluded from v8 coverage thresholds (IPC/Electron wiring remains integration-only). Also excluded: Electron bootstrap (`index.ts`, `app-menu.ts`), WebSocket transport (`GatewayConnection.ts`), preload bridge, and type-only modules (`schedule.types.ts`, etc.).

**Enforced thresholds** (`vitest.config.ts`):

| Scope | Lines / Stmts | Functions | Branches |
|-------|---------------|-----------|----------|
| Global (included files) | **88%** | **88%** | **75%** |
| `src/main/users/**` | **92%** | **90%** | **75%** |
| `UserManager.ts` | **92%** | **90%** | **75%** |
| `MobileApiClient.ts` | **92%** | **90%** | — |
| `BackendClient.ts` | **90%** | **90%** | **75%** |
| `gateway-status-bar.utils.ts` | **88%** | **88%** | **75%** |

Run `npm run test:coverage` before merging simulator changes; Vitest fails the run if any threshold is missed.

**Testability / SOLID layout** (pure logic isolated from Electron/WS):

| Module | Role |
|--------|------|
| `authenticated-api.client.ts` | Bearer JSON transport (GET/PUT/POST); no route knowledge |
| `backend-api.paths.ts` / `backend-api.types.ts` | API path constants and cloud DTO types |
| `BackendClient.ts` | Domain facade over `AuthenticatedApiClient` (login, facilities, gateways, users) |
| `inventory-snapshot-chunk.utils.ts` | SHA-256 chunk verification (used by `InventorySnapshotReceiver`) |
| `gateway-status-bar.types.ts` | State types + initial reducer state |
| `gateway-status-bar-labels.utils.ts` | Payload/command label parsing |
| `gateway-status-bar-format.utils.ts` | Tooltip and timestamp formatting |
| `gateway-status-bar.utils.ts` | Event → status bar state reducer |
| `device-detail-tab.types.ts` / `device-detail-tab.storage.ts` | Tab id types + injectable localStorage wrapper |
| `device-detail.utils.ts` | Tab normalization/filtering (storage injected in tests) |

Excluded from coverage (integration-only): `GatewayConnection.ts`, IPC handlers, Electron bootstrap.

## UI behavior

- **Tabbed panel**: Each gateway uses secondary navigation — **Devices**, **Connection**, **Behavior**, **Settings**, **Logs** (in the main content area). Gateway instances are listed in a **resizable, collapsible** left sidebar (drag the right edge; « / » toggle in the header). Width and collapsed state persist in localStorage. **Add gateway** at the bottom of the sidebar.
- **Settings tab**: Edit the simulator sidebar **tab label** (local only), cloud **gateway name**, and **hardware serial** (`mac_address` on the gateway record). Changes to name/serial call `PUT /api/gateways/:id` via the main-process backend client; serial updates also propagate to the local gateway self-device inventory row when present.
- **Devices tab**: Card layout with inline state fields plus **Details** on each card. **Device detail view** tabs: **Overview** (identity/binding + live telemetry), **Security** (trust keys, denylist, access codes for access_control), **Simulate** (lock/access_control only — route pass and access events), **Activity** (inbound command log). Legacy `keys` / `telemetry` tab ids in localStorage map to **Security** / **Overview**.
- **Auto-reconnect**: When **Auto-reconnect** is enabled in Behavior, the simulator reconnects after an unexpected WebSocket drop (3s countdown shown in the toolbar and offline banner). **Disconnect** / **Disconnect all** clears the persisted “connect on restore” flag and never schedules a retry. On app launch, tabs that were connected when the app last closed reconnect automatically if auto-reconnect is still enabled.
- **Device inventory**: Card layout with inline state fields (lock state, online, battery, firmware, etc.). Gateway self-device is shown but not addable. **Recovery inventory snapshot push** from the cloud (`INVENTORY_SNAPSHOT_*`) is applied via `InventorySnapshotReceiver` → `inventory-snapshot-applier` → `DeviceRegistry.loadInventorySnapshot` (full replace; preserves sim state for devices retained by serial/id). Inventory push is **not** gated by firmware test behavior (`firmwareMode`). `DEVICE_DELETED` tombstones remove matching local rows and refresh the Devices tab via `onDevicesChanged`.
- **Session role UI**: `AUTH_OK.sessionRole` drives badges in the toolbar and Connection tab. The **sidebar uses the status dot** (green = bound, gray = offline) except **swap candidates**, which show a static blue arrow icon. After swap recovery completes, the cloud sends an updated `AUTH_OK` with `sessionRole: active` to the promoted gateway (and the demoted unit reconnects as `swap_candidate`).
- **Live state sync**: Enabled by default for new gateways (Behavior tab). When on, pushes state to the cloud immediately on each device field change when connected. Access control telemetry uses `/devices/state` (online, locked, last_seen only); binding fields (relay channel, name, etc.) use inventory sync. Identity-only lock fields (e.g. lock number) also route to inventory sync.
- **Remote LOCK/UNLOCK**: Inbound `COMMAND` JWTs from the cloud are routed to `LockUnlockHandler`. Behavior **LOCK / UNLOCK** mode controls the response: `accept` (apply + state sync), `apply-only` (local UI only), or `ignore`. The bound **active** gateway session receives commands — swap candidates do not. Sync inventory first so `device_id` in the JWT matches local `lock_id`.
- **Access events**: Presets on each lock/access-control device card (app unlock, keypad denied, admin open, etc.); resolves cloud `device_id` via proxy `GET /devices` after inventory sync.

Addable device kinds: `lock`, `access_control`, `bridge`, `friend_node` — **`gateway` is excluded** (a site cannot nest gateways).

## Device simulation

Each simulated device is a **`SimulatedDeviceRecord`**: cloud-facing **`item`** (`DeviceInventoryItem`) plus local-only **`sim`** (`DeviceSimulatorState`). Profiles persist `deviceRecords[]`; legacy `devices[]` is migrated on load.

**`DeviceSimulatorState`** (local only — not in cloud inventory sync):

| Field | Purpose |
|-------|---------|
| `facilityId` | Set from gateway profile when the device is created |
| `rootKeyPublicB64` | Provisioned root **public** key — verifies `ROTATE_OPERATIONS_KEY` (root private stays in cloud/provisioning only) |
| `operationsKeyPublicB64` | Ops **public** key the device trusts for gateway commands and route passes (from `AUTH_OK` + rotation) |
| `operationsKeyRotatedAt` | Last `ROTATE_OPERATIONS_KEY` |
| `denylist` | JWT `sub` entries from `DENYLIST_ADD` / removed by `DENYLIST_REMOVE`; also seeded from cloud on inventory sync and recovery snapshot |
| `accessCodes` | Keypad codes from `ACCESS_CODE_UPDATE` (access_control only) |
| `lastSecureTimeSyncAt` / `lastSecureTimeSyncTs` | Last `SECURE_TIME_SYNC` |
| `recentCommands` | Rolling log of inbound JWT commands |

**Inbound JWT handlers** (`CommandRouter` → `handlers/index.ts`):

| Command | Effect |
|---------|--------|
| `LOCK` / `UNLOCK` | Inventory lock state + command log; optional cloud state sync when `lockUnlockMode=accept` |
| `DENYLIST_ADD` / `DENYLIST_REMOVE` | Mutate target device denylist (targets match serial, `cloud_device_id`, or legacy lock/access id) |
| `ACCESS_CODE_UPDATE` | Replace access codes on matching access_control devices |
| `ROTATE_OPERATIONS_KEY` | Update ops key on all devices (+ gateway session key) |
| `SECURE_TIME_SYNC` | Apply secure time to devices and gateway |

**UI:** Device cards → **Details** opens `DeviceDetailView`. Edits call `UPDATE_DEVICE_SIM` (undo/redo via profile snapshots). **Reset to defaults** clears sim fields while preserving identity keys; delete + undo restores full `deviceRecords` including sim state.

**Live sync after undo/redo:** `SimulatedGateway.syncAfterProfileRestore()` pushes inventory/state to the cloud when connected if undo/redo changed devices or telemetry.

## Simulated users (mobile tenant flow)

Sidebar catalog **Users** mirrors the mobile app path against the same backend APIs the production app uses.

**Import (recommended):** On **Import user**, sign in with **Admin or Dev Admin** (separate from gateway setup). Then the sim lists `GET /api/v1/users` and for each selection:

1. `POST /api/v1/dev/simulator/user-session` — mints a JWT for that user (cached locally with `exp`)
2. `GET /api/v1/users/:id/details` — pulls registered app devices (admin/dev admin)

No manual email/password entry — users must already exist in the backend.

| Step | API | Simulator action |
|------|-----|-------------------|
| Dev admin session | `POST /auth/login` (import screen) | **Admin sign in** on import user form |
| Import user | `GET /users`, dev mint + user detail | **Import user** in sidebar |
| Refresh session | `POST /dev/simulator/user-session` | **Refresh session** (auto on expiry) |
| Add local device | Client-side Ed25519 | **Add simulator device** |
| Register device | `POST /user-devices/register-key` | **Register key** (local devices only) |
| Use cloud device | Existing backend registration | Imported as **Cloud** — fetch route passes directly |
| Take over locally | Regenerate keys + register | **Take over locally** on cloud-linked device |
| Fetch route pass | `POST /passes/request` | **Fetch route pass** |
| Present at lock | Local verify + access event + live state sync | **Try open with user device** on device detail |

**Persistence:** `user-profiles.json` stores session JWT (+ expiry), ops public key, cloud user id, devices (cloud-linked or simulator-local), and cached route passes per facility.

**Route pass tampering:** Each cached pass can be set to **Valid**, **Expired**, or **Bad sig** to simulate lock-side denial without re-fetching from the cloud.

**Undo/redo:** User import/removal, device keys, route pass tamper/clear, and regenerate keys participate in the unified snapshot history alongside gateway edits.

**Lock verification:** `route-pass-verification.utils.ts` verifies Ed25519 ops signatures (`jose`), checks `aud` for `lock:{serial}` / `shared_key:` / `access_control:`, denylist `sub`, and expiry — matching `cursorDocs/route-pass-jwt.md`.

## Architecture

- **Main process**: WS, protocol, persistence, IPC (secrets never in renderer)
- **Renderer**: React + Tailwind — gateway sidebar + panel detail view
- **Protocol module**: self-contained mirror under `gateway-simulator/src/protocol/`
