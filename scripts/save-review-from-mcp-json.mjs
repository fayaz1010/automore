/**
 * Persist EEAT MCP JSON output to content/reviews/<folder>/article.html
 * and inject a local hero image (hero.jpg|png|webp) + optional caption.
 *
 * Usage:
 *   node scripts/save-review-from-mcp-json.mjs --recover-agent-tools
 *   node scripts/save-review-from-mcp-json.mjs --file="C:/path/to/mcp-output.txt"
 *   node scripts/save-review-from-mcp-json.mjs --file=./out.json --folder=chery-tiggo-4-review-australia
 *
 * After Cursor MCP writes large output to agent-tools/*.txt, run --recover-agent-tools
 * from the repo root (set AGENT_TOOLS_DIR if your Cursor path differs).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REVIEWS = path.join(ROOT, 'content', 'reviews');
const SLUG_MAP_PATH = path.join(REVIEWS, 'slug-map.json');
const DEFAULT_AGENT_TOOLS =
  process.env.AGENT_TOOLS_DIR ||
  path.join(process.env.USERPROFILE || '', '.cursor', 'projects', 'd-AutoMore', 'agent-tools');

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith('--file='))?.split('=').slice(1).join('=') || null;
const folderArg = args.find((a) => a.startsWith('--folder='))?.split('=')[1] || null;
const recover = args.includes('--recover-agent-tools');
const agentDirArg = args.find((a) => a.startsWith('--agent-tools='))?.split('=')[1] || null;
const force = args.includes('--force');

function loadSlugMap() {
  const raw = JSON.parse(fs.readFileSync(SLUG_MAP_PATH, 'utf8'));
  const map = { ...raw };
  delete map._comment;
  return map;
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

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function extractFromMcpPayload(data) {
  const slug = data.slug || data.linkerPayload?.slug;
  const html = data.content || data.html || data.linkerPayload?.html;
  if (!slug || !html) return { error: 'missing slug or html in JSON' };
  return { slug, html };
}

function saveOne({ mcpSlug, html, folderSlug, sourcePath }) {
  const dir = path.join(REVIEWS, folderSlug);
  if (!fs.existsSync(dir)) {
    console.error(`Skip ${mcpSlug}: folder missing ${dir}`);
    return false;
  }
  const hero = findHeroBasename(dir);
  const meta = readImageMeta(dir);
  const out = injectHero(html, hero, meta);
  const outPath = path.join(dir, 'article.html');
  if (fs.existsSync(outPath) && !force) {
    console.log(`Skip (exists): ${folderSlug} — use --force to overwrite`);
    return false;
  }
  fs.writeFileSync(outPath, out, 'utf8');
  const metaOut = {
    savedAt: new Date().toISOString(),
    mcpSlug,
    folderSlug,
    source: sourcePath || null,
    hero: hero,
  };
  fs.writeFileSync(path.join(dir, 'article.saved.json'), JSON.stringify(metaOut, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  return true;
}

function processJsonFile(filePath, slugMap, folderOverride) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('Read failed:', filePath, e.message);
    return false;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('JSON parse failed:', filePath, e.message);
    return false;
  }
  const ex = extractFromMcpPayload(data);
  if (ex.error) {
    console.error(filePath, ex.error);
    return false;
  }
  const folder = folderOverride || slugMap[ex.slug];
  if (!folder) {
    console.error(`No slug-map entry for MCP slug "${ex.slug}" — add to content/reviews/slug-map.json`);
    return false;
  }
  return saveOne({ mcpSlug: ex.slug, html: ex.html, folderSlug: folder, sourcePath: filePath });
}

const slugMap = loadSlugMap();

if (fileArg) {
  const fp = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  processJsonFile(fp, slugMap, folderArg);
  process.exit(0);
}

if (recover) {
  const dir = agentDirArg || DEFAULT_AGENT_TOOLS;
  if (!fs.existsSync(dir)) {
    console.error('agent-tools dir not found:', dir, '\nSet AGENT_TOOLS_DIR or --agent-tools=');
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
  let n = 0;
  for (const f of files) {
    const fp = path.join(dir, f);
    if (processJsonFile(fp, slugMap, null)) n++;
  }
  console.log(`Done. Saved/updated ${n} article(s).`);
  process.exit(0);
}

console.error(`Usage:
  node scripts/save-review-from-mcp-json.mjs --recover-agent-tools [--agent-tools=DIR] [--force]
  node scripts/save-review-from-mcp-json.mjs --file=path/to/mcp.json.txt [--folder=override-slug] [--force]
`);
process.exit(1);
