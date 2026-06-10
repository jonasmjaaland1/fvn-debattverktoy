import { json, requireUser } from '../_plan3.js';
import { listRecentStories, missingSupabaseResponse } from '../_supabase.js';

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));

  try {
    const items = await listRecentStories({ limit });
    return json({ count: items.length, items });
  } catch (err) {
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to list FVN stories', err);
    return json({ error: 'fvn_list_failed', detail: err.message }, { status: err.status || 502 });
  }
}
