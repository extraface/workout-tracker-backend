'use strict';
/**
 * Syntax-checks every JavaScript file that ships:
 *  - the <script> blocks inside index.html (the app)
 *  - the backend files Railway runs
 * Fails fast so a typo can never reach GitHub Pages or crash Railway.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const BACKEND_FILES = ['server.js', 'summary.js', 'mcp.js', 'coros-mcp.js'];
let failed = false;

function check(label, file) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed = true;
    console.error(`  ✗ ${label}\n${String(err.stderr || err.message)}`);
  }
}

console.log('Syntax check');

// App: pull the inline scripts out of index.html
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length === 0) {
  console.error('  ✗ index.html: no inline <script> found');
  failed = true;
} else {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-')), 'app.js');
  fs.writeFileSync(tmp, scripts.join('\n'));
  check('index.html (app script)', tmp);
}

for (const f of BACKEND_FILES) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) check(f, p);
}

if (failed) process.exit(1);
