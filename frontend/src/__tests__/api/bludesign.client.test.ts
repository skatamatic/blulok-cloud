import {
  getFacilities,
  getFacility,
  saveFacility,
  updateFacility,
  deleteFacility,
  getLastOpened,
  uploadLayoutSource,
  listAssetDefinitions,
  getAssetDefinition,
  createAssetDefinition,
  updateAssetDefinition,
  deleteAssetDefinition,
  uploadAssetModel,
  uploadAssetTexture,
  listMaterialPresets,
  createMaterialPreset,
  updateMaterialPreset,
  deleteMaterialPreset,
  getBluLokFacilities,
  getBluLokUnits,
  getBluLokDevices,
  getFacilityLinks,
  linkBluDesignToBluLok,
  unlinkBluDesign,
  getBluDesignFacilitiesWithLinks,
  getThemes,
  getTheme,
  createTheme,
  updateThemeApi,
  deleteThemeApi,
  getSkins,
  getSkin,
  createSkinApi,
  updateSkinApi,
  deleteSkinApi,
  getGDriveAuthUrl,
  exchangeGDriveCode,
  refreshGDriveTokens,
  testStorageProvider,
} from '@/api/bludesign';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const api = apiService as jest.Mocked<typeof apiService>;

describe('bludesign API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getFacilities maps dates on list response', async () => {
    api.get.mockResolvedValueOnce([
      {
        id: '1',
        name: 'F',
        lastOpened: '2020-01-01T00:00:00.000Z',
        createdAt: '2020-01-02T00:00:00.000Z',
        updatedAt: '2020-01-03T00:00:00.000Z',
      },
    ]);

    const rows = await getFacilities();

    expect(api.get).toHaveBeenCalledWith('/bludesign/facilities');
    expect(rows[0].lastOpened).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    expect(rows[0].createdAt).toEqual(new Date('2020-01-02T00:00:00.000Z'));
  });

  it('getFacility proxies GET', async () => {
    api.get.mockResolvedValueOnce({ id: 'x' });
    await getFacility('x');
    expect(api.get).toHaveBeenCalledWith('/bludesign/facilities/x');
  });

  it('saveFacility POSTs payload', async () => {
    api.post.mockResolvedValueOnce({ id: 'n' });
    await saveFacility('N', {} as never);
    expect(api.post).toHaveBeenCalledWith('/bludesign/facilities', { name: 'N', data: {}, thumbnail: undefined });
  });

  it('updateFacility PUTs', async () => {
    api.put.mockResolvedValueOnce(undefined);
    await updateFacility('id', {} as never);
    expect(api.put).toHaveBeenCalledWith('/bludesign/facilities/id', { data: {}, thumbnail: undefined });
  });

  it('deleteFacility DELETEs', async () => {
    api.delete.mockResolvedValueOnce(undefined);
    await deleteFacility('id');
    expect(api.delete).toHaveBeenCalledWith('/bludesign/facilities/id');
  });

  it('getLastOpened returns null on 404', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(getLastOpened()).resolves.toBeNull();
  });

  it('getLastOpened rethrows other errors', async () => {
    const err = new Error('x');
    api.get.mockRejectedValueOnce(err);
    await expect(getLastOpened()).rejects.toThrow('x');
  });

  it('asset definition CRUD uses correct paths', async () => {
    api.get.mockResolvedValue([]);
    await listAssetDefinitions();
    expect(api.get).toHaveBeenCalledWith('/bludesign/assets');

    api.get.mockResolvedValue({});
    await getAssetDefinition('a1');
    expect(api.get).toHaveBeenCalledWith('/bludesign/assets/a1');

    api.post.mockResolvedValue({});
    await createAssetDefinition({ name: 'n' } as never);
    expect(api.post).toHaveBeenCalledWith('/bludesign/assets', { name: 'n' });

    api.put.mockResolvedValue({});
    await updateAssetDefinition('a1', { name: 'n2' } as never);
    expect(api.put).toHaveBeenCalledWith('/bludesign/assets/a1', { name: 'n2' });

    api.delete.mockResolvedValue(undefined);
    await deleteAssetDefinition('a1');
    expect(api.delete).toHaveBeenCalledWith('/bludesign/assets/a1');
  });

  it('uploadAssetModel and uploadAssetTexture post FormData', async () => {
    api.post.mockResolvedValue({ url: 'u' });
    const file = new File(['x'], 'm.glb');
    await uploadAssetModel('aid', file);
    expect(api.post).toHaveBeenCalledWith(
      '/bludesign/assets/aid/model',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    await uploadAssetTexture('aid', 'mid', file);
    expect(api.post).toHaveBeenCalledWith(
      '/bludesign/assets/aid/materials/mid/texture',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });

  it('uploadLayoutSource puts FormData with size limits', async () => {
    api.put.mockResolvedValue({ success: true });
    const file = new File(['png'], 'layout-source.png', { type: 'image/png' });
    await uploadLayoutSource('fac-1', file);
    expect(api.put).toHaveBeenCalledWith(
      '/bludesign/facilities/fac-1/layout-source',
      expect.any(FormData),
      { maxBodyLength: Infinity, maxContentLength: Infinity }
    );
  });

  it('material preset CRUD', async () => {
    api.get.mockResolvedValue([]);
    await listMaterialPresets();
    expect(api.get).toHaveBeenCalledWith('/bludesign/material-presets');
    api.post.mockResolvedValue({});
    await createMaterialPreset({ name: 'p' } as never);
    api.put.mockResolvedValue({});
    await updateMaterialPreset('1', {} as never);
    api.delete.mockResolvedValue(undefined);
    await deleteMaterialPreset('1');
    expect(api.delete).toHaveBeenCalledWith('/bludesign/material-presets/1');
  });

  it('getBluLokFacilities normalizes array and wrapped response', async () => {
    api.get.mockResolvedValueOnce([{ id: '1', name: 'F' }]);
    await expect(getBluLokFacilities()).resolves.toEqual([
      { id: '1', name: 'F', address: undefined, city: undefined, state: undefined },
    ]);
    api.get.mockResolvedValueOnce({ facilities: [{ id: '2', name: 'G' }] });
    await expect(getBluLokFacilities()).resolves.toHaveLength(1);
    api.get.mockRejectedValueOnce(new Error('net'));
    await expect(getBluLokFacilities()).resolves.toEqual([]);
  });

  it('getBluLokUnits and getBluLokDevices map or return [] on error', async () => {
    api.get.mockResolvedValueOnce({ units: [{ id: 'u1', facility_id: 'f', unit_number: '1', unit_type: null, status: 'occupied' }] });
    const units = await getBluLokUnits('f');
    expect(units[0].id).toBe('u1');
    api.get.mockRejectedValueOnce(new Error('x'));
    await expect(getBluLokUnits('f')).resolves.toEqual([]);

    api.get.mockResolvedValueOnce({ devices: [{ id: 'd1', gateway_id: 'g', name: 'n', device_type: 'gate', status: 'online', is_locked: true }] });
    const devs = await getBluLokDevices('f');
    expect(devs[0].device_type).toBe('gate');
    api.get.mockRejectedValueOnce(new Error('x'));
    await expect(getBluLokDevices('f')).resolves.toEqual([]);
  });

  it('getFacilityLinks maps blulok facilities', async () => {
    api.get.mockResolvedValueOnce([{ id: 'b1', name: 'Blu' }]);
    api.get.mockResolvedValueOnce([]);
    const links = await getFacilityLinks();
    expect(links[0].blulokFacilityId).toBe('b1');
  });

  it('link and unlink call updateFacility with merged data', async () => {
    api.get.mockResolvedValue({
      id: 'bd1',
      data: { floors: [] },
      thumbnail: null,
      user_id: 'u',
      name: 'n',
      last_opened: null,
      created_at: '',
      updated_at: '',
    });
    api.put.mockResolvedValue(undefined);
    await linkBluDesignToBluLok('bd1', 'bl1', 'Blu Name');
    expect(api.put).toHaveBeenCalled();
    api.get.mockResolvedValue({
      id: 'bd1',
      data: { floors: [], dataSource: { type: 'blulok' as const, facilityId: 'x', facilityName: 'y', autoConnect: true, lastSync: new Date() } },
      thumbnail: null,
      user_id: 'u',
      name: 'n',
      last_opened: null,
      created_at: '',
      updated_at: '',
    });
    await unlinkBluDesign('bd1');
    expect(api.put).toHaveBeenCalled();
  });

  it('getBluDesignFacilitiesWithLinks aggregates', async () => {
    api.get
      .mockResolvedValueOnce([{ id: 'f1', name: 'N', lastOpened: null, createdAt: new Date(), updatedAt: new Date() }])
      .mockResolvedValueOnce({
        id: 'f1',
        name: 'N',
        data: { dataSource: { type: 'blulok', facilityId: 'bl', facilityName: 'Bn' } },
        thumbnail: null,
        user_id: 'u',
        last_opened: null,
        created_at: '',
        updated_at: '',
      });
    const rows = await getBluDesignFacilitiesWithLinks();
    expect(rows[0].linkedBlulokId).toBe('bl');
  });

  it('themes and skins CRUD map dates', async () => {
    api.get.mockResolvedValueOnce({
      themes: [{ id: 't1', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' }],
    });
    const themes = await getThemes();
    expect(themes[0].createdAt).toBeInstanceOf(Date);

    api.get.mockResolvedValueOnce({ theme: { id: 't1', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' } });
    await getTheme('t1');

    api.post.mockResolvedValueOnce({ theme: { id: 't2', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' } });
    await createTheme({ name: 'x' } as never);

    api.put.mockResolvedValueOnce({ theme: { id: 't1', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' } });
    await updateThemeApi('t1', { name: 'y' } as never);

    api.delete.mockResolvedValue(undefined);
    await deleteThemeApi('t1');

    api.get.mockResolvedValueOnce({ skins: [{ id: 's1', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' }] });
    await getSkins('cat');
    expect(api.get).toHaveBeenCalledWith('/bludesign/skins?category=cat');

    api.get.mockResolvedValueOnce({ skin: { id: 's1', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' } });
    await getSkin('s1');

    api.post.mockResolvedValueOnce({ skin: { id: 's2', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' } });
    await createSkinApi({ name: 'z' } as never);

    api.put.mockResolvedValueOnce({ skin: { id: 's1', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' } });
    await updateSkinApi('s1', {} as never);

    await deleteSkinApi('s1');
  });

  it('storage helpers call api', async () => {
    api.get.mockResolvedValueOnce({ authUrl: 'http://x' });
    await getGDriveAuthUrl('a', 'b', 'http://r');
    api.get.mockResolvedValueOnce({ tokens: {} });
    await exchangeGDriveCode('c', 'a', 'b');
    api.post.mockResolvedValueOnce({ tokens: {} });
    await refreshGDriveTokens('a', 'b', 'rt');
    api.post.mockResolvedValueOnce({ success: true, message: 'ok' });
    await testStorageProvider('local', { path: '/tmp' });
    expect(api.post).toHaveBeenCalledWith('/bludesign/storage/local/test', { storageConfig: { path: '/tmp' } });
  });
});
