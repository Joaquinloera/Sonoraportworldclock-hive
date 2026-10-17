/** Scheduled invocation wrapper for existing bounded KINO fleet.
 * Invoke from a trusted cron/CI runtime. Does not process financial transactions.
 */
export async function runScheduledCycle(options) {
  if (!options || !options.queue || !options.roster || !options.manifest) throw Error('CONFIG_REQUIRED');
  const { workerCount = 4, maxClaims = 18, ...rest } = options;
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 8) throw Error('INVALID_WORKERS');
  if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > 144) throw Error('INVALID_CLAIMS');
  const { runBoundedResearchFleet } = await import('./research-fleet-supervisor.mjs');
  return runBoundedResearchFleet({ ...rest, workerCount, maxClaims });
}
