import type { Metadata, Viewport } from 'next';
import { DM_Sans, Outfit } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { SITE_URL } from '@/lib/reviews';

const display = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Automore | Australian car reviews',
    template: '%s | Automore',
  },
  description:
    'Independent Australian car reviews: used buyer guides, ANCAP context, recalls, running costs, and honest comparisons.',
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'Automore',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
  },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  category: 'automotive',
};

export const viewport: Viewport = {
  themeColor: '#0a0c10',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-ink-950 font-sans text-slate-200 antialiased">
        <div className="mesh-bg min-h-screen flex flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
