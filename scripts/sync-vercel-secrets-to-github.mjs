/**
 * One-shot: read Vercel token from Ozdesk vault, find/create "automore" project on Vercel,
 * set GitHub Actions secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID) via gh CLI.
 *
 * Usage (from repo root, authenticated: gh auth login):
 *   node scripts/sync-vercel-secrets-to-github.mjs
 *
 * Does not print secrets.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.GITHUB_REPO || 'fayaz1010/automore';

const vaultPath = path.join(process.env.USERPROFILE || '', '.ozdesk', 'vault', 'credentials.json');
if (!fs.existsSync(vaultPath)) {
  console.error('Vault not found:', vaultPath);
  process.exit(1);
}
const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
const token = vault.vercel?.token;
if (!typeof token === 'string' || !token.trim()) {
  console.error('vault.vercel.token missing');
  process.exit(1);
}

async function vercelFetch(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
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
  let project = list.projects?.find((p) => p.name === 'automore');

  if (!project) {
    console.log('Creating Vercel project "automore"...');
    let created;
    try {
      created = await vercelFetch('https://api.vercel.com/v10/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: 'automore',
          framework: 'nextjs',
          teamId: userId,
        }),
      });
    } catch (e) {
      created = await vercelFetch('https://api.vercel.com/v10/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: 'automore',
          framework: 'nextjs',
        }),
      });
    }
    project = created;
  }

  const projectId = project.id;
  const orgId = project.accountId || userId;

  console.log('Vercel project:', project.name, 'id:', projectId, 'accountId:', orgId);

  function ghSecretSet(name, value) {
    const r = spawnSync('gh', ['secret', 'set', name, '--repo', REPO], {
      input: value,
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      console.error(`gh secret set ${name} failed:`, r.stderr || r.stdout);
      process.exit(r.status ?? 1);
    }
    console.log('Set GitHub secret:', name);
  }

  const ghCheck = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (ghCheck.status !== 0) {
    console.error('gh not logged in. Run: gh auth login');
    process.exit(1);
  }

  ghSecretSet('VERCEL_TOKEN', token.trim());
  ghSecretSet('VERCEL_ORG_ID', String(orgId));
  ghSecretSet('VERCEL_PROJECT_ID', String(projectId));

  console.log('Done. Push to main will run .github/workflows/vercel-production.yml');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
