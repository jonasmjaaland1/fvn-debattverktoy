import { cleanSubmittedText, normalizeText } from './_text.js';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getGraphConfig() {
  const tenantId = process.env.MS_TENANT_ID || process.env.AZURE_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;
  const mailbox = process.env.OUTLOOK_MAILBOX;
  const folder = process.env.OUTLOOK_FOLDER || 'inbox';

  return {
    clientId,
    clientSecret,
    configured: Boolean(tenantId && clientId && clientSecret && mailbox),
    folder,
    mailbox,
    tenantId,
  };
}

function missingGraphResponse(json) {
  return json(
    {
      error: 'graph_not_configured',
      required: ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'OUTLOOK_MAILBOX'],
      optional: ['OUTLOOK_FOLDER'],
    },
    { status: 501 },
  );
}

async function getGraphAccessToken() {
  const config = getGraphConfig();
  if (!config.configured) {
    const error = new Error('Microsoft Graph is not configured');
    error.code = 'graph_not_configured';
    throw error;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
    scope: GRAPH_SCOPE,
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const error = new Error(payload?.error_description || payload?.error || 'Unable to get Graph token');
    error.status = response.status;
    error.body = payload;
    throw error;
  }

  return payload.access_token;
}

function graphMessagesUrl({ top = 25 } = {}) {
  const config = getGraphConfig();
  const mailbox = encodeURIComponent(config.mailbox);
  const folder = encodeURIComponent(config.folder || 'inbox');
  const url = new URL(`${GRAPH_ROOT}/users/${mailbox}/mailFolders/${folder}/messages`);

  url.searchParams.set(
    '$select',
    [
      'id',
      'internetMessageId',
      'conversationId',
      'subject',
      'from',
      'sender',
      'receivedDateTime',
      'bodyPreview',
      'body',
      'hasAttachments',
      'webLink',
      'categories',
    ].join(','),
  );
  url.searchParams.set('$orderby', 'receivedDateTime desc');
  url.searchParams.set('$top', String(Math.min(positiveInt(top, 25), 50)));

  return url;
}

async function fetchLatestMessages({ top = 25 } = {}) {
  const token = await getGraphAccessToken();
  const response = await fetch(graphMessagesUrl({ top }), {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.body-content-type="text"',
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.error || 'Unable to fetch Graph messages');
    error.status = response.status;
    error.body = payload;
    throw error;
  }

  return payload?.value || [];
}

function cleanText(value) {
  return normalizeText(value);
}

function mapMessageToDebateItem(message, user) {
  const from = message.from?.emailAddress || message.sender?.emailAddress || {};
  const originalBodyText = cleanText(message.body?.content || message.bodyPreview || '');
  const bodyText = cleanSubmittedText(originalBodyText);

  return {
    body_preview: cleanText(bodyText.slice(0, 500)),
    body_text: bodyText,
    categories: Array.isArray(message.categories) ? message.categories : [],
    conversation_id: message.conversationId || null,
    has_attachments: Boolean(message.hasAttachments),
    imported_by_email: user?.email || null,
    imported_by_name: user?.name || null,
    internet_message_id: message.internetMessageId || null,
    message_id: message.id,
    raw: {
      ...message,
      original_body_text: originalBodyText,
    },
    received_at: message.receivedDateTime || null,
    sender_email: from.address || null,
    sender_name: from.name || null,
    source: 'outlook',
    status: 'new',
    subject: cleanText(message.subject || '(uten emne)'),
    web_link: message.webLink || null,
  };
}

export {
  fetchLatestMessages,
  getGraphConfig,
  mapMessageToDebateItem,
  missingGraphResponse,
};
