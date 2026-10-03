-- DealDesk AI: customer support tickets
-- Run this in the Supabase SQL editor AFTER 001_init.sql.
--
-- Tickets are created by the n8n support workflow, which calls
-- public.create_support_ticket() either with the signed-in user's own JWT
-- (ticket is tied to their org) or anonymously (landing-page visitors, who
-- must leave an email). Nobody can insert into the table directly.

create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  ticket_number   bigint generated always as identity (start with 1001) unique,
  organization_id uuid references public.organizations (id) on delete cascade,
  created_by      uuid references public.profiles (id) on delete set null,
  source          text not null check (source in ('app', 'visitor')),
  channel         text not null default 'chat' check (channel in ('chat', 'voice', 'form')),
  contact_name    text,
  contact_email   text,
  subject         text not null check (char_length(subject) between 3 and 200),
  description     text not null check (char_length(description) between 1 and 5000),
  deal_id         uuid references public.deals (id) on delete set null,
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status          text not null default 'open' check (status in ('open', 'escalated', 'resolved')),
  conversation_id text, -- ElevenLabs conversation id, to find the transcript later
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists support_tickets_org_idx on public.support_tickets (organization_id, created_at desc);

drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
  for each row execute function public.touch_updated_at();

alter table public.support_tickets enable row level security;

-- Org members can see and resolve their own org's tickets. No insert/delete policies:
-- the only way in is create_support_ticket() below.
drop policy if exists "org members read tickets" on public.support_tickets;
create policy "org members read tickets" on public.support_tickets
  for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "org members update tickets" on public.support_tickets;
create policy "org members update tickets" on public.support_tickets
  for update to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

revoke insert, delete on public.support_tickets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_support_ticket(): the single, validated entry point.
-- Identity comes from the caller's JWT (auth.uid()), never from the payload.
-- ---------------------------------------------------------------------------
drop function if exists public.create_support_ticket(text, text, text, boolean, text, text, text, uuid, text);
create or replace function public.create_support_ticket(
  p_subject       text,
  p_description   text,
  p_priority      text default 'normal',
  p_escalate      boolean default false,
  p_channel       text default 'chat',
  p_contact_name  text default null,
  p_contact_email text default null,
  p_deal_id       uuid default null,
  p_conversation_id text default null
)
returns table (ticket_number bigint, status text, priority text, organization_name text, contact_name text, contact_email text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_profile public.profiles%rowtype;
  v_row     public.support_tickets%rowtype;
  v_prio    text := coalesce(nullif(p_priority, ''), 'normal');
begin
  if v_prio not in ('low', 'normal', 'high', 'urgent') then
    v_prio := 'normal';
  end if;
  if p_escalate then
    v_prio := 'urgent';
  end if;

  if v_uid is not null then
    select * into v_profile from public.profiles where id = v_uid;
    v_org := v_profile.organization_id;
    -- A deal id is only kept if it belongs to the caller's org.
    if p_deal_id is not null and not exists (
      select 1 from public.deals d where d.id = p_deal_id and d.organization_id = v_org
    ) then
      p_deal_id := null;
    end if;
  else
    -- Anonymous visitors must leave a valid-looking email so the team can reply.
    if p_contact_email is null or p_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'A contact email is required' using errcode = '22023';
    end if;
    p_deal_id := null;
  end if;

  insert into public.support_tickets (
    organization_id, created_by, source, channel, contact_name, contact_email,
    subject, description, deal_id, priority, status, conversation_id
  ) values (
    v_org,
    v_uid,
    case when v_uid is null then 'visitor' else 'app' end,
    case when p_channel in ('chat', 'voice', 'form') then p_channel else 'chat' end,
    coalesce(nullif(trim(p_contact_name), ''), v_profile.full_name),
    coalesce(nullif(trim(p_contact_email), ''), v_profile.email),
    left(trim(p_subject), 200),
    left(trim(p_description), 5000),
    p_deal_id,
    v_prio,
    case when p_escalate then 'escalated' else 'open' end,
    left(p_conversation_id, 200)
  )
  returning * into v_row;

  return query
    select v_row.ticket_number, v_row.status, v_row.priority,
           (select o.name from public.organizations o where o.id = v_org),
           v_row.contact_name, v_row.contact_email;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, boolean, text, text, text, uuid, text) from public;
grant execute on function public.create_support_ticket(text, text, text, boolean, text, text, text, uuid, text) to anon, authenticated;
