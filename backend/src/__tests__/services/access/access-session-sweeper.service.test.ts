import { AccessSessionSweeperService } from '@/services/access/access-session-sweeper.service';
import { AccessSessionService } from '@/services/access/access-session.service';

jest.mock('@/services/access/access-session.service', () => ({
  AccessSessionService: {
    getInstance: jest.fn(),
  },
}));

describe('AccessSessionSweeperService', () => {
  afterEach(() => {
    AccessSessionSweeperService.resetForTests();
    jest.clearAllMocks();
  });

  it('calls expirePendingSessions and returns count', async () => {
    const expirePendingSessions = jest.fn().mockResolvedValue([
      { id: 's1' },
      { id: 's2' },
    ]);
    (AccessSessionService.getInstance as jest.Mock).mockReturnValue({
      expirePendingSessions,
    });

    const sweeper = AccessSessionSweeperService.getInstance();
    const count = await sweeper.sweep();
    expect(count).toBe(2);
    expect(expirePendingSessions).toHaveBeenCalled();
  });

  it('start/stop manages interval without throwing', () => {
    const expirePendingSessions = jest.fn().mockResolvedValue([]);
    (AccessSessionService.getInstance as jest.Mock).mockReturnValue({
      expirePendingSessions,
    });
    const sweeper = AccessSessionSweeperService.getInstance();
    sweeper.start(60_000);
    sweeper.stop();
  });
});
