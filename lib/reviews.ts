import fs from 'node:fs';
import path from 'node:path';
import { REVIEWS_DIR } from './paths';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://automore.com.au';

export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && !slug.includes('..') && slug.length < 120;
}

export function listReviewSlugs(): string[] {
  if (!fs.existsSync(REVIEWS_DIR)) return [];
  return fs
    .readdirSync(REVIEWS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => isSafeSlug(name))
    .filter((name) => fs.existsSync(path.join(REVIEWS_DIR, name, 'article.html')));
}

export function readArticleHtml(slug: string): string | null {
  if (!isSafeSlug(slug)) return null;
  const p = path.join(REVIEWS_DIR, slug, 'article.html');
  if (!fs.existsSync(p)) return null;
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

/** Point hero images at our streaming route (article uses relative hero.jpg). */
export function rewriteMediaSources(slug: string, fragment: string): string {
  return fragment.replace(/src="hero\.(jpg|jpeg|png|webp)"/gi, `src="/api/media/${slug}"`);
}
