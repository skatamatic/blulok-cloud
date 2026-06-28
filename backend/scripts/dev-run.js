/**
 * Dev entrypoint (Windows-safe alternative to `-r ts-node/register` on the CLI).
 * Used by `npm run dev`; pair with `npm run dev:watch` for auto-restart on src changes.
 *
 * Ensures Ctrl+C / npm terminate reliably exits even when graceful shutdown stalls
 * (e.g. open gateway WebSocket sessions keeping the HTTP server alive).
 */
require('ts-node/register');
require('tsconfig-paths/register');

const FORCE_EXIT_MS = 8_000;
let shutdownPass = 0;
let forceExitTimer = null;

function scheduleForceExit(reason) {
  if (forceExitTimer) return;
  forceExitTimer = setTimeout(() => {
    console.error(`[dev-run] ${reason} — forcing exit`);
    process.exit(1);
  }, FORCE_EXIT_MS);
  forceExitTimer.unref?.();
}

function onDevSignal(signal) {
  shutdownPass += 1;
  if (shutdownPass === 1) {
    scheduleForceExit(`Shutdown still running after ${FORCE_EXIT_MS}ms (${signal})`);
    return;
  }
  console.error(`[dev-run] Received ${signal} again — forcing exit`);
  process.exit(1);
}

process.on('SIGINT', () => onDevSignal('SIGINT'));
process.on('SIGTERM', () => onDevSignal('SIGTERM'));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => onDevSignal('SIGBREAK'));
}

require('../src/index');
