import { json, requireUser } from '../_plan3.js';

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  return json({
    ok: true,
    user: auth.user,
    newsroom: auth.user.newsroom,
    permissions: auth.user.permissions,
  });
}
