-- DealDesk AI: initial schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Creates organizations, profiles, deals, deal_events, the sign-up trigger,
-- row level security, and the private `deal-pdfs` storage bucket.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 120),
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null default '',
  email           text,
  organization_id uuid references public.organizations (id) on delete set null,
  role            text not null default 'member' check (role in ('owner', 'member')),
  created_at      timestamptz not null default now()
);

create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  created_by          uuid references public.profiles (id) on delete set null,
  customer            text not null default '',
  deal_value          numeric not null check (deal_value > 0),
  discount            numeric not null default 0 check (discount between 0 and 100),
  payment_terms       text not null default 'Net-30',
  implementation_cost numeric not null default 0 check (implementation_cost >= 0),
  liability           text not null default 'Capped at 1x annual fees',
  sla                 text not null default '99.9',
  margin              numeric not null default 40,
  security_review     boolean not null default false,
  risk_level          text check (risk_level in ('Low', 'Medium', 'High')),
  flags               jsonb not null default '[]'::jsonb,
  approvers           jsonb not null default '[]'::jsonb,
  status              text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'changes_requested')),
  source              text not null default 'manual' check (source in ('manual', 'pdf')),
  pdf_path            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Append-only audit trail. `event_type` + `meta` let the app rebuild sign-off
-- and decision state after a reload.
create table if not exists public.deal_events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_label text not null,
  kind        text not null check (kind in ('ai', 'human', 'system')),
  event_type  text not null default 'note'
              check (event_type in ('ai_review', 'signoff', 'signoff_withdrawn',
                                    'decision', 'reopened', 'pdf_attached', 'note')),
  text        text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists deals_org_created_idx on public.deals (organization_id, created_at desc);
create index if not exists deal_events_deal_idx on public.deal_events (deal_id, created_at);
create index if not exists profiles_org_idx on public.profiles (organization_id);

-- Keep deals.updated_at current.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists deals_touch_updated_at on public.deals;
create trigger deals_touch_updated_at
  before update on public.deals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- The signed-in user's organization. SECURITY DEFINER so RLS policies can call
-- it without recursing into the profiles policy.
create or replace function public.current_org_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- Check an invite code before sign-up. Returns only the matching org's name,
-- never ids or other organizations' data.
create or replace function public.lookup_invite_code(code text)
returns table (organization_name text)
language sql stable security definer set search_path = public as $$
  select name from public.organizations
  where invite_code = upper(trim(code))
  limit 1;
$$;

revoke all on function public.lookup_invite_code(text) from public;
grant execute on function public.lookup_invite_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up trigger: create the profile and create or join the organization
-- from the sign-up metadata (full_name, org_name | invite_code).
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code  text := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');
  v_name  text := nullif(trim(new.raw_user_meta_data ->> 'org_name'), '');
  v_org   uuid;
  v_role  text := 'member';
begin
  if v_code is not null then
    select id into v_org from public.organizations where invite_code = upper(v_code);
    if v_org is null then
      raise exception 'Invalid invite code';
    end if;
  elsif v_name is not null then
    insert into public.organizations (name) values (v_name) returning id into v_org;
    v_role := 'owner';
  end if;

  insert into public.profiles (id, full_name, email, organization_id, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    v_org,
    v_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security: everyone only sees their own organization's rows.
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.deals         enable row level security;
alter table public.deal_events   enable row level security;

drop policy if exists "org members read their org" on public.organizations;
create policy "org members read their org" on public.organizations
  for select to authenticated
  using (id = public.current_org_id());

drop policy if exists "read own and org profiles" on public.profiles;
create policy "read own and org profiles" on public.profiles
  for select to authenticated
  using (id = auth.uid() or organization_id = public.current_org_id());

drop policy if exists "org members read deals" on public.deals;
create policy "org members read deals" on public.deals
  for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "org members create deals" on public.deals;
create policy "org members create deals" on public.deals
  for insert to authenticated
  with check (organization_id = public.current_org_id() and created_by = auth.uid());

drop policy if exists "org members update deals" on public.deals;
create policy "org members update deals" on public.deals
  for update to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

drop policy if exists "org members delete deals" on public.deals;
create policy "org members delete deals" on public.deals
  for delete to authenticated
  using (organization_id = public.current_org_id());

-- Audit events: readable by the org, insert-only (no update/delete policies).
drop policy if exists "org members read events" on public.deal_events;
create policy "org members read events" on public.deal_events
  for select to authenticated
  using (exists (
    select 1 from public.deals d
    where d.id = deal_id and d.organization_id = public.current_org_id()
  ));

drop policy if exists "org members add events" on public.deal_events;
create policy "org members add events" on public.deal_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.deals d
      where d.id = deal_id and d.organization_id = public.current_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: private bucket for uploaded contracts, one folder per org:
--   deal-pdfs/{organization_id}/{deal_id}.pdf
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deal-pdfs', 'deal-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "org members read deal pdfs" on storage.objects;
create policy "org members read deal pdfs" on storage.objects
  for select to authenticated
  using (bucket_id = 'deal-pdfs'
         and (storage.foldername(name))[1] = public.current_org_id()::text);

drop policy if exists "org members upload deal pdfs" on storage.objects;
create policy "org members upload deal pdfs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'deal-pdfs'
              and (storage.foldername(name))[1] = public.current_org_id()::text);

drop policy if exists "org members replace deal pdfs" on storage.objects;
create policy "org members replace deal pdfs" on storage.objects
  for update to authenticated
  using (bucket_id = 'deal-pdfs'
         and (storage.foldername(name))[1] = public.current_org_id()::text);

drop policy if exists "org members delete deal pdfs" on storage.objects;
create policy "org members delete deal pdfs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'deal-pdfs'
         and (storage.foldername(name))[1] = public.current_org_id()::text);
