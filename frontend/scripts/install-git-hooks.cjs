/** Install repo git hooks (pre-push guard against direct main pushes).
 *
 * Runs on `npm install` via the `postinstall` script. The Vercel build
 * uses frontend/ as its root, so this installer and the hook source live
 * under frontend/scripts/ (not the repo root) to survive that layout.
 * Locally it installs into the repo .git/hooks/.
 */
const { copyFileSync, existsSync, mkdirSync, chmodSync } = require('node:fs');
const { join } = require('node:path');

// frontend/scripts -> frontend -> repo root
const root = join(__dirname, "..", "..");
const src = join(__dirname, 'git-hooks', 'pre-push');
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
