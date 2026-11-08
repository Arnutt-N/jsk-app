/** Install repo git hooks (pre-push guard against direct main pushes).
 *
 * Runs on `npm install` via the `postinstall` script. Copies versioned
 * hooks from scripts/git-hooks/ into .git/hooks/ (git does not sync
 * .git/hooks on clone, so without this the guard only exists on machines
 * that ran it once). Skips silently outside a git checkout.
 */
const { copyFileSync, existsSync, mkdirSync, chmodSync } = require('node:fs');
const { join, dirname } = require('node:path');

const root = join(dirname(__filename), '..');
const src = join(root, 'scripts', 'git-hooks', 'pre-push');
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
