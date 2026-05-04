import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  listReviewSlugs,
  readArticleHtml,
  extractTitleFromArticleHtml,
  extractMetaDescription,
  extractBodyInner,
  rewriteMediaSources,
  SITE_URL,
} from '@/lib/reviews';
import { ArticleBody } from '@/components/article-body';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return listReviewSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const raw = readArticleHtml(slug);
  if (!raw) return { title: 'Not found' };
  const title = extractTitleFromArticleHtml(raw);
  const description = extractMetaDescription(raw);
  const url = `${SITE_URL}/reviews/${slug}`;
  return {
    title,
    description: description || `${title} — Automore Australian car review.`,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: description || undefined,
      url,
      type: 'article',
      locale: 'en_AU',
      siteName: 'Automore',
      images: [{ url: `${SITE_URL}/api/media/${slug}`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: description || undefined,
      images: [`${SITE_URL}/api/media/${slug}`],
    },
  };
}

function jsonLdArticle(slug: string, title: string, description: string | undefined) {
  const url = `${SITE_URL}/reviews/${slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description || title,
    url,
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'Automore' },
    publisher: {
      '@type': 'Organization',
      name: 'Automore',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    image: [`${SITE_URL}/api/media/${slug}`],
    inLanguage: 'en-AU',
  };
}

function jsonLdBreadcrumb(slug: string, title: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Reviews', item: `${SITE_URL}/reviews` },
      { '@type': 'ListItem', position: 3, name: title, item: `${SITE_URL}/reviews/${slug}` },
    ],
  };
}

export default async function ReviewPage({ params }: Props) {
  const { slug } = await params;
  const raw = readArticleHtml(slug);
  if (!raw) notFound();

  const title = extractTitleFromArticleHtml(raw);
  const description = extractMetaDescription(raw);
  const inner = rewriteMediaSources(slug, extractBodyInner(raw));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdArticle(slug, title, description)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb(slug, title)) }}
      />
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <nav className="text-sm text-slate-500 mb-6">
          <Link href="/" className="hover:text-road-400">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/reviews" className="hover:text-road-400">
            Reviews
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-300 line-clamp-1">{title}</span>
        </nav>
      </div>
      <ArticleBody html={inner} />
    </>
  );
}
