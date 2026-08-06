/**
 * Re-runnable backfill: correlate the last 90 days of activity_logs into access_sessions.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-access-sessions.ts
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-access-sessions.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-access-sessions.ts --days=30
 *
 * Prefer the Developer Tools → Database UI (DEV_ADMIN) for interactive runs.
 */

import { DatabaseService } from '../services/database.service';
import { AccessSessionBackfillService } from '../services/access/access-session-backfill.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const days = daysArg ? Number(daysArg.split('=')[1]) : undefined;

  const db = DatabaseService.getInstance();
  await db.initialize();

  const result = await AccessSessionBackfillService.getInstance().run({ days, dryRun });
  if (result.skippedBusy) {
    console.error('Backfill already running (advisory lock held). Try again later.');
    process.exit(1);
  }
  console.log(
    `Done. unlinked=${result.unlinkedActivityRows} created=${result.sessionsCreated} `
    + `updated=${result.sessionsUpdated} links=${result.activityLinks} `
    + `locksAttached=${result.locksAttached} locksSynthesized=${result.locksSynthesized} `
    + `skippedNoDevice=${result.skippedNoDevice} skippedErrors=${result.skippedErrors} `
    + `days=${result.days} dryRun=${result.dryRun}`,
  );
  process.exit(result.skippedErrors > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
