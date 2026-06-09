import { fetchLatestMessages, mapMessageToDebateItem, missingGraphResponse } from '../_graph.js';
import { json, requireUser } from '../_plan3.js';

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const top = url.searchParams.get('top') || 10;

  try {
    const messages = await fetchLatestMessages({ top });
    return json({
      count: messages.length,
      items: messages.map((message) => {
        const item = mapMessageToDebateItem(message, auth.user);
        return {
          body_preview: item.body_preview,
          has_attachments: item.has_attachments,
          message_id: item.message_id,
          received_at: item.received_at,
          sender_email: item.sender_email,
          sender_name: item.sender_name,
          subject: item.subject,
          web_link: item.web_link,
        };
      }),
    });
  } catch (err) {
    if (err.code === 'graph_not_configured') return missingGraphResponse(json);
    console.error('Unable to fetch Outlook messages', err);
    return json({ error: 'mail_fetch_failed', detail: err.message }, { status: err.status || 502 });
  }
}
