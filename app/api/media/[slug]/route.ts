import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { REVIEWS_DIR } from '@/lib/paths';
import { isSafeSlug } from '@/lib/reviews';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSafeSlug(slug)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const base = path.join(REVIEWS_DIR, slug, 'hero');
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const filePath = path.join(REVIEWS_DIR, slug, `hero${ext}`);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }
  }
  return new NextResponse('Not found', { status: 404 });
}
