import { json, requireUser } from '../_plan3.js';
import { missingSupabaseResponse, upsertDebateItems } from '../_supabase.js';

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
  if (!body?.subject || !body?.body_text) {
    return json({ error: 'subject and body_text are required' }, { status: 400 });
  }

  const messageId = `manual:${crypto.randomUUID()}`;
  const item = {
    body_preview: String(body.body_text).slice(0, 500),
    body_text: String(body.body_text),
    has_attachments: false,
    imported_by_email: auth.user.email,
    imported_by_name: auth.user.name,
    message_id: messageId,
    raw: { manual: true },
    received_at: new Date().toISOString(),
    sender_email: body.sender_email || null,
    sender_name: body.sender_name || null,
    source: 'manual',
    status: 'new',
    subject: String(body.subject),
  };

  try {
    const rows = await upsertDebateItems([item]);
    return json({ item: rows[0] });
  } catch (err) {
    if (err.code === 'supabase_not_configured') return missingSupabaseResponse(json);
    console.error('Unable to create manual debate item', err);
    return json({ error: 'manual_create_failed', detail: err.message }, { status: err.status || 502 });
  }
}
