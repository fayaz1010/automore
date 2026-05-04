import type { MetadataRoute } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { listReviewSlugs, SITE_URL } from '@/lib/reviews';
import { REVIEWS_DIR } from '@/lib/paths';

function mtime(slug: string): Date {
  try {
    const p = path.join(REVIEWS_DIR, slug, 'article.html');
    const s = fs.statSync(p);
    return s.mtime;
  } catch {
    return new Date();
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const slugs = listReviewSlugs();
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/reviews`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    ...slugs.map((slug) => ({
      url: `${SITE_URL}/reviews/${slug}`,
      lastModified: mtime(slug),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
  return entries;
}
