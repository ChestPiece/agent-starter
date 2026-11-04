-- agent-starter schema. Paste into the Supabase SQL editor once. Server-only tables: RLS on, no policies,
-- so only the service role (the Next.js server) can read or write them.

begin;

-- One row per anonymous browser (localStorage key). Add your own user/tenant columns here.
create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text,
  created_at timestamptz not null default now()
);

-- The agent's memory: model input items (user/assistant messages, tool calls and results), newest last.
create table if not exists conversations (
  visitor_id uuid primary key references visitors (id) on delete cascade,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- The human-readable transcript (what a reload or an inbox shows).
create table if not exists messages (
  id bigint generated always as identity primary key,
  visitor_id uuid not null references visitors (id) on delete cascade,
  channel text not null check (channel in ('web', 'voice')),
  role text not null check (role in ('user', 'assistant', 'staff')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_visitor_idx on messages (visitor_id, id);

create table if not exists usage_events (
  id bigint generated always as identity primary key,
  channel text not null,
  requests int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  visitor_id uuid references visitors (id) on delete cascade,
  kind text not null,
  summary text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_visitor_kind_idx on events (visitor_id, kind, created_at);

create table if not exists rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_key_at_idx on rate_hits (key, at);

alter table visitors enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table usage_events enable row level security;
alter table events enable row level security;
alter table rate_hits enable row level security;
revoke all on visitors, conversations, messages, usage_events, events, rate_hits from anon, authenticated;

-- Append turns in one statement and keep the last `max` items, so two runs at once never lose each other's turns.
create or replace function append_history(v uuid, items jsonb, max int) returns void
language sql security definer set search_path = public as $$
  insert into conversations (visitor_id, history)
  values (v, (select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
              from (select e, n from jsonb_array_elements(items) with ordinality t(e, n) order by n desc limit max) x))
  on conflict (visitor_id) do update set updated_at = now(), history = (
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
    from (select e, n from jsonb_array_elements(conversations.history || items) with ordinality t(e, n) order by n desc limit max) x
  );
$$;
revoke execute on function append_history(uuid, jsonb, int) from public, anon, authenticated;
grant execute on function append_history(uuid, jsonb, int) to service_role;

-- hit(key, max, window_s): true (and counts one hit) when the key had fewer than `max` hits in the last window_s
-- seconds. The advisory lock makes check-and-insert atomic per key.
create or replace function hit(k text, max int, window_s int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext(k));
  delete from rate_hits where key = k and at < now() - make_interval(secs => window_s);
  select count(*) into n from rate_hits where key = k;
  if n >= max then return false; end if;
  insert into rate_hits (key) values (k);
  -- ponytail: random sweep of keys nobody hits again; a pg_cron job if the table ever grows.
  if random() < 0.01 then delete from rate_hits where at < now() - interval '1 day'; end if;
  return true;
end $$;
revoke execute on function hit(text, int, int) from public, anon, authenticated;
grant execute on function hit(text, int, int) to service_role;

commit;
