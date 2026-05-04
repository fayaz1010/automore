type Props = { html: string };

/** Trusted HTML from our own generator; rendered server-side only. */
export function ArticleBody({ html }: Props) {
  return (
    <article
      className="review-prose review-article-surface mx-auto w-full max-w-3xl rounded-2xl bg-ink-900/40 px-5 py-10 shadow-card ring-1 ring-white/[0.06] sm:px-8 sm:py-12"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
