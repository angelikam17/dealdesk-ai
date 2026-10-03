// DEMO MODE ONLY (`npm run dev:demo`). Replaces src/lib/supabase.js at build time.
//
// A tiny in-browser stand-in for the Supabase client so the full flow can be
// clicked through (and presented) without a Supabase project. It implements
// only the calls DealDesk AI makes, keeps data in localStorage, and copies the
// org scoping from the real RLS policies. It is NOT secure and NOT a database:
// passwords are stored in plain text in this browser. Never deploy it.

const KEY = 'dealdesk-demo-db-v1';
const SESSION_KEY = 'dealdesk-demo-session-v1';

export const isSupabaseConfigured = true;
export const isDemoMode = true;

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const inviteCode = () => uuid().replace(/-/g, '').slice(0, 8).toUpperCase();
const clone = (v) => JSON.parse(JSON.stringify(v));

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? empty();
  } catch {
    return empty();
  }
}
function empty() {
  return { users: [], organizations: [], profiles: [], deals: [], deal_events: [], files: {} };
}
let db = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* quota: keep in memory */
  }
};

// ---------- auth ----------
let session = (() => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
})();
const listeners = new Set();
function setSession(s, event) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((cb) => cb(event, s));
}
const makeSession = (u) => ({ access_token: 'demo', user: { id: u.id, email: u.email, user_metadata: u.meta } });
const err = (message) => ({ message });
const delay = (v, ms = 150) => new Promise((r) => setTimeout(() => r(v), ms));
const uid = () => session?.user?.id ?? null;
const myOrg = () => db.profiles.find((p) => p.id === uid())?.organization_id ?? null;

const auth = {
  getSession: () => delay({ data: { session }, error: null }, 0),
  onAuthStateChange(cb) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
  async signUp({ email, password, options }) {
    const meta = options?.data ?? {};
    const e = email.toLowerCase();
    if (password.length < 8) return delay({ data: {}, error: err('Password should be at least 8 characters') });
    if (db.users.some((u) => u.email === e)) return delay({ data: {}, error: err('User already registered') });
    // Same behavior as the handle_new_user() trigger.
    let orgId = null;
    let role = 'member';
    if (meta.invite_code) {
      orgId = db.organizations.find((o) => o.invite_code === meta.invite_code.toUpperCase())?.id;
      if (!orgId) return delay({ data: {}, error: err('Database error saving new user') });
    } else if (meta.org_name) {
      orgId = uuid();
      db.organizations.push({ id: orgId, name: meta.org_name, invite_code: inviteCode(), created_at: now() });
      role = 'owner';
    }
    const user = { id: uuid(), email: e, password, meta };
    db.users.push(user);
    db.profiles.push({ id: user.id, full_name: meta.full_name || e.split('@')[0], email: e, organization_id: orgId, role, created_at: now() });
    save();
    const s = makeSession(user);
    setSession(s, 'SIGNED_IN');
    return delay({ data: { user: { ...s.user, identities: [{}] }, session: s }, error: null });
  },
  async signInWithPassword({ email, password }) {
    const u = db.users.find((x) => x.email === email.toLowerCase() && x.password === password);
    if (!u) return delay({ data: {}, error: err('Invalid login credentials') });
    const s = makeSession(u);
    setSession(s, 'SIGNED_IN');
    return delay({ data: { session: s, user: s.user }, error: null });
  },
  async signOut() {
    setSession(null, 'SIGNED_OUT');
    return { error: null };
  },
  resend: () => delay({ data: {}, error: null }),
  resetPasswordForEmail: () => delay({ data: {}, error: null }),
  async updateUser({ password }) {
    const u = db.users.find((x) => x.id === uid());
    if (u && password) u.password = password;
    save();
    return delay({ data: { user: session?.user }, error: null });
  },
};

// ---------- RLS-equivalent visibility ----------
const visible = {
  organizations: (r) => r.id === myOrg(),
  profiles: (r) => r.id === uid() || r.organization_id === myOrg(),
  deals: (r) => r.organization_id === myOrg(),
  deal_events: (r) => db.deals.some((d) => d.id === r.deal_id && d.organization_id === myOrg()),
};
const canInsert = {
  deals: (r) => r.organization_id === myOrg() && r.created_by === uid(),
  deal_events: (r) => r.actor_id === uid() && visible.deal_events(r),
};
const DEFAULTS = {
  deals: () => ({ status: 'pending', source: 'manual', pdf_path: null, flags: [], approvers: [], created_at: now(), updated_at: now() }),
  deal_events: () => ({ meta: {}, created_at: now() }),
};

