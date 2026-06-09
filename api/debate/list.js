import { json, requireUser } from '../_plan3.js';
import { listDebateItems, missingSupabaseResponse } from '../_supabase.js';

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit') || 50;
  const status = url.searchParams.get('status') || undefined;

  try {
    const items = await listDebateItems({ limit, status });
    return json({ count: items.length, items });
  } catch (err) {
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to list debate items', err);
    return json({ error: 'debate_list_failed', detail: err.message }, { status: err.status || 502 });
  }
}
