'use strict';
/**
 * Fails if index.html changed but its version number did not.
 * Compares against BASE_REF (default: origin/main). In CI, BASE_REF is the
 * commit before the push. If the base can't be read, the check is skipped.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION_RE = /v(\d+\.\d+(?:\.\d+)*)<\/span><\/h1>/;
const base = process.env.BASE_REF || 'origin/main';
const root = path.join(__dirname, '..');

const current = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const currentVersion = (current.match(VERSION_RE) || [])[1];

console.log('Version check');
if (!currentVersion) {
  console.error('  ✗ Could not find the version number in the index.html header');
  process.exit(1);
}

let previous;
try {
  previous = execFileSync('git', ['show', `${base}:index.html`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
} catch {
  console.log(`  - skipped (can't read index.html at ${base}); current is v${currentVersion}`);
  process.exit(0);
}

if (previous === current) {
  console.log(`  ✓ index.html unchanged (v${currentVersion})`);
  process.exit(0);
}

const previousVersion = (previous.match(VERSION_RE) || [])[1];
if (previousVersion === currentVersion) {
  console.error(`  ✗ index.html changed but the version is still v${currentVersion}. Bump it.`);
  process.exit(1);
}
console.log(`  ✓ v${previousVersion} → v${currentVersion}`);
