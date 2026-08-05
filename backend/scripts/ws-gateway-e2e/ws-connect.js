/**
 * Dashboard / gateway / app WebSocket connect helpers for the gateway E2E suite.
 * Mutable suite state (event buffers, ack modes) is passed via the ctx object.
 */

const { delay } = require('./logging');
const { waitForProxyResponse } = require('./ws-waiters');

/**
 * @param {object} ctx
 * @param {typeof import('ws')} ctx.WebSocket
 * @param {string} ctx.UI_WS_URL
 * @param {string} ctx.APP_WS_URL
 * @param {boolean} ctx.VERBOSE
 * @param {string} ctx.E2E_GATEWAY_AUTH
 * @param {() => object|null} ctx.getZtpFixture
 * @param {(wsUrl: string, opts: object) => Promise<{ws: any, authOk: any}>} ctx.connectGatewayWsZtp
 * @param {any[]} ctx.gatewayWsEvents
 * @param {any[]} ctx.notificationEvents
 * @param {{ current: any }} ctx.notificationsWsRef
 * @param {() => string} ctx.getAccessCodeAckMode
 * @param {() => string} ctx.getDeviceDeletionAckMode
 * @param {(msg: any) => any} ctx.normalizeCmd
 */
function createWsConnect(ctx) {
  const {
    WebSocket,
    getZtpFixture,
    connectGatewayWsZtp,
    gatewayWsEvents,
    notificationEvents,
    notificationsWsRef,
    getAccessCodeAckMode,
    getDeviceDeletionAckMode,
    normalizeCmd,
  } = ctx;

  const uiWsUrl = () => ctx.UI_WS_URL;
  const appWsUrl = () => ctx.APP_WS_URL;
  const verbose = () => ctx.VERBOSE;
  const e2eGatewayAuth = () => ctx.E2E_GATEWAY_AUTH;

  async function connectDeviceStatusWatcher(token) {
    const events = [];
    const wsUrl = `${uiWsUrl()}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (verbose()) console.log('[WS-DEV-STATUS <-]', data.toString());
        if (msg.type === 'device_status_update' && msg.data) {
          events.push(msg);
        }
      } catch {
        /* ignore */
      }
    });
    return { ws, events };
  }

  async function subscribeDeviceStatusAndWaitInitial(ws, events, deviceId, timeoutMs = 8000) {
    ws.send(JSON.stringify({
      type: 'subscription',
      subscriptionType: 'device_status',
      data: { device_id: deviceId },
    }));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (events.some((e) => e.data?.devices?.some((d) => d.id === deviceId))) {
        return events.find((e) => e.data?.devices?.some((d) => d.id === deviceId));
      }
      await delay(200);
    }
    return null;
  }

  function closeDeviceStatusWatcher(ws) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  async function connectUiWsMessageCollector(token, messageFilter) {
    const events = [];
    const ws = new WebSocket(`${uiWsUrl()}?token=${token}`);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('UI WS open timeout')), 5000);
      ws.once('open', () => {
        clearTimeout(timeout);
        resolve(null);
      });
      ws.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (verbose()) console.log('[WS-UI <-]', data.toString());
        if (messageFilter(msg)) events.push(msg);
      } catch {
        /* ignore */
      }
    });
    return { ws, events };
  }

  async function waitForWsControlMessage(ws, predicate, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for WS control message')), timeoutMs);
      const onMessage = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (predicate(msg)) {
            ws.off('message', onMessage);
            clearTimeout(timeout);
            resolve(msg);
          }
        } catch {
          /* ignore */
        }
      };
      ws.on('message', onMessage);
    });
  }

  async function connectAppWs(token) {
    const events = [];
    const control = [];
    const ws = new WebSocket(`${appWsUrl()}?token=${encodeURIComponent(token)}`);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('App WS open timeout')), 5000);
      ws.once('open', () => {
        clearTimeout(timeout);
        resolve(null);
      });
      ws.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (verbose()) console.log('[WS-APP <-]', data.toString());
        if (msg.type === 'app_event') events.push(msg);
        else control.push(msg);
      } catch {
        /* ignore */
      }
    });
    return { ws, events, control };
  }

  async function subscribeAppFacility(ws, facilityId, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('App subscribe timeout')), timeoutMs);
      const onMessage = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscription' && msg.subscriptionType === 'app') {
            cleanup();
            resolve(msg);
          } else if (msg.type === 'error') {
            cleanup();
            reject(new Error(msg.error || 'App subscribe error'));
          }
        } catch {
          /* ignore */
        }
      };
      const cleanup = () => {
        clearTimeout(timeout);
        ws.off('message', onMessage);
      };
      ws.on('message', onMessage);
      ws.send(JSON.stringify({
        type: 'subscription',
        subscriptionType: 'app',
        data: { facility_id: facilityId },
      }));
    });
  }

  function closeAppWs(ws) {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  async function proxyWs(ws, id, method, path, { query, body } = {}) {
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id, method, path, query, body }));
    return await waitForProxyResponse(ws, id);
  }

  async function connectGatewayWsAndAuth(wsUrl, token, facilityId, gatewayId, authExtras = {}) {
    if (!gatewayId) throw new Error('gatewayId required for gateway WS AUTH');

    const attachHandlers = (ws) => {
      ws.on('message', (data) => {
        try {
          if (verbose()) console.log('[WS <-]', data.toString());
          const msg = JSON.parse(data.toString());
          gatewayWsEvents.push(msg);
          if (msg?.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
          const cmd = normalizeCmd(msg);
          if (cmd?.cmd_type === 'ACCESS_CODE_UPDATE' && cmd?.nonce) {
            const accessCodeAckMode = getAccessCodeAckMode();
            if (accessCodeAckMode === 'accept') {
              ws.send(JSON.stringify({
                type: 'ACCESS_CODE_UPDATE_ACK',
                nonce: cmd.nonce,
                accepted: true,
              }));
            } else if (accessCodeAckMode === 'reject') {
              ws.send(JSON.stringify({
                type: 'ACCESS_CODE_UPDATE_ACK',
                nonce: cmd.nonce,
                accepted: false,
                message: 'e2e-forced-reject',
              }));
            }
          }
          if (cmd?.cmd_type === 'DEVICE_DELETED' && cmd?.nonce) {
            const deviceDeletionAckMode = getDeviceDeletionAckMode();
            if (deviceDeletionAckMode === 'accept') {
              ws.send(JSON.stringify({
                type: 'DEVICE_DELETED_ACK',
                nonce: cmd.nonce,
                success: true,
              }));
            } else if (deviceDeletionAckMode === 'reject') {
              ws.send(JSON.stringify({
                type: 'DEVICE_DELETED_ACK',
                nonce: cmd.nonce,
                success: false,
                error: 'e2e-forced-reject',
              }));
            }
          }
        } catch { /* ignore */ }
      });
    };

    if (e2eGatewayAuth() === 'ztp') {
      const fixture = getZtpFixture();
      if (fixture?.privateKeyPem && fixture.deviceId === gatewayId) {
        const { ws, authOk } = await connectGatewayWsZtp(wsUrl, {
          privateKeyPem: fixture.privateKeyPem,
          gatewayId,
          facilityId,
          firmware_version: authExtras.firmware_version,
          onMessageSetup: attachHandlers,
        });
        ws._authOkData = authOk;
        return ws;
      }
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    attachHandlers(ws);
    const authMsg = { type: 'AUTH', token, facilityId, gatewayId };
    if (authExtras.firmware_version) authMsg.firmware_version = authExtras.firmware_version;
    if (verbose()) console.log('[WS ->]', JSON.stringify(authMsg));
    ws.send(JSON.stringify(authMsg));
    let authOkData = null;
    await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('AUTH timeout')), 4000);
      ws.once('message', (data) => {
        try {
          if (verbose()) console.log('[WS <-]', data.toString());
          const m = JSON.parse(data.toString());
          if (m?.type === 'AUTH_OK' && m.facilityId === facilityId) { authOkData = m; clearTimeout(timer); res(null); }
          else { clearTimeout(timer); rej(new Error('AUTH not ok')); }
        } catch (e) { clearTimeout(timer); rej(e); }
      });
    });
    ws._authOkData = authOkData;
    return ws;
  }

  async function connectNotificationsWs(token) {
    const url = `${uiWsUrl()}?token=${token}`;
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (verbose()) console.log('[WS-DEV <-]', data.toString());
        if (msg.type === 'dev_notifications_update' && msg.data) {
          notificationEvents.push(msg.data);
        }
      } catch { /* ignore */ }
    });
    ws.send(JSON.stringify({
      type: 'subscription',
      subscriptionType: 'dev_notifications',
    }));
    return ws;
  }

  async function ensureNotificationsWs(token) {
    if (notificationsWsRef.current && notificationsWsRef.current.readyState === WebSocket.OPEN) {
      return notificationsWsRef.current;
    }
    try {
      notificationsWsRef.current?.terminate();
    } catch {
      /* ignore */
    }
    notificationEvents.length = 0;
    notificationsWsRef.current = await connectNotificationsWs(token);
    await delay(300);
    return notificationsWsRef.current;
  }

  async function waitForNotification(predicate, timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const idx = notificationEvents.findIndex(predicate);
      if (idx >= 0) {
        return notificationEvents.splice(idx, 1)[0];
      }
      await delay(200);
    }
    throw new Error('Timed out waiting for DEV_NOTIFICATION event');
  }

  async function waitForGatewayEvent(predicate, timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const idx = gatewayWsEvents.findIndex(predicate);
      if (idx >= 0) {
        return gatewayWsEvents.splice(idx, 1)[0];
      }
      await delay(100);
    }
    throw new Error('Timed out waiting for gateway WS event');
  }

  return {
    connectDeviceStatusWatcher,
    subscribeDeviceStatusAndWaitInitial,
    closeDeviceStatusWatcher,
    connectUiWsMessageCollector,
    waitForWsControlMessage,
    connectAppWs,
    subscribeAppFacility,
    closeAppWs,
    proxyWs,
    connectGatewayWsAndAuth,
    connectNotificationsWs,
    ensureNotificationsWs,
    waitForNotification,
    waitForGatewayEvent,
  };
}

module.exports = {
  createWsConnect,
};
