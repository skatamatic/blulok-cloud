/**
 * InviteService — create/find/consume invite tokens.
 */
const mockInsert = jest.fn().mockResolvedValue(1);
const mockUpdate = jest.fn().mockResolvedValue(1);
const mockFirst = jest.fn();
const mockLimit = jest.fn();

const tableApi = {
  insert: (...args: unknown[]) => mockInsert(...args),
  where: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: (...args: unknown[]) => mockLimit(...args),
  first: (...args: unknown[]) => mockFirst(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
};

// Make chained where return same api
tableApi.where.mockImplementation(() => tableApi);
tableApi.whereNull.mockImplementation(() => tableApi);
tableApi.andWhere.mockImplementation(() => tableApi);
tableApi.orderBy.mockImplementation(() => tableApi);

const mockDb: any = jest.fn(() => tableApi);
mockDb.raw = jest.fn((sql: string, bindings?: unknown[]) => ({ sql, bindings }));
mockDb.fn = { now: jest.fn(() => 'NOW()') };

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: mockDb })),
  },
}));

import { InviteService } from '@/services/invite.service';
import bcrypt from 'bcrypt';

describe('InviteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (InviteService as unknown as { instance?: InviteService }).instance = undefined;
    tableApi.where.mockImplementation(() => tableApi);
    tableApi.whereNull.mockImplementation(() => tableApi);
    tableApi.andWhere.mockImplementation(() => tableApi);
    tableApi.orderBy.mockImplementation(() => tableApi);
    mockInsert.mockResolvedValue(1);
    mockUpdate.mockResolvedValue(1);
    mockFirst.mockResolvedValue({ id: 'inv-1' });
    mockLimit.mockResolvedValue([]);
  });

  it('createInvite returns plaintext token and invite id', async () => {
    const svc = InviteService.getInstance();
    const result = await svc.createInvite('user-1', { via: 'email' });

    expect(mockInsert).toHaveBeenCalled();
    expect(result.token.length).toBeGreaterThan(10);
    expect(result.inviteId).toBe('inv-1');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('findActiveInviteByToken returns matching invite with parsed metadata', async () => {
    const token = 'invite-plain';
    mockLimit.mockResolvedValue([
      {
        id: 'inv-2',
        user_id: 'user-2',
        token_hash: 'hash-value',
        expires_at: new Date(Date.now() + 3600_000),
        last_sent_at: new Date(),
        metadata: '{"ok":true}',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const svc = InviteService.getInstance();
    const found = await svc.findActiveInviteByToken(token);
    expect(found?.id).toBe('inv-2');
    expect(found?.metadata).toEqual({ ok: true });
    (bcrypt.compare as jest.Mock).mockRestore();
  });

  it('findActiveInviteByToken returns null when hashes do not match', async () => {
    mockLimit.mockResolvedValue([
      {
        id: 'inv-3',
        user_id: 'user-3',
        token_hash: 'hash-value',
        expires_at: new Date(Date.now() + 3600_000),
        last_sent_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    const svc = InviteService.getInstance();
    await expect(svc.findActiveInviteByToken('nope')).resolves.toBeNull();
    (bcrypt.compare as jest.Mock).mockRestore();
  });

  it('consumeInvite and touchLastSent update timestamps', async () => {
    const svc = InviteService.getInstance();
    await svc.consumeInvite('inv-9');
    await svc.touchLastSent('inv-9');
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('invalidateInvites marks active invites consumed', async () => {
    const svc = InviteService.getInstance();
    await svc.invalidateInvites('user-1');
    expect(mockUpdate).toHaveBeenCalled();
  });
});
