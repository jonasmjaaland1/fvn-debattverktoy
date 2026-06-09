import { buildPlan3LoginUrl, json } from '../_plan3.js';

export function GET(request) {
  const login = buildPlan3LoginUrl(request);
  if (!login.ok) {
    return json({ error: login.error }, { status: 500 });
  }

  return Response.redirect(login.url, 302);
}
