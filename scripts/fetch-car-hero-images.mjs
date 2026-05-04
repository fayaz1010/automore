/**
 * Download hero images from Wikimedia Commons (real HTTP fetch + licence metadata).
 * Similar workflow to amaldives villa images: search → pick → hash bytes → save locally.
 * Requires no Google API keys; respects Commons User-Agent policy.
 *
 * Usage: node scripts/fetch-car-hero-images.mjs
 * Optional: node scripts/fetch-car-hero-images.mjs --slug=mg-zs-zst-australia-review
 *
 * After EEAT MCP writes JSON to Cursor agent-tools, persist HTML + hero:
 *   node scripts/save-review-from-mcp-json.mjs --recover-agent-tools [--force]
 * Or one command: node scripts/tier1-images-then-save-articles.mjs [--force]
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'content', 'reviews', 'tier-1-manifest.json');
const UA =
  'AutomoreImageFetcher/1.0 (https://automore.com.au; editorial images from Wikimedia Commons)';

const args = process.argv.slice(2);
const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1] || null;
const SEARCH_QUERY_OVERRIDE =
  args.find((a) => a.startsWith('--searchQuery='))?.split('=').slice(1).join('=') || null;
const IMAGE_ALT_OVERRIDE =
  args.find((a) => a.startsWith('--imageAlt='))?.split('=').slice(1).join('=') || null;

async function commonsSearch(query) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.searchParams.set('action', 'query');
  u.searchParams.set('format', 'json');
  u.searchParams.set('list', 'search');
  u.searchParams.set('srsearch', query);
  u.searchParams.set('srnamespace', '6');
  u.searchParams.set('srlimit', '12');
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Commons search HTTP ${r.status}`);
  return r.json();
}

async function imageInfo(titles) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.searchParams.set('action', 'query');
  u.searchParams.set('format', 'json');
  u.searchParams.set('titles', titles.join('|'));
  u.searchParams.set('prop', 'imageinfo');
  u.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Commons imageinfo HTTP ${r.status}`);
  return r.json();
}

function extFromMime(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

function pickLicense(meta) {
  const m = meta?.extmetadata || {};
  const short = m.LicenseShortName?.value || m.UsageTerms?.value || 'See file page';
  const artist = m.Artist?.value || '';
  const credit = m.Credit?.value || '';
  return { licenseShort: String(short).replace(/<[^>]+>/g, ''), artist, credit };
}

async function downloadBytes(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

async function processEntry(entry) {
  const { slug, searchQuery, imageAlt } = entry;
  const outDir = path.join(ROOT, 'content', 'reviews', slug);
  fs.mkdirSync(outDir, { recursive: true });

  const search = await commonsSearch(searchQuery);
  const hits = search?.query?.search || [];
  if (!hits.length) {
    console.warn(`[${slug}] No Commons hits for: ${searchQuery}`);
    fs.writeFileSync(
      path.join(outDir, 'image-meta.json'),
      JSON.stringify({ ok: false, query: searchQuery }, null, 2)
    );
    return;
  }

  const usedHashes = new Set();
  let chosen = null;

  for (const h of hits) {
    const title = h.title;
    if (!title.startsWith('File:')) continue;
    const info = await imageInfo([title]);
    const pages = info?.query?.pages || {};
    const page = Object.values(pages)[0];
    const ii = page?.imageinfo?.[0];
    if (!ii?.url) continue;
    const w = ii.width || 0;
    if (w && w < 640) continue;
    let bytes;
    try {
      bytes = await downloadBytes(ii.url);
    } catch {
      continue;
    }
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (usedHashes.has(hash)) continue;
    usedHashes.add(hash);

    const ext = extFromMime(ii.mime || 'image/jpeg');
    const relFile = `hero.${ext}`;
    fs.writeFileSync(path.join(outDir, relFile), bytes);

    const lic = pickLicense(ii);
    const meta = {
      ok: true,
      source: 'wikimedia_commons',
      filePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      imageUrl: ii.url,
      title,
      mime: ii.mime,
      width: ii.width,
      height: ii.height,
      sha256: hash,
      alt: imageAlt,
      ...lic,
      note: 'Verify licence on file page before commercial use; attribute per Commons terms.',
    };
    fs.writeFileSync(path.join(outDir, 'image-meta.json'), JSON.stringify(meta, null, 2));
    chosen = relFile;
    break;
  }

  if (!chosen) {
    console.warn(`[${slug}] No suitable image after filtering`);
    fs.writeFileSync(
      path.join(outDir, 'image-meta.json'),
      JSON.stringify({ ok: false, query: searchQuery, reason: 'no_passing_candidate' }, null, 2)
    );
  } else {
    console.log(`[${slug}] saved ${chosen}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let list;
if (slugArg) {
  const found = manifest.filter((e) => e.slug === slugArg);
  if (found.length) {
    list = found;
  } else if (SEARCH_QUERY_OVERRIDE) {
    list = [
      {
        slug: slugArg,
        searchQuery: SEARCH_QUERY_OVERRIDE,
        imageAlt: IMAGE_ALT_OVERRIDE || SEARCH_QUERY_OVERRIDE,
      },
    ];
  } else {
    console.error('Unknown slug:', slugArg, '(add to tier-1-manifest.json or pass --searchQuery=)');
    process.exit(1);
  }
} else {
  list = manifest;
}

for (const entry of list) {
  try {
    await processEntry(entry);
    await new Promise((r) => setTimeout(r, 350));
  } catch (e) {
    console.error(`[${entry.slug}]`, e);
  }
}
