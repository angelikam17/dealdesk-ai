// Runs supabase/migrations/001_init.sql inside PGlite (real Postgres compiled
// to WASM) with minimal stand-ins for Supabase's `auth` and `storage` schemas,
// then checks the sign-up trigger and row level security end to end.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/001_init.sql', import.meta.url), 'utf8');

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
`;

const GRANTS = `
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function storage.foldername(text) to authenticated;
`;

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

let db;

async function signUp(id, email, meta) {
  await db.query('reset role');
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, meta]);
}

// Run a query as an authenticated Supabase user (RLS applies).
async function as(userId, sql, params) {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.query(userId ? 'set role authenticated' : 'set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.query('reset role');
  }
}

const insertDeal = (org, by) =>
  `insert into public.deals (organization_id, created_by, customer, deal_value)
   values ('${org}', '${by}', 'Test Co', 1000) returning id`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(migration);
  await db.exec(GRANTS);
});

describe('001_init.sql', () => {
  let orgA, orgC, inviteA, dealA;

  it('creates an organization and owner profile on sign-up', async () => {
    await signUp(A, 'ana@northwind.test', { full_name: 'Ana Ruiz', org_name: 'Northwind Logistics' });
    const { rows } = await db.query(
      `select p.full_name, p.role, o.name, o.invite_code, o.id as org_id
       from public.profiles p join public.organizations o on o.id = p.organization_id where p.id = $1`,
      [A]
    );
    expect(rows[0]).toMatchObject({ full_name: 'Ana Ruiz', role: 'owner', name: 'Northwind Logistics' });
    expect(rows[0].invite_code).toMatch(/^[0-9A-F]{8}$/);
    orgA = rows[0].org_id;
    inviteA = rows[0].invite_code;
  });

  it('joins an existing organization with an invite code (case-insensitive)', async () => {
    await signUp(B, 'ben@northwind.test', { full_name: 'Ben Okafor', invite_code: inviteA.toLowerCase() });
    const { rows } = await db.query('select organization_id, role from public.profiles where id = $1', [B]);
    expect(rows[0]).toEqual({ organization_id: orgA, role: 'member' });
  });

  it('rejects an invalid invite code', async () => {
    await expect(signUp(C, 'x@x.test', { full_name: 'X', invite_code: 'NOPE0000' })).rejects.toThrow(
      /Invalid invite code/
    );
    await signUp(C, 'cy@contoso.test', { full_name: 'Cy Park', org_name: 'Contoso' });
    orgC = (await db.query('select organization_id from public.profiles where id = $1', [C])).rows[0].organization_id;
    expect(orgC).not.toBe(orgA);
  });

  it('lookup_invite_code returns only the org name, even to anonymous users', async () => {
    const { rows } = await as(null, 'select * from public.lookup_invite_code($1)', [inviteA]);
    expect(rows).toEqual([{ organization_name: 'Northwind Logistics' }]);
    const none = await as(null, 'select * from public.lookup_invite_code($1)', ['ZZZZZZZZ']);
    expect(none.rows).toEqual([]);
  });

  it('anonymous users cannot read tables', async () => {
    await expect(as(null, 'select * from public.deals')).rejects.toThrow(/permission denied/);
  });

  it('members can create and read deals in their own org only', async () => {
    dealA = (await as(A, insertDeal(orgA, A))).rows[0].id;
    expect((await as(B, 'select id from public.deals')).rows).toEqual([{ id: dealA }]);
    expect((await as(C, 'select id from public.deals')).rows).toEqual([]);
    await expect(as(C, insertDeal(orgA, C))).rejects.toThrow(/row-level security/);
    await expect(as(A, insertDeal(orgA, B))).rejects.toThrow(/row-level security/); // created_by must be self
  });

  it('other orgs cannot update deals', async () => {
    const res = await as(C, `update public.deals set status = 'approved' where id = $1 returning id`, [dealA]);
    expect(res.rows).toEqual([]);
    const { rows } = await db.query('select status from public.deals where id = $1', [dealA]);
    expect(rows[0].status).toBe('pending');
  });

  it('audit events are org-scoped and must be written as yourself', async () => {
    const ev = (actor) =>
      `insert into public.deal_events (deal_id, actor_id, actor_label, kind, event_type, text)
       values ('${dealA}', '${actor}', 'x', 'human', 'signoff', 'Signed off')`;
    await as(B, ev(B));
    await expect(as(B, ev(A))).rejects.toThrow(/row-level security/);
    await expect(as(C, ev(C))).rejects.toThrow(/row-level security/);
    expect((await as(A, 'select count(*)::int as n from public.deal_events')).rows[0].n).toBe(1);
    expect((await as(C, 'select count(*)::int as n from public.deal_events')).rows[0].n).toBe(0);
    // Append-only: no update policy, so updates silently affect nothing.
    const upd = await as(B, `update public.deal_events set text = 'edited' returning id`);
    expect(upd.rows).toEqual([]);
  });

  it('profiles and organizations are visible only within the org', async () => {
    const names = (await as(A, 'select full_name from public.profiles order by full_name')).rows.map((r) => r.full_name);
    expect(names).toEqual(['Ana Ruiz', 'Ben Okafor']);
    expect((await as(C, 'select name from public.organizations')).rows).toEqual([{ name: 'Contoso' }]);
  });

  it('storage objects are scoped to the org folder', async () => {
    const put = (user, org) =>
      as(user, `insert into storage.objects (bucket_id, name) values ('deal-pdfs', $1)`, [`${org}/${dealA}.pdf`]);
    await put(A, orgA);
    await expect(put(C, orgA)).rejects.toThrow(/row-level security/);
    expect((await as(B, 'select count(*)::int as n from storage.objects')).rows[0].n).toBe(1);
    expect((await as(C, 'select count(*)::int as n from storage.objects')).rows[0].n).toBe(0);
    const { rows } = await db.query(`select public from storage.buckets where id = 'deal-pdfs'`);
    expect(rows[0].public).toBe(false);
  });
});
