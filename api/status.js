import { getGraphConfig } from './_graph.js';
import { json, requireUser } from './_plan3.js';
import { getSupabaseConfig } from './_supabase.js';

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const graph = getGraphConfig();
  const supabase = getSupabaseConfig();

  return json({
    ok: true,
    config: {
      graph: {
        configured: graph.configured,
        folder: graph.configured ? graph.folder : null,
        mailbox: graph.configured ? graph.mailbox : null,
      },
      supabase: {
        configured: supabase.configured,
      },
    },
    user: auth.user,
  });
}
