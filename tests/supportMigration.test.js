// Runs 001_init.sql + 002_support.sql in PGlite and checks that support tickets
// can only be created through create_support_ticket(), with identity taken from
// the caller's JWT, and that each org only sees its own tickets.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const sql = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;
// Supabase grants table privileges to these roles by default; mirror that, then
// let the migration's revokes take effect by running it afterwards.
const DEFAULT_GRANTS = `
  grant usage on schema public, auth, storage to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const A = '00000000-0000-0000-0000-00000000000a';
const C = '00000000-0000-0000-0000-00000000000c';
let db;

async function as(userId, q, params) {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.query(userId ? 'set role authenticated' : 'set role anon');
  try {
    return await db.query(q, params);
  } finally {
    await db.query('reset role');
  }
}

const createTicket = (user, args) =>
  as(
    user,
    `select * from public.create_support_ticket(p_subject => $1, p_description => $2, p_priority => $3,
       p_escalate => $4, p_channel => $5, p_contact_name => $6, p_contact_email => $7, p_deal_id => $8)`,
    [args.subject, args.description, args.priority ?? 'normal', args.escalate ?? false, args.channel ?? 'chat',
     args.name ?? null, args.email ?? null, args.dealId ?? null]
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  await db.exec(DEFAULT_GRANTS);
  await db.exec(sql('001_init.sql'));
  await db.exec(sql('002_support.sql'));
  await db.query(`insert into auth.users values ($1, 'ana@nw.test', '{"full_name":"Ana Ruiz","org_name":"Northwind"}')`, [A]);
  await db.query(`insert into auth.users values ($1, 'cy@contoso.test', '{"full_name":"Cy Park","org_name":"Contoso"}')`, [C]);
});

describe('002_support.sql', () => {
  it('signed-in users create tickets tied to their own org and profile', async () => {
    const { rows } = await createTicket(A, { subject: 'Cannot upload PDF', description: 'The upload spins forever.' });
    expect(rows[0]).toMatchObject({ ticket_number: 1001, status: 'open', priority: 'normal', organization_name: 'Northwind' });
    const t = (await db.query(`select * from public.support_tickets where ticket_number = 1001`)).rows[0];
    expect(t).toMatchObject({ created_by: A, source: 'app', contact_name: 'Ana Ruiz', contact_email: 'ana@nw.test' });
  });

  it('escalation forces urgent priority and escalated status', async () => {
    const { rows } = await createTicket(A, { subject: 'Need a human', description: 'Legal deadline today', priority: 'low', escalate: true, channel: 'voice' });
    expect(rows[0]).toMatchObject({ status: 'escalated', priority: 'urgent' });
  });

  it('anonymous visitors must leave an email, and get no org', async () => {
    await expect(createTicket(null, { subject: 'Pricing?', description: 'How much is it?' })).rejects.toThrow(/contact email is required/);
    await expect(createTicket(null, { subject: 'Pricing?', description: 'x', email: 'not-an-email' })).rejects.toThrow(/contact email/);
    const { rows } = await createTicket(null, { subject: 'Pricing?', description: 'How much is it?', email: 'lead@prospect.test', name: 'Lee' });
    expect(rows[0].organization_name).toBeNull();
    const t = (await db.query(`select source, organization_id, created_by from public.support_tickets where contact_email = 'lead@prospect.test'`)).rows[0];
    expect(t).toEqual({ source: 'visitor', organization_id: null, created_by: null });
  });

  it('nobody can insert into the table directly', async () => {
    const q = `insert into public.support_tickets (source, subject, description) values ('app', 'x x x', 'y')`;
    await expect(as(A, q)).rejects.toThrow(/permission denied/);
    await expect(as(null, q)).rejects.toThrow(/permission denied/);
  });

  it('a deal id from another org is dropped', async () => {
    const orgC = (await db.query(`select organization_id from public.profiles where id = $1`, [C])).rows[0].organization_id;
    const dealC = (await db.query(`insert into public.deals (organization_id, created_by, customer, deal_value) values ($1, $2, 'C deal', 10) returning id`, [orgC, C])).rows[0].id;
    await createTicket(A, { subject: 'About a deal', description: 'Sneaky', dealId: dealC });
    const t = (await db.query(`select deal_id from public.support_tickets where subject = 'About a deal'`)).rows[0];
    expect(t.deal_id).toBeNull();
  });

  it('each org only sees its own tickets; anonymous users see none', async () => {
    await createTicket(C, { subject: 'Contoso issue', description: 'Ours' });
    const a = (await as(A, 'select subject from public.support_tickets order by ticket_number')).rows.map((r) => r.subject);
    expect(a).toEqual(['Cannot upload PDF', 'Need a human', 'About a deal']);
    const c = (await as(C, 'select subject from public.support_tickets')).rows.map((r) => r.subject);
    expect(c).toEqual(['Contoso issue']);
    expect((await as(null, 'select count(*)::int as n from public.support_tickets')).rows[0].n).toBe(0);
  });

  it('org members can resolve their own tickets but not other orgs’', async () => {
    const upd = await as(C, `update public.support_tickets set status = 'resolved' where ticket_number = 1001 returning id`);
    expect(upd.rows).toEqual([]);
    const own = await as(A, `update public.support_tickets set status = 'resolved' where ticket_number = 1001 returning status`);
    expect(own.rows).toEqual([{ status: 'resolved' }]);
  });
});
