import { createApp } from '@/app';
import { auditOpenApiCoverage } from '@/openapi/coverage-audit';

describe('OpenAPI coverage audit', () => {
  it('registers every Express API operation with complete metadata', () => {
    const report = auditOpenApiCoverage(createApp());

    expect(report.missingFromRegistry).toEqual([]);
    expect(report.pendingOnly).toEqual([]);
    expect(report.duplicateRegistryKeys).toEqual([]);
    expect(report.expressOperationCount).toBeGreaterThan(280);
    expect(report.completeRegistrationCount).toBeGreaterThanOrEqual(report.expressOperationCount);
  });
});
