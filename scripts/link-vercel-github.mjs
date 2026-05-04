/**
 * Connect the Vercel project "automore" to the GitHub repo (Git provider integration),
 * so the Vercel dashboard shows the repo and push-triggered builds can run there too.
 *
 * Prerequisites:
 *   - Vercel GitHub App installed for the org/user that owns the repo:
 *     https://github.com/apps/vercel
 *   - vault.vercel.token in ~/.ozdesk/vault/credentials.json (same as sync-vercel-secrets)
 *
 * Usage (repo root):
 *   node scripts/link-vercel-github.mjs
 *
 * Uses the official CLI: `vercel git connect <url> --token …` after writing `.vercel/project.json`
 * (directory is gitignored). Does not print the token.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const REPO = process.env.GITHUB_REPO || 'fayaz1010/automore';
const GIT_URL = process.env.GIT_REMOTE_URL || `https://github.com/${REPO}.git`;

const vaultPath = path.join(process.env.USERPROFILE || '', '.ozdesk', 'vault', 'credentials.json');
if (!fs.existsSync(vaultPath)) {
  console.error('Vault not found:', vaultPath);
  process.exit(1);
}
const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
const token = vault.vercel?.token;
if (typeof token !== 'string' || !token.trim()) {
  console.error('vault.vercel.token missing');
  process.exit(1);
}

async function vercelFetch(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!r.ok) {
    throw new Error(`Vercel API ${r.status} ${url}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const user = await vercelFetch('https://api.vercel.com/v2/user');
  const userId = user.user?.id;
  if (!userId) throw new Error('Could not read Vercel user from /v2/user');

  let list;
  try {
    list = await vercelFetch(`https://api.vercel.com/v9/projects?teamId=${encodeURIComponent(userId)}&limit=100`);
  } catch {
    list = await vercelFetch('https://api.vercel.com/v9/projects?limit=100');
  }
  const project = list.projects?.find((p) => p.name === 'automore');
  if (!project) {
    console.error('No Vercel project named "automore". Run: npm run sync-vercel-secrets');
    process.exit(1);
  }

  const projectId = project.id;
  const orgId = project.accountId || userId;

  const vercelDir = path.join(REPO_ROOT, '.vercel');
  fs.mkdirSync(vercelDir, { recursive: true });
  const projectJson = path.join(vercelDir, 'project.json');
  fs.writeFileSync(projectJson, JSON.stringify({ projectId, orgId }, null, 2), 'utf8');
  console.log('Wrote', projectJson, '(gitignored)');

  console.log('Running: vercel git connect', GIT_URL);
  // Windows: spawn without shell often fails to resolve npx; VERCEL_TOKEN avoids --token in argv.
  const r = spawnSync('npx', ['vercel', 'git', 'connect', GIT_URL, '--yes'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      VERCEL_TOKEN: token.trim(),
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(out);
  const already = /already connected/i.test(out);
  if (r.status !== 0 && !already) {
    console.error('vercel git connect exited with', r.status);
    console.error('If the error mentions GitHub access, install https://github.com/apps/vercel for that account.');
    process.exit(r.status ?? 1);
  }
  if (already) {
    console.log('Repository was already linked (success).');
  }
  console.log('Done. Check Vercel → automore → Settings → Git.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
