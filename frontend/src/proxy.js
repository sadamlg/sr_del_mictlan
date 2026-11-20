import { NextResponse } from 'next/server';

export function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const isRobotsFile = pathname === '/robots.txt';
  const isApprovedPublicPage = pathname === '/';

  if (isRobotsFile || (isApprovedPublicPage && process.env.ROBOTS_INDEXABLE === 'true')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}
