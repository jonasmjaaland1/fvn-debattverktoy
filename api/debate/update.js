import { json, requireUser } from '../_plan3.js';
import { addEditorEvent, missingSupabaseResponse, updateDebateItem } from '../_supabase.js';

const ALLOWED_FIELDS = new Set([
  'editor_note',
  'fvn_connection',
  'local_connection',
  'priority',
  'risk_flags',
  'scores',
  'status',
  'suggested_title',
  'topic',
]);

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
  if (!body?.id || !body.patch || typeof body.patch !== 'object') {
    return json({ error: 'id and patch are required' }, { status: 400 });
  }

  const patch = {};
  for (const [key, value] of Object.entries(body.patch)) {
    if (ALLOWED_FIELDS.has(key)) {
      patch[key] = value;
    }
  }

  if (!Object.keys(patch).length) {
    return json({ error: 'patch has no allowed fields' }, { status: 400 });
  }

  try {
    const item = await updateDebateItem(body.id, patch);
    if (!item) return json({ error: 'not_found' }, { status: 404 });

    await addEditorEvent({
      actor_email: auth.user.email,
      actor_name: auth.user.name,
      event_type: 'update',
      item_id: item.id,
      payload: patch,
    });

    return json({ item });
  } catch (err) {
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to update debate item', err);
    return json({ error: 'debate_update_failed', detail: err.message }, { status: err.status || 502 });
  }
}
