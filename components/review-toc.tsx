import type { TocItem } from '@/lib/reviews';

type Props = { items: TocItem[] };

export function ReviewToc({ items }: Props) {
  if (items.length < 4) return null;
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-28 pb-10">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-4">On this page</p>
        <nav aria-label="Article sections">
          <ul className="space-y-1 border-l border-white/10 text-sm">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block border-l-2 border-transparent py-1.5 pl-4 -ml-px text-slate-400 transition-colors hover:border-road-500 hover:text-road-300 line-clamp-2"
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
