const PLAN3_LOGIN_URL = process.env.PLAN3_LOGIN_URL || 'https://micro.fvn.no/plan3Auth/login';
const PLAN3_VERIFY_URL = process.env.PLAN3_VERIFY_URL || 'https://micro.fvn.no/plan3Auth/verify';
const AUTH_VERIFY_TIMEOUT_MS = parsePositiveInt(process.env.AUTH_VERIFY_TIMEOUT_MS, 5000);
const ALLOWED_REDIRECT_ORIGINS = parseList(process.env.ALLOWED_REDIRECT_ORIGINS);
const PLAN3_COOKIE_NAME = 'fvn_plan3_token';
const PLAN3_COOKIE_MAX_AGE_SECONDS = parsePositiveInt(process.env.PLAN3_COOKIE_MAX_AGE_SECONDS, 8 * 60 * 60);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonOrNull(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

function isProduction() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

function normalizePermissions(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function getBearerToken(request) {
  const header = String(request.headers.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function getCookieValue(request, name) {
  const cookies = String(request.headers.get('cookie') || '').split(';');

  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

function getAuthToken(request) {
  return getBearerToken(request) || getCookieValue(request, PLAN3_COOKIE_NAME);
}

function buildAuthCookie(token, request) {
  const origin = getRequestOrigin(request);
  const secure = !origin || origin.startsWith('https:') ? '; Secure' : '';

  return [
    `${PLAN3_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${PLAN3_COOKIE_MAX_AGE_SECONDS}`,
    secure.replace(/^; /, ''),
  ]
    .filter(Boolean)
    .join('; ');
}

function buildLogoutCookie() {
  return `${PLAN3_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

function validateRedirectBackend(rawUrl) {
  if (!rawUrl) {
    return { ok: false, error: 'DEPLOYED_APP_URL must be set' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'DEPLOYED_APP_URL must be a full URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'DEPLOYED_APP_URL must use http or https' };
  }

  if (isProduction() && parsed.protocol !== 'https:') {
    return { ok: false, error: 'DEPLOYED_APP_URL must use https in production' };
  }

  if (ALLOWED_REDIRECT_ORIGINS.length > 0 && !ALLOWED_REDIRECT_ORIGINS.includes(parsed.origin)) {
    return { ok: false, error: 'DEPLOYED_APP_URL origin is not allowed' };
  }

  return { ok: true, url: parsed.toString() };
}

function getRequestOrigin(request) {
  if (!request?.url) return null;

  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

function getBackendUrl(request) {
  const backendUrl = getRequestOrigin(request) || process.env.DEPLOYED_APP_URL;
  return validateRedirectBackend(backendUrl);
}

function buildCallbackUrl(request) {
  const backendUrl = getBackendUrl(request);
  if (!backendUrl.ok) {
    return backendUrl;
  }

  return {
    ok: true,
    url: new URL('/api/auth/callback', backendUrl.url).toString(),
  };
}

function buildPlan3LoginUrl(request) {
  const callbackUrl = buildCallbackUrl(request);
  if (!callbackUrl.ok) {
    return callbackUrl;
  }

  const redirectBackend = validateRedirectBackend(callbackUrl.url);
  if (!redirectBackend.ok) {
    return redirectBackend;
  }

  const url = new URL(PLAN3_LOGIN_URL);
  url.searchParams.set('redirectBackend', callbackUrl.url);
  return { ok: true, url: url.toString() };
}

function extractVerifiedUser(body = {}) {
  const candidates = [
    body.decoded,
    body.payload,
    body.claims,
    body.token,
    body.user,
    body.data?.decoded,
    body.data?.payload,
    body.data?.claims,
    body.data?.token,
    body.data?.user,
    body.data,
    body,
  ];

  return candidates.find(isPlainObject) || null;
}

function getVerifiedUser(verifyBody, token) {
  return extractVerifiedUser(verifyBody) || decodeJwtPayload(token);
}

function normalizeUser(verifiedUser) {
  const emailFromArray = Array.isArray(verifiedUser.userEmails) ? verifiedUser.userEmails[0] : null;

  return {
    id: firstString(verifiedUser.userId, verifiedUser.id, verifiedUser.sub),
    name: firstString(verifiedUser.userDisplayName, verifiedUser.name, verifiedUser.displayName),
    email: firstString(
      emailFromArray,
      verifiedUser.email,
      verifiedUser.mail,
      verifiedUser.upn,
      verifiedUser.preferred_username,
    ),
    newsroom: verifiedUser.newsroom || null,
    permissions: normalizePermissions(verifiedUser.permissions),
  };
}

async function verifyPlan3Token(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(PLAN3_VERIFY_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: parseJsonOrNull(text),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requireUser(request) {
  const url = new URL(request.url);
  if (url.searchParams.has('token')) {
    return {
      response: json({ error: 'token query parameter is not accepted' }, { status: 400 }),
    };
  }

  const token = getAuthToken(request);
  if (!token) {
    return {
      response: json({ error: 'missing authorization' }, { status: 401 }),
    };
  }

  let verified;
  try {
    verified = await verifyPlan3Token(token);
  } catch (err) {
    console.error('Plan3 auth verify failed', err);
    return {
      response: json({ error: 'auth verify failed' }, { status: err.name === 'AbortError' ? 504 : 502 }),
    };
  }

  if (!verified.ok || verified.body?.error) {
    return {
      response: json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  const verifiedUser = getVerifiedUser(verified.body, token);
  if (!verifiedUser) {
    return {
      response: json({ error: 'invalid auth response' }, { status: 401 }),
    };
  }

  const user = normalizeUser(verifiedUser);
  if (!user.id && !user.email) {
    return {
      response: json({ error: 'invalid auth response' }, { status: 401 }),
    };
  }

  return { user };
}

export {
  buildAuthCookie,
  buildLogoutCookie,
  buildPlan3LoginUrl,
  extractVerifiedUser,
  getVerifiedUser,
  json,
  normalizeUser,
  requireUser,
  validateRedirectBackend,
  verifyPlan3Token,
};
