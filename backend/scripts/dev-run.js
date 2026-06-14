/**
 * Dev entrypoint (Windows-safe alternative to `-r ts-node/register` on the CLI).
 * Used by `npm run dev`; pair with `npm run dev:watch` for auto-restart on src changes.
 */
require('ts-node/register');
require('tsconfig-paths/register');
require('../src/index');
