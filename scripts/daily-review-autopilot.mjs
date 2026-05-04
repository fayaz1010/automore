/**
 * Daily one-shot: hero image (Wikimedia) + EEAT car review HTML → content/reviews/<folder>/article.html
 * No Cursor/MCP required — uses util-ai keys via the content-eeat-generator package (same as MCP).
 *
 * Prereqs:
 *   npm run build   (once) in content-eeat-generator
 *   Env: UTIL_AI_URL, UTIL_AI_TOKEN (same as MCP). Optional: EEAT_GENERATOR_ROOT
 *   Optional file d:\\AutoMore\\.env with KEY=value lines (not committed)
 *
 * Usage (from d:\\AutoMore):
 *   node scripts/daily-review-autopilot.mjs
 *   node scripts/daily-review-autopilot.mjs --dry-run
 *   node scripts/daily-review-autopilot.mjs --force   # regenerate even if article.html exists
 *
 * SERP strategy (optional): run `npm run serp-hunt` then `npm run serp-hunt:apply` to prepend
 * today's best opportunity to daily-queue.json (see content/queue/serp-strategy-latest.json).
 *
 * Schedule (100% autopilot):
 *   Windows Task Scheduler → daily → Program: node, Args: scripts/daily-review-autopilot.mjs,
 *   Start in: d:\\AutoMore, env vars UTIL_AI_URL / UTIL_AI_TOKEN
 *   Or GitHub Actions self-hosted runner on this machine with same paths.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'content', 'queue', 'daily-queue.json');
const LOG_PATH = path.join(ROOT, 'content', 'queue', 'daily-log.jsonl');
const REVIEWS = path.join(ROOT, 'content', 'reviews');
const SLUG_MAP_PATH = path.join(REVIEWS, 'slug-map.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

function loadDotEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function logLine(obj) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n', 'utf8');
}

function findHeroBasename(dir) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const p = path.join(dir, `hero.${ext}`);
    if (fs.existsSync(p)) return `hero.${ext}`;
  }
  return null;
}

function readImageMeta(dir) {
  const p = path.join(dir, 'image-meta.json');
  if (!fs.existsSync(p)) return { alt: '', licenseShort: '', filePage: '' };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      alt: j.alt || '',
      licenseShort: j.licenseShort || '',
      filePage: j.filePage || '',
    };
  } catch {
    return { alt: '', licenseShort: '', filePage: '' };
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function injectHero(html, heroBasename, meta) {
  if (!heroBasename) return html;
  const credit = meta.filePage
    ? `Photo: <a href="${meta.filePage}" rel="nofollow noopener">Wikimedia Commons</a>${meta.licenseShort ? ` (${meta.licenseShort})` : ''}.`
    : '';
  const block = `
<figure class="automore-hero" style="margin:0 0 1.25rem 0">
  <img src="${heroBasename}" alt="${escapeAttr(meta.alt || 'Vehicle')}" width="1200" height="675" loading="eager" decoding="async" style="width:100%;height:auto;display:block;border-radius:6px" />
  ${credit ? `<figcaption style="font-size:0.85rem;color:#444;margin-top:0.35rem">${credit}</figcaption>` : ''}
</figure>
`;
  const m = /<body[^>]*>/i.exec(html);
  if (m) {
    const i = m.index + m[0].length;
    return html.slice(0, i) + block + html.slice(i);
  }
  return block + html;
}

function mergeSlugMap(mcpSlug, folderSlug) {
  const raw = JSON.parse(fs.readFileSync(SLUG_MAP_PATH, 'utf8'));
  const comment = raw._comment;
  const map = { ...raw };
  delete map._comment;
  map[mcpSlug] = folderSlug;
  const out = comment !== undefined ? { _comment: comment, ...map } : map;
  fs.writeFileSync(SLUG_MAP_PATH, JSON.stringify(out, null, 2), 'utf8');
}

function pickNextItem(queue) {
  const today = todayUtc();
  const items = queue.items || [];
  return items.find((it) => {
    if (it.status !== 'pending') return false;
    if (!it.scheduledAfter) return true;
    return String(it.scheduledAfter) <= today;
  });
}

loadDotEnv();

const eeRoot = process.env.EEAT_GENERATOR_ROOT || 'D:/SaaSApps/mcp-servers/content-eeat-generator';
const eeModulePath = path.join(eeRoot, 'dist', 'engines', 'eeat-generator.js');
if (!fs.existsSync(eeModulePath)) {
  console.error('Missing', eeModulePath, '— run npm run build in content-eeat-generator, or set EEAT_GENERATOR_ROOT');
  process.exit(1);
}

if (!fs.existsSync(QUEUE_PATH)) {
  console.error('Missing queue file:', QUEUE_PATH);
  process.exit(1);
}

const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
const item = pickNextItem(queue);
if (!item) {
  console.log('No pending queue items (or none due today). Nothing to do.');
  process.exit(0);
}

const outDir = path.join(REVIEWS, item.folderSlug);
const articlePath = path.join(outDir, 'article.html');
if (fs.existsSync(articlePath) && !force) {
  console.log('article.html already exists for', item.folderSlug, '— use --force to regenerate');
  process.exit(0);
}

const defaults = queue.defaults || {};
const genInput = {
  topic: item.topic,
  targetKeyword: item.targetKeyword,
  industry: item.industry ?? defaults.industry,
  targetAudience: item.targetAudience ?? defaults.targetAudience,
  location: item.location ?? defaults.location,
  wordCount: item.wordCount ?? defaults.wordCount ?? 2200,
  tone: item.tone ?? defaults.tone ?? 'authoritative',
  articleType: 'review',
  companyName: item.companyName ?? defaults.companyName,
  companyCredentials: item.companyCredentials ?? defaults.companyCredentials,
  authorName: item.authorName ?? defaults.authorName,
  authorCredentials: item.authorCredentials ?? defaults.authorCredentials,
  topicSlug: item.topicSlug ?? defaults.topicSlug,
  tags: item.tags ?? defaults.tags,
  secondaryKeywords: item.secondaryKeywords ?? defaults.secondaryKeywords,
  urlPrefix: item.urlPrefix ?? defaults.urlPrefix ?? '/reviews/',
};

console.log('Selected queue item:', item.id, item.folderSlug);
if (dryRun) {
  console.log('[dry-run] Would generate + fetch hero + write article.html');
  process.exit(0);
}

if (!process.env.UTIL_AI_URL || !process.env.UTIL_AI_TOKEN) {
  console.error('Set UTIL_AI_URL and UTIL_AI_TOKEN (or add them to d:\\AutoMore\\.env)');
  process.exit(1);
}

const node = process.execPath;
const fetchScript = path.join(ROOT, 'scripts', 'fetch-car-hero-images.mjs');
const sq = item.searchQuery || item.targetKeyword.replace(/\s+review.*$/i, '').trim();
const alt = item.imageAlt || sq;

const fr = spawnSync(
  node,
  [
    fetchScript,
    `--slug=${item.folderSlug}`,
    `--searchQuery=${sq}`,
    `--imageAlt=${alt}`,
  ],
  { stdio: 'inherit', cwd: ROOT }
);
if (fr.status !== 0) {
  item.status = 'failed';
  item.lastError = 'fetch-car-hero-images exited ' + fr.status;
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  logLine({ id: item.id, folderSlug: item.folderSlug, error: item.lastError });
  process.exit(fr.status ?? 1);
}

const { generateEEATContent } = await import(pathToFileURL(eeModulePath).href);

let result;
try {
  result = await generateEEATContent(genInput);
} catch (e) {
  item.status = 'failed';
  item.lastError = e instanceof Error ? e.message : String(e);
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  logLine({ id: item.id, folderSlug: item.folderSlug, error: item.lastError });
  console.error(e);
  process.exit(1);
}

const mcpSlug = result.slug;
const hero = findHeroBasename(outDir);
const meta = readImageMeta(outDir);
const html = injectHero(result.content, hero, meta);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(articlePath, html, 'utf8');
fs.writeFileSync(
  path.join(outDir, 'article.saved.json'),
  JSON.stringify(
    {
      savedAt: new Date().toISOString(),
      source: 'daily-review-autopilot',
      mcpSlug,
      folderSlug: item.folderSlug,
      wordCount: result.wordCount,
    },
    null,
    2
  ),
  'utf8'
);

mergeSlugMap(mcpSlug, item.folderSlug);

item.status = 'done';
item.generatedAt = new Date().toISOString();
item.generatedSlug = mcpSlug;
delete item.lastError;
fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');

logLine({
  id: item.id,
  folderSlug: item.folderSlug,
  mcpSlug,
  wordCount: result.wordCount,
  ok: true,
});

console.log('Wrote', articlePath, 'words:', result.wordCount, 'slug:', mcpSlug);

/** Optional: commit + push so Vercel rebuilds with new HTML (set GIT_AUTO_PUSH=1, GITHUB_TOKEN, git remote). */
if (process.env.GIT_AUTO_PUSH === '1') {
  const name = process.env.GIT_AUTHOR_NAME || 'Automore Bot';
  const email = process.env.GIT_AUTHOR_EMAIL || 'hello@automore.com.au';
  spawnSync('git', ['config', 'user.name', name], { cwd: ROOT });
  spawnSync('git', ['config', 'user.email', email], { cwd: ROOT });
  spawnSync('git', ['add', 'content/reviews', 'content/queue/daily-queue.json', 'content/reviews/slug-map.json'], {
    cwd: ROOT,
  });
  const commit = spawnSync('git', ['commit', '-m', `content(review): ${item.folderSlug}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (commit.status !== 0 && !/nothing to commit|no changes added/i.test(commit.stdout + commit.stderr)) {
    console.warn('git commit:', commit.stderr || commit.stdout);
  }
  const push = spawnSync('git', ['push'], { cwd: ROOT, stdio: 'inherit' });
  if (push.status !== 0) {
    console.error('git push failed (check remote + GITHUB_TOKEN / credential helper)');
    logLine({ id: item.id, folderSlug: item.folderSlug, gitPush: 'failed' });
  } else {
    logLine({ id: item.id, folderSlug: item.folderSlug, gitPush: 'ok' });
  }
}
