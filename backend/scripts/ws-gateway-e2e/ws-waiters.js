/**
 * Common WebSocket wait helpers for the gateway E2E suite.
 */

const { delay } = require('./logging');

function waitForProxyResponse(ws, id, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for PROXY_RESPONSE id=${id}`));
    }, timeoutMs);
    const onMsg = (data) => {
      try {
        const m = JSON.parse(data.toString());
        if (m && m.type === 'PROXY_RESPONSE' && m.id === id) {
          cleanup();
          resolve(m);
        }
      } catch {
        /* ignore non-JSON frames */
      }
    };
    const onErr = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      ws.removeListener('error', onErr);
    };
    ws.on('message', onMsg);
    ws.on('error', onErr);
  });
}

/**
 * Poll `device_status_update` payloads until the row for `deviceId` has `lock_status`.
 * `expected` may be a single status or a list.
 */
async function waitForDeviceStatusLockStatus(events, deviceId, expected, startLen, timeoutMs) {
  const wanted = Array.isArray(expected) ? expected : [expected];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = startLen; i < events.length; i++) {
      const d = events[i]?.data?.devices?.find((x) => x.id === deviceId);
      if (d && wanted.includes(d.lock_status)) return d;
    }
    await delay(200);
  }
  return null;
}

/** Poll device_status_update until a row for `deviceId` satisfies `predicate`. */
async function waitForDeviceStatusRow(events, deviceId, predicate, startLen, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = startLen; i < events.length; i++) {
      const d = events[i]?.data?.devices?.find((x) => x.id === deviceId);
      if (d && predicate(d)) return d;
    }
    await delay(200);
  }
  return null;
}

async function waitForWsEvent(events, predicate, startLen = 0, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = startLen; i < events.length; i++) {
      if (predicate(events[i])) return events[i];
    }
    await delay(200);
  }
  return null;
}

async function waitForAppEvent(events, eventName, startLen = 0, timeoutMs = 8000) {
  return waitForWsEvent(
    events,
    (msg) => msg.type === 'app_event' && msg.event === eventName,
    startLen,
    timeoutMs,
  );
}

module.exports = {
  waitForProxyResponse,
  waitForDeviceStatusLockStatus,
  waitForDeviceStatusRow,
  waitForWsEvent,
  waitForAppEvent,
};
