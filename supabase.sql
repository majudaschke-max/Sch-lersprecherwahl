begin;

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  seats integer not null check (seats >= 1),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  public_results boolean not null default false,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid()
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists candidates_unique_name_per_election
  on public.candidates (election_id, lower(trim(name)));

create table if not exists public.voter_tokens (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (election_id, token_hash)
);

create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  election_id uuid not null references public.elections(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (ballot_id, candidate_id)
);

-- RLS wird direkt nach dem Anlegen der Tabellen aktiviert.
-- Dadurch muss Supabase im Editor keinen eigenen RLS-Block ergänzen.
alter table public.admin_users enable row level security;
alter table public.elections enable row level security;
alter table public.candidates enable row level security;
alter table public.voter_tokens enable row level security;
alter table public.ballots enable row level security;
alter table public.votes enable row level security;

create index if not exists candidates_election_idx on public.candidates(election_id);
create index if not exists voter_tokens_election_idx on public.voter_tokens(election_id);
create index if not exists voter_tokens_hash_idx on public.voter_tokens(election_id, token_hash);
create index if not exists ballots_election_idx on public.ballots(election_id);
create index if not exists votes_election_idx on public.votes(election_id);
create index if not exists votes_candidate_idx on public.votes(candidate_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.normalize_voter_token(p_token text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.hash_voter_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(digest(public.normalize_voter_token(p_token), 'sha256'), 'hex');
$$;

create or replace function public.prevent_locked_election_changes()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' and new.seats <> old.seats then
    raise exception 'Die Anzahl der zu wählenden Personen kann nach Wahlstart nicht mehr geändert werden.';
  end if;

  if old.status = 'open' and new.status = 'draft' then
    raise exception 'Eine gestartete Wahl kann nicht zurück in den Entwurf gesetzt werden.';
  end if;

  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'Eine geschlossene Wahl kann nicht erneut geöffnet werden.';
  end if;

  if old.status = 'draft' and new.status = 'open' and new.opened_at is null then
    new.opened_at := now();
  end if;

  if old.status <> 'closed' and new.status = 'closed' and new.closed_at is null then
    new.closed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_election_changes_trigger on public.elections;
create trigger prevent_locked_election_changes_trigger
before update on public.elections
for each row
execute function public.prevent_locked_election_changes();

create or replace function public.prevent_candidate_changes_after_start()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.elections
  where id = new.election_id;

  if v_status is distinct from 'draft' then
    raise exception 'Kandidaten können nach Wahlstart nicht mehr verändert werden.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_candidate_insert_after_start_trigger on public.candidates;
create trigger prevent_candidate_insert_after_start_trigger
before insert on public.candidates
for each row
execute function public.prevent_candidate_changes_after_start();

drop trigger if exists prevent_candidate_update_after_start_trigger on public.candidates;
create trigger prevent_candidate_update_after_start_trigger
before update on public.candidates
for each row
execute function public.prevent_candidate_changes_after_start();

drop policy if exists "admins can read admin users" on public.admin_users;
create policy "admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can manage elections" on public.elections;
create policy "admins can manage elections"
on public.elections
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can read active elections" on public.elections;
create policy "public can read active elections"
on public.elections
for select
to anon, authenticated
using (
  archived_at is null
  and (
    status = 'open'
    or (status = 'closed' and public_results = true)
    or public.is_admin()
  )
);

drop policy if exists "admins can manage draft candidates" on public.candidates;
create policy "admins can manage draft candidates"
on public.candidates
for all
to authenticated
using (
  public.is_admin()
  and exists (
    select 1 from public.elections e
    where e.id = candidates.election_id
    and e.status = 'draft'
  )
)
with check (
  public.is_admin()
  and exists (
    select 1 from public.elections e
    where e.id = candidates.election_id
    and e.status = 'draft'
  )
);

drop policy if exists "admins can read all candidates" on public.candidates;
create policy "admins can read all candidates"
on public.candidates
for select
to authenticated
using (public.is_admin());

drop policy if exists "public can read candidates for active elections" on public.candidates;
create policy "public can read candidates for active elections"
on public.candidates
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.elections e
    where e.id = candidates.election_id
    and e.archived_at is null
    and (
      e.status = 'open'
      or (e.status = 'closed' and e.public_results = true)
    )
  )
);

