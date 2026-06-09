create extension if not exists pgcrypto;

create table if not exists public.debate_items (
  id uuid primary key default gen_random_uuid(),
  message_id text unique,
  internet_message_id text,
  conversation_id text,
  source text not null default 'outlook',
  subject text not null default '',
  sender_name text,
  sender_email text,
  received_at timestamptz,
  body_preview text,
  body_text text,
  has_attachments boolean not null default false,
  web_link text,
  categories text[] not null default '{}',
  status text not null default 'new'
    check (status in ('new', 'candidate', 'needs_edit', 'hold', 'rejected', 'published', 'manual_review')),
  priority integer not null default 0,
  topic text,
  local_connection text,
  fvn_connection text,
  suggested_title text,
  editor_note text,
  scores jsonb not null default '{}'::jsonb,
  risk_flags text[] not null default '{}',
  raw jsonb not null default '{}'::jsonb,
  imported_by_email text,
  imported_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editor_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.debate_items(id) on delete cascade,
  actor_email text,
  actor_name text,
  event_type text not null,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fvn_recent_stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  ingress text,
  url text unique,
  section text,
  published_at timestamptz,
  tags text[] not null default '{}',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists debate_items_received_at_idx on public.debate_items (received_at desc);
create index if not exists debate_items_status_idx on public.debate_items (status);
create index if not exists debate_items_sender_email_idx on public.debate_items (sender_email);
create index if not exists editor_events_item_id_idx on public.editor_events (item_id);
create index if not exists fvn_recent_stories_published_at_idx on public.fvn_recent_stories (published_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists debate_items_set_updated_at on public.debate_items;
create trigger debate_items_set_updated_at
before update on public.debate_items
for each row execute function public.set_updated_at();

alter table public.debate_items enable row level security;
alter table public.editor_events enable row level security;
alter table public.fvn_recent_stories enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.debate_items to service_role;
grant select, insert, update, delete on public.editor_events to service_role;
grant select, insert, update, delete on public.fvn_recent_stories to service_role;
