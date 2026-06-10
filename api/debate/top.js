import { json, requireUser } from '../_plan3.js';
import { listTopDebateItems, missingSupabaseResponse } from '../_supabase.js';

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(25, Math.max(1, Number(url.searchParams.get('limit') || 10)));

  try {
    const items = await listTopDebateItems({ limit });
    return json({ count: items.length, items });
  } catch (err) {
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to list top debate items', err);
    return json({ error: 'debate_top_failed', detail: err.message }, { status: err.status || 502 });
  }
}
