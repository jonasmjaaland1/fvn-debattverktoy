import { fetchLatestMessages, mapMessageToDebateItem, missingGraphResponse } from '../_graph.js';
import { json, requireUser } from '../_plan3.js';
import { missingSupabaseResponse, upsertDebateItems } from '../_supabase.js';

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const top = url.searchParams.get('top') || 25;

  try {
    const messages = await fetchLatestMessages({ top });
    const rows = messages.map((message) => mapMessageToDebateItem(message, auth.user));
    const imported = await upsertDebateItems(rows);

    return json({
      count: imported.length,
      items: imported,
    });
  } catch (err) {
    if (err.code === 'graph_not_configured') return missingGraphResponse(json);
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to import Outlook messages', err);
    return json({ error: 'mail_import_failed', detail: err.message }, { status: err.status || 502 });
  }
}
