jest.mock('@/services/database.service');
jest.mock('@/services/gateway/gateway-events.service');

import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

const buildToken = (role = 'dev_admin') => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ userId: 'dev-admin', role })).toString('base64');
  return `${header}.${payload}.signature`;
};

describe('Ops Key Rotation Route', () => {
  let app: any;
  let mockKnex: jest.Mock;
  let systemSettingsRow: { value?: string } | null;
  let broadcastMock: jest.Mock;

  beforeEach(() => {
    systemSettingsRow = null;

    const systemSettingsTable = () => {
      const query: any = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockImplementation(async () => systemSettingsRow),
        update: jest.fn().mockImplementation(async ({ value }) => {
          systemSettingsRow = { value };
        }),
        insert: jest.fn().mockImplementation(async ({ value }) => {
          systemSettingsRow = { value };
        }),
      };
      return query;
    };

    mockKnex = jest.fn((table: string) => {
      if (table === 'system_settings') {
        const tableRef = systemSettingsTable();
        tableRef.fn = { now: () => new Date() };
        return tableRef;
      }
      return {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn(),
        update: jest.fn(),
        fn: { now: () => new Date() },
      };
    }) as any;
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: mockKnex });

    broadcastMock = jest.fn();
    (GatewayEventsService.getInstance as jest.Mock).mockReturnValue({ broadcast: broadcastMock });

    app = createApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('generates and broadcasts a new ops key pair when custom key is not provided', async () => {
    const response = await request(app)
      .post('/api/v1/admin/ops-key-rotation/broadcast')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({
        root_private_key_b64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.payload).toMatchObject({ cmd_type: 'ROTATE_OPERATIONS_KEY' });
    expect(typeof response.body.signature).toBe('string');
    expect(response.body.generated_ops_key_pair).toBeDefined();
    expect(response.body.generated_ops_key_pair.public_key_b64).toBeTruthy();
    expect(response.body.generated_ops_key_pair.private_key_b64).toBeTruthy();
    expect(broadcastMock).toHaveBeenCalledWith([response.body.payload, response.body.signature]);
  });

  it('uses custom ops public key when provided', async () => {
    systemSettingsRow = { value: '1000' };
    const customKey = 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ'; // valid base64 for repeated 'A'
    const response = await request(app)
      .post('/api/v1/admin/ops-key-rotation/broadcast')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({
        root_private_key_b64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        custom_ops_public_key_b64: customKey,
      })
      .expect(200);

    expect(response.body.payload.new_ops_pubkey).toBe(customKey);
    expect(response.body.generated_ops_key_pair).toBeUndefined();
    expect(broadcastMock).toHaveBeenCalledWith([response.body.payload, response.body.signature]);
  });

  it('allows legacy payload+signature path and enforces monotonic ts', async () => {
    systemSettingsRow = { value: '2000' };
    const legacyPayload = { cmd_type: 'ROTATE_OPERATIONS_KEY', new_ops_pubkey: 'QUFB', ts: 1999 }; // 'AAA' in base64
    await request(app)
      .post('/api/v1/admin/ops-key-rotation/broadcast')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({
        payload: legacyPayload,
        signature: 'sig',
      })
      .expect(409);
  });
});


