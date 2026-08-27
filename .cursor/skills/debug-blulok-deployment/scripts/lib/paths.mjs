import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL_DIR = path.resolve(SCRIPTS_DIR, '..');
export const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..');

export function backendNodeRequire(moduleId) {
  const req = createRequire(path.join(REPO_ROOT, 'backend', 'package.json'));
  return req(moduleId);
}
