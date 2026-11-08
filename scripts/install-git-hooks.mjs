/** Install repo git hooks (pre-push guard against direct main pushes).
 *
 * Runs on `npm install` via the `postinstall` script. The file lives at the
 * repo root (outside frontend/) so the frontend ESLint flat config never
 * lints it. On Vercel (frontend/ as build root, no .git) it exits silently.
 * Locally it installs into the repo .git/hooks/.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(dirname(fileURLToPath(import.meta.url)), 'git-hooks', 'pre-push');
const destDir = join(root, '.git', 'hooks');
const dest = join(destDir, 'pre-push');

try {
  if (!existsSync(join(root, '.git'))) process.exit(0);
  if (!existsSync(src)) {
    console.error('[install-git-hooks] missing source hook:', src);
    process.exit(0);
  }
  mkdirSync(destDir, { recursive: true });
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
