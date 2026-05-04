/**
 * Daily SERP hunt (Australian automotive): uses Gemini + Google Search grounding from
 * content-eeat-generator (same key pool as UTIL_AI / GEMINI_API_KEY).
 *
 * Writes:
 *   content/queue/serp-strategy-YYYY-MM-DD.json
 *   content/queue/serp-strategy-latest.json   (copy of the dated file)
 *
 * Optional: prepend the top opportunity to daily-queue.json as the next pending job:
 *   node scripts/daily-serp-hunt.mjs --apply-top
 *
 * Env: UTIL_AI_URL + UTIL_AI_TOKEN (or GEMINI_API_KEY / GEMINI_API_KEYS).
 * EEAT_GENERATOR_ROOT defaults to D:/SaaSApps/mcp-servers/content-eeat-generator (must be built).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'content', 'queue');
const QUEUE_PATH = path.join(QUEUE_DIR, 'daily-queue.json');

const args = process.argv.slice(2);
const applyTop = args.includes('--apply-top');

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

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

loadDotEnv();

const eeRoot = process.env.EEAT_GENERATOR_ROOT || 'D:/SaaSApps/mcp-servers/content-eeat-generator';
const gemPath = path.join(eeRoot, 'dist', 'utils', 'gemini.js');
if (!fs.existsSync(gemPath)) {
  console.error('Missing', gemPath, '— run npm run build in', eeRoot);
  process.exit(1);
}

const { generateWithGrounding, extractJSON } = await import(pathToFileURL(gemPath).href);

const today = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();

const system = `You are an Australian automotive SEO strategist for automore.com.au.
Use live web search results. Be factual: only claim SERP patterns you can support from what you find; otherwise hedge ("often", "may").
Do not output internal framework jargon (no E-E-A-T, EEAT, YMYL acronyms in reader-facing fields).`;

const user = `Today is ${today}. Analyse current Australian Google SERP opportunities for **car reviews and used buyer guides** (new + used SUVs, utes, EVs, family cars).

Return ONLY valid JSON (no markdown fences):
{
  "market": "Australia",
  "summary": "One paragraph on what is winning in SERP today and why.",
  "opportunities": [
    {
      "rank": 1,
      "title": "Editorial headline idea",
      "targetKeyword": "primary query string",
      "topic": "Full paragraph brief for writers: angle, must-cover sections, attribution rules (third-party sources only, no fake road tests), cautions.",
      "searchQuery": "short query for hero image search (vehicle name)",
      "imageAlt": "Short alt text",
      "folderSlug": "kebab-case-folder-under-content-reviews-unique",
      "tags": ["tag1", "tag2"],
      "secondaryKeywords": ["kw1", "kw2"],
      "serpNotes": "What types of domains/pages rank and gaps to exploit",
      "outline": ["H2-sized section ideas as strings"]
    }
  ],
  "sourcesConsidered": ["optional note on outlet types seen — not URLs if unsure"]
}

Rules:
- Exactly 5 opportunities, ranked 1–5 by your confidence they are strong for Australian search **today**.
- targetKeyword must read like a real Australian search (include Australia / used / review where natural).
- folderSlug must be unique, lowercase, hyphenated, ending with -australia or -australia-review when appropriate.
- topic must remind writers: no invented statistics; cite ANCAP, ACCC, manufacturer, major AU media or forums.`;

const searchQuery = `Australia car review SERP ${year} trending SUV ute EV used buyer guide`;

const { text, sources } = await generateWithGrounding(system, searchQuery, { temperature: 0.35 }).catch((e) => {
  console.error(e);
  process.exit(1);
});

let data;
try {
  data = extractJSON(text);
} catch (e) {
  console.error('Could not parse JSON from model. Raw (first 2k):\n', text.slice(0, 2000));
  process.exit(1);
}

data.generatedAt = new Date().toISOString();
data.groundingSources = (sources || []).slice(0, 25);

fs.mkdirSync(QUEUE_DIR, { recursive: true });
const datedPath = path.join(QUEUE_DIR, `serp-strategy-${today}.json`);
const latestPath = path.join(QUEUE_DIR, 'serp-strategy-latest.json');
fs.writeFileSync(datedPath, JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(latestPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Wrote', datedPath);
console.log('Wrote', latestPath);

if (applyTop) {
  const top = Array.isArray(data.opportunities) ? data.opportunities[0] : null;
  if (!top || !top.folderSlug || !top.targetKeyword || !top.topic) {
    console.error('--apply-top: missing opportunities[0] or required fields');
    process.exit(1);
  }
  if (!fs.existsSync(QUEUE_PATH)) {
    console.error('Missing', QUEUE_PATH);
    process.exit(1);
  }
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  const items = queue.items || [];
  const id = `serp-${today}-${slugify(top.targetKeyword).slice(0, 40)}`;
  if (items.some((x) => x.id === id || x.folderSlug === top.folderSlug)) {
    console.log('Queue already has this SERP job (id or folderSlug). Skipping insert.');
    process.exit(0);
  }
  const row = {
    id,
    folderSlug: top.folderSlug,
    status: 'pending',
    scheduledAfter: null,
    searchQuery: top.searchQuery || top.targetKeyword.split(/\s+review/i)[0].trim(),
    imageAlt: top.imageAlt || top.searchQuery || 'Vehicle',
    topic: `${top.topic}\n\nEDITORIAL STRATEGY (from daily SERP hunt ${today}): ${data.summary || ''}\nOutline to follow: ${(top.outline || []).join(' → ')}`,
    targetKeyword: top.targetKeyword,
    tags: Array.isArray(top.tags) ? top.tags : ['SERP', 'Australia'],
    secondaryKeywords: Array.isArray(top.secondaryKeywords) ? top.secondaryKeywords : [],
    serpStrategyDate: today,
    serpRank: top.rank ?? 1,
  };
  items.unshift(row);
  queue.items = items;
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  console.log('Prepended queue item:', id, top.folderSlug);
}
