import { buildLogoutCookie } from '../_plan3.js';

export function GET(request) {
  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: new URL('/', request.url).toString(),
      'Set-Cookie': buildLogoutCookie(),
    },
  });
}
