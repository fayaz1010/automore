type Props = { html: string };

/** Trusted HTML from our own generator; rendered server-side only. */
export function ArticleBody({ html }: Props) {
  return <div className="review-prose mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8" dangerouslySetInnerHTML={{ __html: html }} />;
}
