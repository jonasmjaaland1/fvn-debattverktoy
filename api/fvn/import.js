import { fetchFvnStories } from '../_fvn.js';
import { json, requireUser } from '../_plan3.js';
import { missingSupabaseResponse, upsertRecentStories } from '../_supabase.js';

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get('days') || 14)));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 80)));
  const query = url.searchParams.get('query') || '';
  const metadataOnly = url.searchParams.get('metadata_only') === '1';

  try {
    const result = await fetchFvnStories({ days, limit, query, withFullText: !metadataOnly });
    const rows = await upsertRecentStories(result.rows);

    return json({
      candidates: result.candidates,
      checked: result.checked,
      count: rows.length,
      items: rows,
    });
  } catch (err) {
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to import FVN stories', err);
    return json({ error: 'fvn_import_failed', detail: err.message }, { status: err.status || 502 });
  }
}