// Resolve the two embedded relations the app selects.
function embed(table, row, cols) {
  const out = { ...row };
  if (table === 'profiles' && cols.includes('organization:organizations')) {
    const o = db.organizations.find((x) => x.id === row.organization_id);
    out.organization = o ? { id: o.id, name: o.name, invite_code: o.invite_code } : null;
  }
  if (table === 'deals' && cols.includes('creator:profiles')) {
    const p = db.profiles.find((x) => x.id === row.created_by);
    out.creator = p ? { full_name: p.full_name } : null;
  }
  return out;
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.cols = '*';
    this.filters = [];
    this.mode = 'many';
  }
  select(cols = '*') {
    this.cols = cols;
    if (this.op === 'select') this.op = 'select';
    this.returning = true;
    return this;
  }
  insert(values) {
    this.op = 'insert';
    this.payload = values;
    return this;
  }
  update(values) {
    this.op = 'update';
    this.payload = values;
    return this;
  }
  eq(col, val) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  ilike(col, pattern) {
    const needle = String(pattern).replace(/%/g, '').toLowerCase();
    this.filters.push((r) => String(r[col] ?? '').toLowerCase().includes(needle));
    return this;
  }
  limit(n) {
    this.max = n;
    return this;
  }
  order(col, { ascending = true } = {}) {
    this.sort = { col, ascending };
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  then(resolve, reject) {
    return delay(this.run()).then(resolve, reject);
  }
  run() {
    if (!uid()) return { data: null, error: err('permission denied (not signed in)') };
    const rows = db[this.table];
    let result;
    if (this.op === 'insert') {
      const row = { id: uuid(), ...(DEFAULTS[this.table]?.() ?? {}), ...clone(this.payload) };
      if (!canInsert[this.table]?.(row)) return { data: null, error: err('new row violates row-level security policy') };
      rows.push(row);
      result = [row];
    } else if (this.op === 'update') {
      result = rows.filter((r) => visible[this.table](r) && this.filters.every((f) => f(r)));
      result.forEach((r) => Object.assign(r, clone(this.payload), this.table === 'deals' ? { updated_at: now() } : {}));
    } else {
      result = rows.filter((r) => visible[this.table](r) && this.filters.every((f) => f(r)));
    }
    if (this.op !== 'select') save();
    if (this.sort) {
      const { col, ascending } = this.sort;
      result = [...result].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1));
    }
    if (this.max) result = result.slice(0, this.max);
    const data = result.map((r) => embed(this.table, clone(r), this.cols));
    if (this.mode === 'single') {
      return data.length === 1 ? { data: data[0], error: null } : { data: null, error: err('JSON object requested, multiple (or no) rows returned') };
    }
    if (this.mode === 'maybe') return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }
}

// ---------- storage ----------
const memFiles = new Map(); // path -> Blob (large files that don't fit localStorage)
const storage = {
  from: () => ({
    async upload(path, file) {
      if (path.split('/')[0] !== myOrg()) return { data: null, error: err('new row violates row-level security policy') };
      memFiles.set(path, file);
      if (file.size < 1_000_000) {
        db.files[path] = await new Promise((r) => {
          const fr = new FileReader();
          fr.onload = () => r(fr.result);
          fr.readAsDataURL(file);
        });
        save();
      }
      return { data: { path }, error: null };
    },
    async createSignedUrl(path) {
      if (path.split('/')[0] !== myOrg()) return { data: null, error: err('Object not found') };
      const blob = memFiles.get(path) ?? (db.files[path] ? await (await fetch(db.files[path])).blob() : null);
      if (!blob) return { data: null, error: err('Object not found') };
      return { data: { signedUrl: URL.createObjectURL(blob) }, error: null };
    },
  }),
};

export const supabase = {
  auth,
  from: (table) => new Query(table),
  storage,
  async rpc(fn, args) {
    if (fn !== 'lookup_invite_code') return { data: null, error: err(`Unknown function ${fn}`) };
    const o = db.organizations.find((x) => x.invite_code === String(args.code).trim().toUpperCase());
    return delay({ data: o ? [{ organization_name: o.name }] : [], error: null });
  },
};
