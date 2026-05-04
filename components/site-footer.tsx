import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-ink-900/50 py-12 mt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row justify-between gap-8 text-sm text-slate-500">
        <div>
          <p className="font-display text-white font-medium mb-1">Automore</p>
          <p className="max-w-sm">
            Editorial car guides for Australia. We aggregate ANCAP, recalls, owner reports, and national media — we do
            not claim undisclosed road tests.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/reviews" className="hover:text-road-400 transition-colors">
            All reviews
          </Link>
          <span>© {new Date().getFullYear()} automore.com.au</span>
        </div>
      </div>
    </footer>
  );
}
