/**
 * Hourly feed rollup: raw signals → per-post features, then prune old raw rows.
 *
 * Run from cron / a scheduled task:
 *   node dist/cli/feed-rollup.js            # last 2 hours (safe to re-run)
 *   node dist/cli/feed-rollup.js --hours 24 # backfill a wider window
 */

import 'dotenv/config';
import { pruneFeedEvents, runPostMetricsRollup } from '../modules/feed/serving/FeedEventService';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const hours = Number(argValue('hours') ?? 2);
  const retentionDays = Number(argValue('retentionDays') ?? 30);
  const since = new Date(Date.now() - (Number.isFinite(hours) ? hours : 2) * 60 * 60 * 1000);

  const rollup = await runPostMetricsRollup({ since });
  console.log('[feed-rollup]', { since: since.toISOString(), ...rollup });

  if (Number.isFinite(retentionDays) && retentionDays > 0) {
    const pruned = await pruneFeedEvents(retentionDays);
    console.log('[feed-rollup] pruned', pruned);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[feed-rollup] failed', error);
    process.exit(1);
  });
