import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectForbidden, expectUnauthorized } from '@/__tests__/utils/mock-test-helpers';

const TEST_UPLOAD_ID = '11111111-1111-4111-8111-111111111111';
const TEST_FILE_ID = '22222222-2222-4222-8222-222222222222';

jest.mock('@/services/provisioning/facility-provisioning.service', () => {
  const actual = jest.requireActual('@/services/provisioning/facility-provisioning.service');
  return {
    ...actual,
    FacilityProvisioningService: {
      listFiles: jest.fn().mockResolvedValue({
        files: [{
          id: '22222222-2222-4222-8222-222222222222',
          facility_id: 'facility-1',
          filename: 'config.bin',
          content_type: 'application/octet-stream',
          size_bytes: 1024,
          sha256_hash: 'a'.repeat(64),
          upload_source: 'dashboard',
          created_by: null,
          uploaded_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        }],
        total: 1,
      }),
      getFile: jest.fn().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        facility_id: 'facility-1',
        filename: 'config.bin',
      }),
      deleteFile: jest.fn().mockResolvedValue(true),
      prepareUpload: jest.fn().mockResolvedValue({
        upload_id: '11111111-1111-4111-8111-111111111111',
        upload_url: 'http://localhost/upload',
        upload_headers: {},
        expires_in_seconds: 3600,
        facility_id: 'facility-1',
      }),
      completeUpload: jest.fn().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        facility_id: 'facility-1',
        filename: 'config.bin',
      }),
      streamDownload: jest.fn().mockResolvedValue({
        buffer: Buffer.from('test'),
        filename: 'config.bin',
        content_type: 'application/octet-stream',
        size_bytes: 4,
      }),
    },
  };
});
describe('Facility Provisioning Routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: ReturnType<typeof createMockTestData>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
  });

  it('requires auth for file list', async () => {
    const res = await request(app).get('/api/v1/facilities/facility-1/provisioning-data');
    expectUnauthorized(res);
  });

  it('allows facility admin to list files', async () => {
    const res = await request(app)
      .get('/api/v1/facilities/facility-1/provisioning-data')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.files).toHaveLength(1);
  });

  it('denies facility admin access to other facility', async () => {
    const res = await request(app)
      .get('/api/v1/facilities/facility-2/provisioning-data')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

    expectForbidden(res);
  });

  it('denies facility admin delete (platform admin only)', async () => {
    const res = await request(app)
      .delete('/api/v1/facilities/facility-1/provisioning-data/file-1')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

    expectForbidden(res);
  });

  it('allows admin to delete file', async () => {
    const res = await request(app)
      .delete('/api/v1/facilities/facility-1/provisioning-data/file-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBe(true);
  });

  it('allows facility admin to prepare upload', async () => {
    const res = await request(app)
      .post('/api/v1/facilities/facility-1/provisioning-data/prepare')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ filename: 'data.bin', size_bytes: 1024 })
      .expect(200);

    expect(res.body.data.upload_id).toBe(TEST_UPLOAD_ID);
  });

  it('allows facility admin to complete upload', async () => {
    const res = await request(app)
      .post('/api/v1/facilities/facility-1/provisioning-data/complete')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ upload_id: TEST_UPLOAD_ID, filename: 'data.bin', size_bytes: 1024 })
      .expect(200);

    expect(res.body.data.file.id).toBe(TEST_FILE_ID);
  });

  it('streams download for facility admin', async () => {
    const res = await request(app)
      .get(`/api/v1/facilities/facility-1/provisioning-data/${TEST_FILE_ID}/download`)
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(Buffer.from(res.body).toString()).toBe('test');
  });
});