import Link from 'next/link';
import { listReviewSlugs, readArticleHtml, extractTitleFromArticleHtml, extractMetaDescription } from '@/lib/reviews';
import { ReviewCard } from '@/components/review-card';

export default function HomePage() {
  const slugs = listReviewSlugs().slice(0, 6);
  const cards = slugs.map((slug) => {
    const raw = readArticleHtml(slug);
    const title = raw ? extractTitleFromArticleHtml(raw) : slug;
    const description = raw ? extractMetaDescription(raw) : undefined;
    return { slug, title, description };
  });

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-road-400 mb-4">Australian car reviews</p>
          <h1 className="font-display text-4xl sm:text-6xl font-semibold tracking-tight text-white max-w-3xl leading-[1.1]">
            Buy smarter.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-road-300 to-amber-200">
              Fewer surprises.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-slate-400 leading-relaxed">
            Used-buyer guides with ANCAP context, recalls, running costs, and honest comparisons — written for Australian
            roads and budgets.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/reviews"
              className="inline-flex items-center justify-center rounded-full bg-road-500 px-8 py-3.5 text-sm font-semibold text-ink-950 shadow-card hover:bg-road-400 transition-colors"
            >
              Browse reviews
            </Link>
            <a
              href="#latest"
              className="inline-flex items-center justify-center rounded-full px-8 py-3.5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/5 transition-colors"
            >
              Latest guides
            </a>
          </div>
        </div>
      </section>

      <section id="latest" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">Latest reviews</h2>
            <p className="text-slate-500 text-sm mt-1">Updated as new guides ship.</p>
          </div>
          <Link href="/reviews" className="text-sm text-road-400 hover:text-road-300 font-medium">
            View all →
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <ReviewCard key={c.slug} slug={c.slug} title={c.title} description={c.description} />
          ))}
        </div>
      </section>
    </>
  );
}