drop policy if exists "admins can manage voter tokens" on public.voter_tokens;
create policy "admins can manage voter tokens"
on public.voter_tokens
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can read ballots" on public.ballots;
create policy "admins can read ballots"
on public.ballots
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can read votes" on public.votes;
create policy "admins can read votes"
on public.votes
for select
to authenticated
using (public.is_admin());

create or replace function public.check_voter_token(
  p_election_id uuid,
  p_token_plaintext text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_token public.voter_tokens%rowtype;
  v_hash text;
begin
  select status into v_status
  from public.elections
  where id = p_election_id
  and archived_at is null;

  if v_status is null then
    return jsonb_build_object('ok', false, 'message', 'Diese Wahl wurde nicht gefunden.');
  end if;

  if v_status <> 'open' then
    return jsonb_build_object('ok', false, 'message', 'Diese Wahl ist aktuell nicht geöffnet.');
  end if;

  v_hash := public.hash_voter_token(p_token_plaintext);

  select * into v_token
  from public.voter_tokens
  where election_id = p_election_id
  and token_hash = v_hash;

  if v_token.id is null then
    return jsonb_build_object('ok', false, 'message', 'Der Wahlcode ist ungültig.');
  end if;

  if v_token.used_at is not null then
    return jsonb_build_object('ok', false, 'message', 'Dieser Wahlcode wurde bereits verwendet.');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Wahlcode gültig.');
end;
$$;

create or replace function public.cast_vote(
  p_election_id uuid,
  p_token_plaintext text,
  p_candidate_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election public.elections%rowtype;
  v_token_id uuid;
  v_token_used_at timestamptz;
  v_hash text;
  v_selected_count integer;
  v_distinct_count integer;
  v_valid_candidate_count integer;
  v_ballot_id uuid;
begin
  select * into v_election
  from public.elections
  where id = p_election_id
  and archived_at is null;

  if v_election.id is null then
    return jsonb_build_object('ok', false, 'message', 'Diese Wahl wurde nicht gefunden.');
  end if;

  if v_election.status <> 'open' then
    return jsonb_build_object('ok', false, 'message', 'Diese Wahl ist aktuell nicht geöffnet.');
  end if;

  v_selected_count := coalesce(cardinality(p_candidate_ids), 0);
  if v_selected_count <> v_election.seats then
    return jsonb_build_object('ok', false, 'message', format('Der Stimmzettel muss genau %s unterschiedliche Personen enthalten.', v_election.seats));
  end if;

  select count(distinct candidate_id) into v_distinct_count
  from unnest(p_candidate_ids) as selected(candidate_id)
  where candidate_id is not null;

  if v_distinct_count <> v_selected_count then
    return jsonb_build_object('ok', false, 'message', 'Ein Name darf pro Stimmzettel nicht mehrfach gewählt werden.');
  end if;

  select count(*) into v_valid_candidate_count
  from public.candidates
  where election_id = p_election_id
  and id = any(p_candidate_ids);

  if v_valid_candidate_count <> v_selected_count then
    return jsonb_build_object('ok', false, 'message', 'Der Stimmzettel enthält mindestens eine ungültige Kandidatur.');
  end if;

  v_hash := public.hash_voter_token(p_token_plaintext);

  select id, used_at into v_token_id, v_token_used_at
  from public.voter_tokens
  where election_id = p_election_id
  and token_hash = v_hash
  for update;

  if v_token_id is null then
    return jsonb_build_object('ok', false, 'message', 'Der Wahlcode ist ungültig.');
  end if;

  if v_token_used_at is not null then
    return jsonb_build_object('ok', false, 'message', 'Dieser Wahlcode wurde bereits verwendet.');
  end if;

  insert into public.ballots (election_id)
  values (p_election_id)
  returning id into v_ballot_id;

  insert into public.votes (ballot_id, election_id, candidate_id)
  select v_ballot_id, p_election_id, selected.candidate_id
  from unnest(p_candidate_ids) as selected(candidate_id);

  update public.voter_tokens
  set used_at = now()
  where id = v_token_id;

  return jsonb_build_object('ok', true, 'message', 'Deine Stimme wurde gezählt.');
end;
$$;

create or replace function public.admin_election_dashboard(p_election_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election jsonb;
  v_ballots integer;
  v_votes integer;
  v_used_tokens integer;
  v_unused_tokens integer;
  v_results jsonb;
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  select jsonb_build_object(
    'id', id,
    'title', title,
    'seats', seats,
    'status', status,
    'public_results', public_results
  )
  into v_election
  from public.elections
  where id = p_election_id;

  if v_election is null then
    raise exception 'Wahl nicht gefunden.';
  end if;

  select count(*) into v_ballots
  from public.ballots
  where election_id = p_election_id;

  select count(*) into v_votes
  from public.votes
  where election_id = p_election_id;

  select
    count(*) filter (where used_at is not null),
    count(*) filter (where used_at is null)
  into v_used_tokens, v_unused_tokens
  from public.voter_tokens
  where election_id = p_election_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'candidate_id', c.id,
      'name', c.name,
      'vote_count', coalesce(v.vote_count, 0)
    )
    order by coalesce(v.vote_count, 0) desc, c.name asc
  ), '[]'::jsonb)
  into v_results
  from public.candidates c
  left join (
    select candidate_id, count(*)::integer as vote_count
    from public.votes
    where election_id = p_election_id
    group by candidate_id
  ) v on v.candidate_id = c.id
  where c.election_id = p_election_id;

  return jsonb_build_object(
    'election', v_election,
    'ballot_count', coalesce(v_ballots, 0),
    'single_vote_count', coalesce(v_votes, 0),
    'used_token_count', coalesce(v_used_tokens, 0),
    'unused_token_count', coalesce(v_unused_tokens, 0),
    'results', v_results
  );
