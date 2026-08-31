import { GatewayTelemetryLogModel, GATEWAY_TELEMETRY_LOG_RETENTION } from '@/models/gateway-telemetry-log.model';

function createKnexMock(options: { total: number; oldestIds: string[] }) {
  const delMock = jest.fn().mockResolvedValue(options.oldestIds.length);

  const chain: Record<string, jest.Mock> = {};
  chain.where = jest.fn().mockReturnValue(chain);
  chain.count = jest.fn().mockReturnValue({
    first: jest.fn().mockResolvedValue({ count: options.total }),
  });
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(options.oldestIds.map((id) => ({ id }))),
  });
  chain.whereIn = jest.fn().mockReturnValue({ del: delMock });
  chain.insert = jest.fn();

  const knex = jest.fn().mockReturnValue(chain);
  return { knex, delMock };
}

describe('GatewayTelemetryLogModel.trimToRetention', () => {
  it('deletes excess rows beyond retention cap', async () => {
    const excess = 3;
    const total = GATEWAY_TELEMETRY_LOG_RETENTION + excess;
    const { knex, delMock } = createKnexMock({ total, oldestIds: ['old-1', 'old-2', 'old-3'] });

    const model = new GatewayTelemetryLogModel();
    Object.defineProperty(model, 'db', {
      get: () => ({ connection: knex }),
    });

    const deleted = await model.trimToRetention('gw-1');
    expect(deleted).toBe(excess);
    expect(delMock).toHaveBeenCalled();
  });

  it('skips delete when at or under retention cap', async () => {
    const { knex, delMock } = createKnexMock({ total: GATEWAY_TELEMETRY_LOG_RETENTION, oldestIds: [] });

    const model = new GatewayTelemetryLogModel();
    Object.defineProperty(model, 'db', {
      get: () => ({ connection: knex }),
    });

    const deleted = await model.trimToRetention('gw-1');
    expect(deleted).toBe(0);
    expect(delMock).not.toHaveBeenCalled();
  });
});
