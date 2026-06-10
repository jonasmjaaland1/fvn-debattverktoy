function getSupabaseConfig() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    configured: Boolean(url && key),
    key,
    url: url?.replace(/\/+$/, ''),
  };
}

function normalizeSupabaseUrl(value) {
  if (!value) return null;

  try {
    const parsed = new URL(String(value).trim());
    return parsed.origin;
  } catch {
    return String(value).trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

function parseJsonOrNull(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function missingSupabaseResponse(json) {
  return json(
    {
      error: 'supabase_not_configured',
      required: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'],
      fallback: 'SUPABASE_SERVICE_ROLE_KEY is also supported',
    },
    { status: 501 },
  );
}

function buildRestUrl(config, table, searchParams = {}) {
  const url = new URL(`${config.url}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function supabaseRequest(table, options = {}) {
  const config = getSupabaseConfig();
  if (!config.configured) {
    const error = new Error('Supabase is not configured');
    error.code = 'supabase_not_configured';
    throw error;
  }

  const url = buildRestUrl(config, table, options.searchParams);
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const body = parseJsonOrNull(text);

  if (!response.ok) {
    const error = new Error(body?.message || body?.error || text || `Supabase request failed: ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function listDebateItems({ limit = 50, status } = {}) {
  return supabaseRequest('debate_items', {
    searchParams: {
      select: '*',
      order: 'received_at.desc.nullslast,created_at.desc',
      limit,
      status: status ? `eq.${status}` : undefined,
    },
  });
}

async function listTopDebateItems({ limit = 10 } = {}) {
  const rows = await supabaseRequest('debate_items', {
    searchParams: {
      select: '*',
      order: 'priority.desc,received_at.desc.nullslast,updated_at.desc',
      limit: Math.max(Number(limit) * 4, 50),
      priority: 'gt.0',
    },
  });

  const statusRank = {
    candidate: 5,
    needs_edit: 4,
    manual_review: 3,
    hold: 2,
    new: 1,
    published: 1,
    rejected: 0,
  };

  return rows
    .sort((a, b) => {
      const rankDiff = (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
      if (rankDiff) return rankDiff;

      const scoreDiff = (b.priority || 0) - (a.priority || 0);
      if (scoreDiff) return scoreDiff;

      return new Date(b.received_at || 0) - new Date(a.received_at || 0);
    })
    .slice(0, Number(limit));
}

async function getDebateItem(id) {
  const rows = await supabaseRequest('debate_items', {
    searchParams: {
      id: `eq.${id}`,
      limit: 1,
      select: '*',
    },
  });

  return rows?.[0] || null;
}

async function upsertDebateItems(items) {
  if (!items.length) return [];

  return supabaseRequest('debate_items', {
    method: 'POST',
    searchParams: {
      on_conflict: 'message_id',
      select: '*',
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: items,
  });
}

async function updateDebateItem(id, patch) {
  const rows = await supabaseRequest('debate_items', {
    method: 'PATCH',
    searchParams: {
      id: `eq.${id}`,
      select: '*',
    },
    headers: {
      Prefer: 'return=representation',
    },
    body: patch,
  });

  return rows?.[0] || null;
}

async function addEditorEvent(event) {
  const rows = await supabaseRequest('editor_events', {
    method: 'POST',
    searchParams: {
      select: '*',
    },
    headers: {
      Prefer: 'return=representation',
    },
    body: event,
  });

  return rows?.[0] || null;
}

async function listRecentStories({ limit = 30 } = {}) {
  return supabaseRequest('fvn_recent_stories', {
    searchParams: {
      select: '*',
      order: 'published_at.desc.nullslast,created_at.desc',
      limit,
    },
  });
}

async function upsertRecentStories(stories) {
  if (!stories.length) return [];

  return supabaseRequest('fvn_recent_stories', {
    method: 'POST',
    searchParams: {
      on_conflict: 'url',
      select: '*',
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: stories,
  });
}

export {
  addEditorEvent,
  getDebateItem,
  getSupabaseConfig,
  listDebateItems,
  listRecentStories,
  listTopDebateItems,
  missingSupabaseResponse,
  updateDebateItem,
  upsertRecentStories,
  upsertDebateItems,
};
