import Link from 'next/link';

type Props = {
  slug: string;
  title: string;
  description?: string;
};

export function ReviewCard({ slug, title, description }: Props) {
  return (
    <Link
      href={`/reviews/${slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-ink-800/60 ring-1 ring-white/10 transition-all hover:ring-road-500/40 hover:shadow-lift"
    >
      <div className="relative aspect-[16/10] w-full bg-ink-900 overflow-hidden">
        <img
          src={`/api/media/${slug}`}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-500 group-hover:opacity-100 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="font-display text-lg font-semibold text-white group-hover:text-road-300 transition-colors line-clamp-2">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm text-slate-400 line-clamp-2">{description}</p>
        ) : null}
        <span className="mt-auto pt-4 text-xs font-medium uppercase tracking-wider text-road-400">Read review →</span>
      </div>
    </Link>
  );
}
