/**
 * Tier-1 workflow helper (images on disk, then remind / run article save).
 *
 * 1) Fetches Wikimedia hero images for every row in tier-1-manifest.json
 * 2) Runs save-review-from-mcp-json against Cursor agent-tools (MCP JSON dumps)
 *
 * Usage:
 *   node scripts/tier1-images-then-save-articles.mjs
 *   node scripts/tier1-images-then-save-articles.mjs --skip-images
 *   node scripts/tier1-images-then-save-articles.mjs --skip-save
 * Env: AGENT_TOOLS_DIR if your Cursor project path is not ~/.cursor/projects/d-AutoMore/agent-tools
 */
import { spawnSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const skipImages = process.argv.includes('--skip-images');
const skipSave = process.argv.includes('--skip-save');

if (!skipImages) {
  const r = spawnSync(node, [path.join(__dirname, 'fetch-car-hero-images.mjs')], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!skipSave) {
  const args = [path.join(__dirname, 'save-review-from-mcp-json.mjs'), '--recover-agent-tools'];
  if (process.argv.includes('--force')) args.push('--force');
  const r2 = spawnSync(node, args, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  if (r2.status !== 0) process.exit(r2.status ?? 1);
}
