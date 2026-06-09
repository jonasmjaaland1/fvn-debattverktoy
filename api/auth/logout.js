import { buildLogoutCookie } from '../_plan3.js';

export function GET(request) {
  const response = Response.redirect(new URL('/', request.url), 302);
  response.headers.set('Set-Cookie', buildLogoutCookie());
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
