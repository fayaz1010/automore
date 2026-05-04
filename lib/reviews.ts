import fs from 'node:fs';
import path from 'node:path';
import { REVIEWS_DIR } from './paths';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://automore.com.au';

export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && !slug.includes('..') && slug.length < 120;
}

const HTML_FILE = /\.html$/i;

function listHtmlBasenamesInReviewDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => HTML_FILE.test(f));
}

/** Prefer article.html; otherwise the sole .html file, or the largest .html (main article). */
export function resolveArticleHtmlPath(slug: string): string | null {
  if (!isSafeSlug(slug)) return null;
  const dir = path.join(REVIEWS_DIR, slug);
  const preferred = path.join(dir, 'article.html');
  if (fs.existsSync(preferred)) return preferred;
  const htmls = listHtmlBasenamesInReviewDir(dir);
  if (htmls.length === 0) return null;
  if (htmls.length === 1) return path.join(dir, htmls[0]);
  const paths = htmls.map((f) => path.join(dir, f));
  paths.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return paths[0];
}

export function listReviewSlugs(): string[] {
  if (!fs.existsSync(REVIEWS_DIR)) return [];
  return fs
    .readdirSync(REVIEWS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => isSafeSlug(name))
    .filter((name) => resolveArticleHtmlPath(name) !== null);
}

export function readArticleHtml(slug: string): string | null {
  const p = resolveArticleHtmlPath(slug);
  if (!p) return null;
  return fs.readFileSync(p, 'utf8');
}

export function readSavedMeta(slug: string): Record<string, unknown> | null {
  if (!isSafeSlug(slug)) return null;
  const p = path.join(REVIEWS_DIR, slug, 'article.saved.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractTitleFromArticleHtml(html: string): string {
  const meta = /<meta\s+itemprop=["']headline["']\s+content=["']([^"']*)["']/i.exec(html);
  if (meta?.[1]) return meta[1].trim();
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m) return 'Review';
  return m[1].replace(/<[^>]+>/g, '').trim();
}

export function extractMetaDescription(html: string): string | undefined {
  const m = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html);
  return m?.[1]?.trim();
}

/** Inner HTML of <body> for embedding in our shell. */
export function extractBodyInner(html: string): string {
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const inner = m ? m[1] : html;
  return inner.trim();
}

/** Remove the first H1 so the page shell can own the visible document title (fragment may still carry it for tools). */
export function stripFirstH1(html: string): string {
  return html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '');
}

/** Point hero images at our streaming route (article uses relative hero.jpg). */
export function rewriteMediaSources(slug: string, fragment: string): string {
  return fragment.replace(/src="hero\.(jpg|jpeg|png|webp)"/gi, `src="/api/media/${slug}"`);
}

function slugifyHeading(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/&[a-z]+;/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (s || 'section').slice(0, 96);
}

/** Add stable id attributes to <h2> tags that are missing them (TOC + deep links). */
export function ensureH2Ids(html: string): string {
  const used = new Set<string>();
  return html.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (full, attrs: string | undefined, inner: string) => {
    const a = attrs ?? '';
    if (/\bid\s*=\s*["'][^"']+["']/i.test(a)) return full;
    const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    let base = slugifyHeading(text);
    let id = base;
    let n = 0;
    while (used.has(id)) {
      n += 1;
      id = `${base}-${n}`;
    }
    used.add(id);
    const trimmed = a.trim();
    const open = trimmed ? `<h2 ${trimmed} id="${id}">` : `<h2 id="${id}">`;
    return `${open}${inner}</h2>`;
  });
}

export type TocItem = { id: string; title: string };

export function extractH2Toc(html: string): TocItem[] {
  const out: TocItem[] = [];
  const re = /<h2\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (id && title) out.push({ id, title });
  }
  return out;
}
