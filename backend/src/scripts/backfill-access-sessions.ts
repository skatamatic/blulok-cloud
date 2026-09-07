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

  // CLI runs without a wall-clock budget but still resumes across row-cap chunks.
  let cursor: { afterOccurredAt: string; afterId: string } | null = null;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalLinks = 0;
  let totalLocksAttached = 0;
  let totalLocksSynthesized = 0;
  let totalSkippedNoDevice = 0;
  let totalSkippedErrors = 0;
  let lastUnlinked = 0;
  let chunk = 0;

  for (;;) {
    chunk += 1;
    const result = await AccessSessionBackfillService.getInstance().run({
      days,
      dryRun,
      cursor,
    });
    if (result.skippedBusy) {
      console.error('Backfill already running (advisory lock held). Try again later.');
      process.exit(1);
    }
    lastUnlinked = result.unlinkedActivityRows;
    totalCreated += result.sessionsCreated;
    totalUpdated += result.sessionsUpdated;
    totalLinks += result.activityLinks;
    totalLocksAttached += result.locksAttached;
    totalLocksSynthesized += result.locksSynthesized;
    totalSkippedNoDevice += result.skippedNoDevice;
    totalSkippedErrors += result.skippedErrors;
    console.log(
      `Chunk ${chunk}: unlinked=${result.unlinkedActivityRows} created=${result.sessionsCreated} `
      + `updated=${result.sessionsUpdated} links=${result.activityLinks} done=${result.done}`,
    );
    if (result.done) break;
    if (!result.cursor) {
      console.error('Backfill returned done=false without a cursor; stopping to avoid a loop.');
      process.exit(1);
    }
    cursor = result.cursor;
  }

  console.log(
    `Done. lastChunkUnlinked=${lastUnlinked} created=${totalCreated} `
    + `updated=${totalUpdated} links=${totalLinks} `
    + `locksAttached=${totalLocksAttached} locksSynthesized=${totalLocksSynthesized} `
    + `skippedNoDevice=${totalSkippedNoDevice} skippedErrors=${totalSkippedErrors} `
    + `days=${days ?? 'default'} dryRun=${dryRun} chunks=${chunk}`,
  );
  process.exit(totalSkippedErrors > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
