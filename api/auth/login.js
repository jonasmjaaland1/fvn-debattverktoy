import { buildPlan3LoginUrl, json } from '../_plan3.js';

export function GET() {
  const login = buildPlan3LoginUrl();
  if (!login.ok) {
    return json({ error: login.error }, { status: 500 });
  }

  return Response.redirect(login.url, 302);
}
