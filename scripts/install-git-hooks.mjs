/** Install repo git hooks (pre-push guard against direct main pushes).
 *
 * Runs on `npm install` via the `postinstall` script. The file lives at the
 * repo root (outside frontend/) so the frontend ESLint flat config never
 * lints it. On Vercel (frontend/ as build root, no .git) it exits silently.
 * Locally it installs into the repo .git/hooks/.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(dirname(fileURLToPath(import.meta.url)), 'git-hooks', 'pre-push');
const destDir = join(root, '.git', 'hooks');
const dest = join(destDir, 'pre-push');

try {
  if (!existsSync(join(root, '.git'))) process.exit(0);
  if (!existsSync(src)) {
    // .git exists but the hook source does not: the guard is missing for
    // real, so fail loud instead of pretending it installed.
    console.error('[install-git-hooks] missing source hook:', src);
    process.exit(1);
  }
  mkdirSync(destDir, { recursive: true });
  if (existsSync(dest) && readFileSync(dest, 'utf8') !== readFileSync(src, 'utf8')) {
    // A dev customized their hook: back it up instead of silently clobbering.
    const backup = `${dest}.local-backup`;
    copyFileSync(dest, backup);
    console.error(`[install-git-hooks] existing hook backed up to ${backup}, installing guard`);
  }
  copyFileSync(src, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // Windows: chmod is a no-op, hook still runs via sh.
  }
  console.log('[install-git-hooks] installed pre-push guard');
} catch (err) {
  console.error('[install-git-hooks] skipped:', err.message);
}
