import { parseGatewayTelemetryLogLine, payloadPathToJsonExtract, sanitizePayloadPath } from '@/utils/gateway-telemetry-log.parser';

describe('gateway-telemetry-log.parser', () => {
  const fixedDate = new Date('2026-05-26T10:00:00.000Z');

  describe('parseGatewayTelemetryLogLine', () => {
    it('parses Header/Payload BLE lock line with timestamp prefix', () => {
      const line =
        '2026-05-26T09:53:21.653711 Sending to /[0:0:0:0:0:0:0:1]:60011: \nHeader 0201, Payload {"lock_number":2453,"tid":2,"lock_id":"3969d612-abc"}';

      const result = parseGatewayTelemetryLogLine(line, fixedDate);

      expect(result.logged_at.toISOString()).toBe('2026-05-26T09:53:21.653Z');
      expect(result.payload).toEqual({
        header: '0201',
        message: 'Sending to /[0:0:0:0:0:0:0:1]:60011:',
        data: {
          lock_number: 2453,
          tid: 2,
          lock_id: '3969d612-abc',
        },
      });
    });

    it('parses plain timestamp + text line without Header/Payload', () => {
      const line = '2026-05-26T09:53:21.653711 Gateway heartbeat OK';

      const result = parseGatewayTelemetryLogLine(line, fixedDate);

      expect(result.logged_at.toISOString()).toBe('2026-05-26T09:53:21.653Z');
      expect(result.payload).toEqual({ message: 'Gateway heartbeat OK' });
    });

    it('parses entire line as JSON object', () => {
      const line = '{"event":"connected","device_id":"dev-1"}';

      const result = parseGatewayTelemetryLogLine(line, fixedDate);

      expect(result.logged_at).toEqual(fixedDate);
      expect(result.payload).toEqual({ event: 'connected', device_id: 'dev-1' });
    });

    it('wraps unparseable content as message', () => {
      const line = 'not json and no timestamp';

      const result = parseGatewayTelemetryLogLine(line, fixedDate);

      expect(result.logged_at).toEqual(fixedDate);
      expect(result.payload).toEqual({ message: 'not json and no timestamp' });
    });

    it('handles empty line', () => {
      const result = parseGatewayTelemetryLogLine('   ', fixedDate);
      expect(result.payload).toEqual({ message: '' });
    });

    it('handles malformed Header/Payload JSON gracefully', () => {
      const line = '2026-05-26T09:53:21.653711 Some event\nHeader ABCD, Payload {not valid json}';

      const result = parseGatewayTelemetryLogLine(line, fixedDate);

      expect(result.payload.header).toBe('ABCD');
      expect(result.payload.message).toBe('Some event');
      expect(result.payload.data).toBeUndefined();
    });
  });

  describe('sanitizePayloadPath', () => {
    it('accepts valid dot paths', () => {
      expect(sanitizePayloadPath('data.lock_id')).toBe('$.data.lock_id');
      expect(sanitizePayloadPath('header')).toBe('$.header');
    });

    it('rejects invalid segments', () => {
      expect(sanitizePayloadPath('data.$invalid')).toBeNull();
      expect(sanitizePayloadPath('')).toBeNull();
    });
  });

  describe('payloadPathToJsonExtract', () => {
    it('builds JSON path for extract', () => {
      expect(payloadPathToJsonExtract('data.lock_id')).toBe('$.data.lock_id');
      expect(payloadPathToJsonExtract('header')).toBe('$.header');
    });
  });
});
