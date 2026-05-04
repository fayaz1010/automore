/**
 * Batch-regenerate all tier-1 reviews + pending daily-queue review rows.
 * Writes canonical article.html, injects Wikimedia hero, updates slug-map, removes legacy *.html in each folder.
 *
 * Prereqs: npm run build in EEAT_GENERATOR_ROOT; UTIL_AI_URL + UTIL_AI_TOKEN (or .env in repo root).
 *
 *   node scripts/regenerate-all-reviews.mjs --dry-run
 *   node scripts/regenerate-all-reviews.mjs --limit=1
 *   node scripts/regenerate-all-reviews.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REVIEWS = path.join(ROOT, 'content', 'reviews');
const QUEUE_PATH = path.join(ROOT, 'content', 'queue', 'daily-queue.json');
const TIER1 = path.join(REVIEWS, 'tier-1-manifest.json');
const SLUG_MAP_PATH = path.join(REVIEWS, 'slug-map.json');
const BATCH_LOG = path.join(ROOT, 'content', 'queue', 'regenerate-batch.jsonl');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const failFast = args.includes('--fail-fast');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(0, parseInt(limitArg.split('=')[1], 10) || 0) : 0;

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function logBatch(obj) {
  fs.mkdirSync(path.dirname(BATCH_LOG), { recursive: true });
  fs.appendFileSync(BATCH_LOG, JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n', 'utf8');
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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

function keywordFromTier1(entry) {
  let base = (entry.searchQuery || '').trim();
  base = base.replace(/\s+car$/i, '').replace(/\s+sedan$/i, '').trim();
  if (!base) return entry.slug.replace(/-/g, ' ');
  const lower = base.toLowerCase();
  if (lower.includes('review') && lower.includes('australia')) return base;
  return `${base} review Australia`;
}

function topicFromTier1(entry) {
  const q = (entry.searchQuery || '').trim() || entry.slug.replace(/-/g, ' ');
  return (
    `Australian car review: ${q}. ` +
    `Synthesise ANCAP, ACCC recalls, manufacturer specs, and Australian automotive media and owner communities only. ` +
    `Third-person editorial voice. No invented Automore instrumented road tests, no unverifiable "we measured" fuel or performance numbers, ` +
    `no fabricated interview quotes. Every statistic must name its source in prose or the Sources section. ` +
    `If a fact cannot be verified from the research pass, omit it rather than guess.`
  );
}

function buildJobs() {
  const byFolder = new Map();

  if (fs.existsSync(TIER1)) {
    const tier = JSON.parse(fs.readFileSync(TIER1, 'utf8'));
    for (const row of tier) {
      if (!row.slug) continue;
      byFolder.set(row.slug, {
        folderSlug: row.slug,
        searchQuery: row.searchQuery || row.slug.replace(/-/g, ' '),
        imageAlt: row.imageAlt || row.searchQuery || 'Vehicle',
        targetKeyword: keywordFromTier1(row),
        topic: topicFromTier1(row),
        source: 'tier-1-manifest',
      });
    }
  }

  if (fs.existsSync(QUEUE_PATH)) {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const defaults = queue.defaults || {};
    for (const it of queue.items || []) {
      if (!it.folderSlug) continue;
      byFolder.set(it.folderSlug, {
        folderSlug: it.folderSlug,
        searchQuery: it.searchQuery || it.folderSlug.replace(/-/g, ' '),
        imageAlt: it.imageAlt || it.searchQuery || 'Vehicle',
        targetKeyword: it.targetKeyword || keywordFromTier1({ slug: it.folderSlug, searchQuery: it.searchQuery }),
        topic:
          it.topic ||
          topicFromTier1({ slug: it.folderSlug, searchQuery: it.searchQuery || it.folderSlug.replace(/-/g, ' ') }),
        source: 'daily-queue',
        queueId: it.id,
      });
    }
  }

  return [...byFolder.values()];
}

function removeLegacyHtml(dir, keepName = 'article.html') {
  for (const name of fs.readdirSync(dir)) {
    if (!/\.html$/i.test(name) || name === keepName) continue;
    fs.unlinkSync(path.join(dir, name));
  }
}

loadDotEnv();

const eeRoot = process.env.EEAT_GENERATOR_ROOT || 'D:/SaaSApps/mcp-servers/content-eeat-generator';
const eeModulePath = path.join(eeRoot, 'dist', 'engines', 'eeat-generator.js');
if (!fs.existsSync(eeModulePath)) {
  console.error('Missing', eeModulePath, '— run: cd', eeRoot, '&& npm run build');
  process.exit(1);
}

let jobs = buildJobs();
if (LIMIT > 0) jobs = jobs.slice(0, LIMIT);

console.log('Jobs:', jobs.length, dryRun ? '(dry-run)' : '');
for (const j of jobs) {
  console.log(' -', j.folderSlug, '|', j.targetKeyword);
}

if (dryRun) {
  process.exit(0);
}

if (!process.env.UTIL_AI_URL || !process.env.UTIL_AI_TOKEN) {
  console.error('Set UTIL_AI_URL and UTIL_AI_TOKEN (or add to .env at repo root).');
  process.exit(1);
}

const queue = fs.existsSync(QUEUE_PATH) ? JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')) : { items: [] };
const defaults = queue.defaults || {};

const { generateEEATContent } = await import(pathToFileURL(eeModulePath).href);
const node = process.execPath;
const fetchScript = path.join(ROOT, 'scripts', 'fetch-car-hero-images.mjs');

let ok = 0;
let failed = 0;

for (const job of jobs) {
  const outDir = path.join(REVIEWS, job.folderSlug);
  fs.mkdirSync(outDir, { recursive: true });

  const sq = job.searchQuery || job.targetKeyword.replace(/\s+review.*$/i, '').trim();
  const alt = job.imageAlt || sq;

  console.log('\n===', job.folderSlug, '===');
  const fr = spawnSync(
    node,
    [fetchScript, `--slug=${job.folderSlug}`, `--searchQuery=${sq}`, `--imageAlt=${alt}`],
    { stdio: 'inherit', cwd: ROOT }
  );
  if (fr.status !== 0) {
    failed++;
    logBatch({ folderSlug: job.folderSlug, step: 'hero', error: 'fetch exit ' + fr.status });
    console.error('Hero fetch failed for', job.folderSlug);
    if (failFast) process.exit(fr.status ?? 1);
    continue;
  }

  const genInput = {
    topic: job.topic,
    targetKeyword: job.targetKeyword,
    industry: defaults.industry,
    targetAudience: defaults.targetAudience,
    location: defaults.location,
    wordCount: defaults.wordCount ?? 2200,
    tone: defaults.tone ?? 'authoritative',
    articleType: 'review',
    companyName: defaults.companyName,
    companyCredentials: defaults.companyCredentials,
    authorName: defaults.authorName,
    authorCredentials: defaults.authorCredentials,
    topicSlug: defaults.topicSlug,
    tags: defaults.tags,
    secondaryKeywords: defaults.secondaryKeywords,
    urlPrefix: defaults.urlPrefix ?? '/reviews/',
  };

  let result;
  try {
    result = await generateEEATContent(genInput);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    logBatch({ folderSlug: job.folderSlug, step: 'generate', error: msg });
    console.error(e);
    if (failFast) process.exit(1);
    continue;
  }

  const mcpSlug = result.slug;
  const hero = findHeroBasename(outDir);
  const meta = readImageMeta(outDir);
  const html = injectHero(result.content, hero, meta);

  fs.writeFileSync(path.join(outDir, 'article.html'), html, 'utf8');
  removeLegacyHtml(outDir, 'article.html');

  fs.writeFileSync(
    path.join(outDir, 'article.saved.json'),
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        source: 'regenerate-all-reviews',
        mcpSlug,
        folderSlug: job.folderSlug,
        wordCount: result.wordCount,
        batchJob: job.source,
      },
      null,
      2
    ),
    'utf8'
  );

  mergeSlugMap(mcpSlug, job.folderSlug);

  if (job.queueId) {
    const item = (queue.items || []).find((x) => x.id === job.queueId);
    if (item) {
      item.status = 'done';
      item.generatedAt = new Date().toISOString();
      item.generatedSlug = mcpSlug;
      delete item.lastError;
    }
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  }

  ok++;
  logBatch({ folderSlug: job.folderSlug, mcpSlug, wordCount: result.wordCount, ok: true });
  console.log('OK', job.folderSlug, 'words:', result.wordCount, 'slug:', mcpSlug);

  await new Promise((r) => setTimeout(r, 2500));
}

console.log('\nDone. ok:', ok, 'failed:', failed);
process.exit(failed > 0 && failFast ? 1 : 0);