end;
$$;

create or replace function public.public_election_results(p_election_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election jsonb;
  v_ballots integer;
  v_votes integer;
  v_results jsonb;
begin
  select jsonb_build_object(
    'id', id,
    'title', title,
    'seats', seats,
    'status', status,
    'public_results', public_results
  )
  into v_election
  from public.elections
  where id = p_election_id
  and archived_at is null
  and status = 'closed'
  and public_results = true;

  if v_election is null then
    raise exception 'Dieses Ergebnis ist nicht öffentlich freigegeben.';
  end if;

  select count(*) into v_ballots
  from public.ballots
  where election_id = p_election_id;

  select count(*) into v_votes
  from public.votes
  where election_id = p_election_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'candidate_id', c.id,
      'name', c.name,
      'vote_count', coalesce(v.vote_count, 0)
    )
    order by coalesce(v.vote_count, 0) desc, c.name asc
  ), '[]'::jsonb)
  into v_results
  from public.candidates c
  left join (
    select candidate_id, count(*)::integer as vote_count
    from public.votes
    where election_id = p_election_id
    group by candidate_id
  ) v on v.candidate_id = c.id
  where c.election_id = p_election_id;

  return jsonb_build_object(
    'election', v_election,
    'ballot_count', coalesce(v_ballots, 0),
    'single_vote_count', coalesce(v_votes, 0),
    'results', v_results
  );
end;
$$;

create or replace function public.admin_delete_election(p_election_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  delete from public.elections
  where id = p_election_id;

  return jsonb_build_object('ok', true, 'message', 'Wahl wurde gelöscht.');
end;
$$;

revoke all on function public.check_voter_token(uuid, text) from public;
revoke all on function public.cast_vote(uuid, text, uuid[]) from public;
revoke all on function public.admin_election_dashboard(uuid) from public;
revoke all on function public.public_election_results(uuid) from public;
revoke all on function public.admin_delete_election(uuid) from public;

grant execute on function public.check_voter_token(uuid, text) to anon, authenticated;
grant execute on function public.cast_vote(uuid, text, uuid[]) to anon, authenticated;
grant execute on function public.admin_election_dashboard(uuid) to authenticated;
grant execute on function public.public_election_results(uuid) to anon, authenticated;
grant execute on function public.admin_delete_election(uuid) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

commit;

-- Nach dem Ausführen des Schemas:
-- 1. Lege in Supabase Auth mindestens einen Admin-Benutzer an.
-- 2. Trage dessen auth.users.id hier ein:
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000');
