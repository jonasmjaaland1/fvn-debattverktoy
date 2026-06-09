import { evaluateDebateItem } from '../_evaluation.js';
import { json, requireUser } from '../_plan3.js';
import {
  addEditorEvent,
  getDebateItem,
  listRecentStories,
  missingSupabaseResponse,
  updateDebateItem,
} from '../_supabase.js';

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  if (!body?.id) {
    return json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const item = await getDebateItem(body.id);
    if (!item) return json({ error: 'not_found' }, { status: 404 });

    const stories = await listRecentStories({ limit: 30 }).catch(() => []);
    const evaluation = evaluateDebateItem(item, stories);
    const updated = await updateDebateItem(item.id, evaluation);

    await addEditorEvent({
      actor_email: auth.user.email,
      actor_name: auth.user.name,
      event_type: 'evaluate',
      item_id: item.id,
      payload: evaluation,
    });

    return json({ evaluation, item: updated });
  } catch (err) {
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to evaluate debate item', err);
    return json({ error: 'debate_evaluate_failed', detail: err.message }, { status: err.status || 502 });
  }
}
