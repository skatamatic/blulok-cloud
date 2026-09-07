import { normalizeAddLogBody, wrapProxyStringBodyForAddLog } from '@/utils/gateway-telemetry-log-ingest.utils';

describe('gateway-telemetry-log-ingest.utils', () => {
  describe('normalizeAddLogBody', () => {
    it('wraps a raw log line string', () => {
      const line = '2026-05-26T09:53:21.653711 Gateway heartbeat OK';
      expect(normalizeAddLogBody(line)).toEqual({ message: line });
    });

    it('wraps a JSON string document after parse', () => {
      const line = '2026-05-26T09:53:21.653711 Gateway heartbeat OK';
      expect(normalizeAddLogBody(JSON.stringify(line))).toEqual({ message: line });
    });

    it('passes through message object', () => {
      expect(normalizeAddLogBody({ message: 'hello', tid: 1 })).toEqual({ message: 'hello', tid: 1 });
    });
  });

  describe('wrapProxyStringBodyForAddLog', () => {
    it('wraps string bodies for add_log path', () => {
      const line = 'log line';
      expect(wrapProxyStringBodyForAddLog('/internal/gateway/add_log', line)).toEqual({ message: line });
    });

    it('leaves non-add_log string bodies unchanged', () => {
      expect(wrapProxyStringBodyForAddLog('/internal/gateway/time-sync', 'raw')).toBe('raw');
    });
  });
});
