import { createApp } from '@/app';
import { auditOpenApiCoverage, formatCoverageReport } from '@/openapi/coverage-audit';

function main(): void {
  const report = auditOpenApiCoverage(createApp());
  console.log(formatCoverageReport(report));

  if (report.missingFromRegistry.length > 0) {
    console.error('\nOperations served by Express but not registered in OpenAPI:');
    for (const key of report.missingFromRegistry) {
      console.error(`  ${key}`);
    }
  }

  if (report.pendingOnly.length > 0) {
    console.error('\nOperations registered but not complete:');
    for (const key of report.pendingOnly) {
      console.error(`  ${key}`);
    }
  }

  if (report.duplicateRegistryKeys.length > 0) {
    console.error('\nDuplicate OpenAPI registry entries:');
    for (const key of report.duplicateRegistryKeys) {
      console.error(`  ${key}`);
    }
  }

  if (report.extraInRegistry.length > 0) {
    console.warn('\nRegistered OpenAPI paths not found on Express app (stale metadata):');
    for (const key of report.extraInRegistry.slice(0, 20)) {
      console.warn(`  ${key}`);
    }
    if (report.extraInRegistry.length > 20) {
      console.warn(`  ... and ${report.extraInRegistry.length - 20} more`);
    }
  }

  const failed =
    report.missingFromRegistry.length > 0 ||
    report.pendingOnly.length > 0 ||
    report.duplicateRegistryKeys.length > 0;

  if (failed) {
    process.exit(1);
  }

  console.log('\nAll Express API operations are registered with complete OpenAPI metadata.');
}

main();
