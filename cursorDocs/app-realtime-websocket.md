# App Realtime WebSocket (`/ws/app`)

Short overview of the **mobile app** multiplexed realtime channel. Separate from the dashboard socket (`/ws`) and the site gateway socket (`/ws/gateway`).

**App implementers (full client contract):** [App Realtime — mobile developer guide](./app-realtime-developer-guide.md)

**Related:** [App lock/unit assignment APIs](./app-lock-unit-assignment-apis.md), [Access / notifications / activity APIs](./access-notifications-activity-apis.md), [Auth & RBAC](./auth.md), [Gateway integration](./gateway-integration.md).

---

## Connect

```
wss://<host>/ws/app?token=<JWT>
```

- Same JWT as REST.
- Prefer Cloud Run **session affinity** when `max-instances > 1` (in-memory subscribers).

## Subscribe

```json
{
  "type": "subscription",
  "subscriptionType": "app",
  "data": { "facility_id": "<uuid>" }
}
```

One active `app` subscription per socket. Ack, then `app_event` with `event: "app_snapshot"`. Change facility via unsubscribe → subscribe.

## Heartbeat

| | |
|--|--|
| Server heartbeat | every 30s (`APP_WS_HEARTBEAT_MS`) |
| Client must heartbeat | every ~20–30s |
| Idle close | `1001` after 60s without **client** heartbeat (`APP_WS_IDLE_MS`) |

## Live envelope

```json
{
  "type": "app_event",
  "subscriptionId": "<id>",
  "facilityId": "<uuid>",
  "event": "device_status_update",
  "data": { },
  "timestamp": "ISO-8601"
}
```

Event catalog, RBAC matrix, snapshot shape, reconnect, and merge rules: see the [mobile developer guide](./app-realtime-developer-guide.md).

## Out of scope on `/ws/app`

Dashboard-only: FMS, firmware push, gateway recovery/telemetry logs, command queue, `general_stats`, `dashboard_layout`, `gateway_debug`, `dev_notifications`.
