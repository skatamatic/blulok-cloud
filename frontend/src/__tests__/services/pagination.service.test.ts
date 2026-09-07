/**
 * @jest-environment jsdom
 */
import { apiService } from '@/services/api.service';
import { paginationService, PaginationService } from '@/services/pagination.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: jest.fn(),
    getDevices: jest.fn(),
    getFacilities: jest.fn(),
    getUsers: jest.fn(),
  },
}));

const mockedApi = apiService as jest.Mocked<typeof apiService>;

describe('PaginationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paginationService.clearCache();
  });

  it('returns the same singleton from getInstance', () => {
    expect(PaginationService.getInstance()).toBe(paginationService);
  });

  it('computes page for a unit in the middle of the dataset', async () => {
    const units = Array.from({ length: 45 }, (_, i) => ({ id: `u-${i}` }));
    mockedApi.getUnits.mockResolvedValue({ units } as never);

    const info = await paginationService.getPageForItem(
      { id: 'u-25', type: 'unit' },
      20
    );

    expect(info).toEqual({
      page: 2,
      totalPages: 3,
      totalItems: 45,
      itemsPerPage: 20,
    });
    expect(mockedApi.getUnits).toHaveBeenCalledWith(
      expect.objectContaining({ offset: undefined, limit: undefined })
    );
  });

  it('returns page 1 when item is not found', async () => {
    mockedApi.getDevices.mockResolvedValue({ devices: [{ id: 'd-1' }] } as never);

    const info = await paginationService.getPageForItem(
      { id: 'missing', type: 'device' },
      20
    );

    expect(info.page).toBe(1);
    expect(info.totalItems).toBe(1);
    expect(info.totalPages).toBe(1);
  });

  it('fetches facilities and users for the corresponding types', async () => {
    mockedApi.getFacilities.mockResolvedValue({ facilities: [{ id: 'f-1' }] } as never);
    mockedApi.getUsers.mockResolvedValue({ users: [{ id: 'user-1' }] } as never);

    const f = await paginationService.getPageForItem({ id: 'f-1', type: 'facility' }, 10);
    const u = await paginationService.getPageForItem({ id: 'user-1', type: 'user' }, 10);

    expect(f.page).toBe(1);
    expect(u.page).toBe(1);
    expect(mockedApi.getFacilities).toHaveBeenCalled();
    expect(mockedApi.getUsers).toHaveBeenCalled();
  });

  it('reuses cached dataset within the cache window', async () => {
    mockedApi.getUsers.mockResolvedValue({
      users: Array.from({ length: 5 }, (_, i) => ({ id: `user-${i}` })),
    } as never);

    await paginationService.getPageForItem({ id: 'user-2', type: 'user' }, 2);
    await paginationService.getPageForItem({ id: 'user-4', type: 'user' }, 2);

    expect(mockedApi.getUsers).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache expires', async () => {
    let now = 1_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    mockedApi.getUnits.mockResolvedValue({ units: [{ id: 'a' }] } as never);

    await paginationService.getPageForItem({ id: 'a', type: 'unit' }, 20);
    now += 31_000;
    await paginationService.getPageForItem({ id: 'a', type: 'unit' }, 20);

    expect(mockedApi.getUnits).toHaveBeenCalledTimes(2);
    dateSpy.mockRestore();
  });

  it('clearCacheForType removes entries for that type only', async () => {
    mockedApi.getUnits.mockResolvedValue({ units: [{ id: 'u1' }] } as never);
    mockedApi.getFacilities.mockResolvedValue({ facilities: [{ id: 'f1' }] } as never);

    await paginationService.getPageForItem({ id: 'u1', type: 'unit' }, 20);
    await paginationService.getPageForItem({ id: 'f1', type: 'facility' }, 20);

    paginationService.clearCacheForType('unit');

    mockedApi.getUnits.mockClear();
    mockedApi.getFacilities.mockClear();

    await paginationService.getPageForItem({ id: 'u1', type: 'unit' }, 20);
    await paginationService.getPageForItem({ id: 'f1', type: 'facility' }, 20);

    expect(mockedApi.getUnits).toHaveBeenCalledTimes(1);
    expect(mockedApi.getFacilities).not.toHaveBeenCalled();
  });

});
