import {
  buildAuthCookie,
  extractVerifiedUser,
  json,
  normalizeUser,
  verifyPlan3Token,
} from '../_plan3.js';

export async function GET(request) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim();

  if (!token) {
    return json({ error: 'missing token' }, { status: 400 });
  }

  let verified;
  try {
    verified = await verifyPlan3Token(token);
  } catch (err) {
    console.error('Plan3 callback verify failed', err);
    return json({ error: 'auth verify failed' }, { status: err.name === 'AbortError' ? 504 : 502 });
  }

  if (!verified.ok || verified.body?.error) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const verifiedUser = extractVerifiedUser(verified.body);
  const user = verifiedUser ? normalizeUser(verifiedUser) : null;

  if (!user || (!user.id && !user.email)) {
    return json({ error: 'invalid auth response' }, { status: 401 });
  }

  const response = Response.redirect(new URL('/', request.url), 302);
  response.headers.set('Set-Cookie', buildAuthCookie(token, request));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
