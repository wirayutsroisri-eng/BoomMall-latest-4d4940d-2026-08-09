import { NextRequest, NextResponse } from 'next/server';
import { shopWebPath } from '@/lib/canonical';

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('shopKey') ?? '';
  const key = raw.trim().replace(/^@+/, '');
  if (!key) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.redirect(new URL(shopWebPath(key), req.url));
}
