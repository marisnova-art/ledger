// Data layer: loads the signed-in user's v2_* rows from Supabase and writes changes back.
// In demo mode (?demo) everything stays in memory with sample data, so the app can be tried without signing in.
import { CONFIG } from './config.js';
import { uid, todayStr } from './util.js';

const TABLES = ['v2_categories', 'v2_accounts', 'v2_recurring', 'v2_transactions', 'v2_assets'];
export const S = {
  sb: null, user: null, demo: false,
  books: [], cats: [], accts: [], recs: [], txs: [], assets: [], snaps: [], trash: []
};

export async function initClient() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  S.sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: CONFIG.AUTH_STORAGE_KEY }
  });
  const { data } = await S.sb.auth.getSession();
  S.user = data.session ? data.session.user : null;
  return S.user;
}

export async function signIn(email, password, signUp) {
  const r = signUp ? await S.sb.auth.signUp({ email, password }) : await S.sb.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  S.user = r.data.user || (r.data.session && r.data.session.user);
  if (!S.user) throw new Error('메일함에서 가입 확인 메일을 눌러 주세요');
  return S.user;
}
export async function signOut() { if (S.sb) await S.sb.auth.signOut(); S.user = null; }

const must = r => { if (r.error) throw r.error; return r.data || []; };

export async function loadAll() {
  if (S.demo) return;
  let books = must(await S.sb.from('v2_books').select('*').order('sort').order('created_at'));
  if (!books.length) {
    const b = { id: uid(), user_id: S.user.id, name: '개인 장부', kind: 'personal', icon: 'wallet', sort: 0 };
    must(await S.sb.from('v2_books').insert(b).select());
    books = [b];
  }
  const ids = books.map(b => b.id);
  const [cats, accts, recs, txs, assets] = await Promise.all(TABLES.map(t => {
    let q = S.sb.from(t).select('*').in('book_id', ids);
    if (t === 'v2_transactions') q = q.is('deleted_at', null).order('date', { ascending: false }).range(0, 9999);
    return q.then(must);
  }));
  const snaps = assets.length ? must(await S.sb.from('v2_asset_snapshots').select('*').in('asset_id', assets.map(a => a.id))) : [];
  const trash = must(await S.sb.from('v2_transactions').select('*').in('book_id', ids).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).range(0, 499));
  Object.assign(S, { books, cats, accts, recs, txs, assets, snaps, trash });
}

const KEY = { v2_books: 'books', v2_categories: 'cats', v2_accounts: 'accts', v2_recurring: 'recs', v2_transactions: 'txs', v2_assets: 'assets' };

// Optimistic write: update memory first, then the server. Returns a promise that rejects on server error.
export async function put(table, row) {
  const list = S[KEY[table]];
  if (table === 'v2_transactions' && !row.deleted_at) { const k = S.trash.findIndex(x => x.id === row.id); if (k >= 0) S.trash.splice(k, 1); }
  const i = list.findIndex(x => x.id === row.id);
  if (i >= 0) list[i] = row; else list.push(row);
  if (S.demo) return row;
  const clean = Object.assign({}, row);
  if (table === 'v2_transactions' || table === 'v2_books') clean.updated_at = new Date().toISOString();
  must(await S.sb.from(table).upsert(clean).select());
  return row;
}
export async function putMany(table, rows) {
  const list = S[KEY[table]];
  rows.forEach(row => { const i = list.findIndex(x => x.id === row.id); if (i >= 0) list[i] = row; else list.push(row); });
  if (S.demo || !rows.length) return;
  must(await S.sb.from(table).upsert(rows).select());
}
export async function remove(table, id) {
  const list = S[KEY[table]];
  const i = list.findIndex(x => x.id === id);
  const gone = i >= 0 ? list.splice(i, 1)[0] : null;
  if (table === 'v2_transactions' && gone) S.trash.unshift(Object.assign({}, gone, { deleted_at: new Date().toISOString() }));
  if (S.demo) return;
  if (table === 'v2_transactions') must(await S.sb.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id).select());
  else must(await S.sb.from(table).delete().eq('id', id).select());
}
// Trash: deleted transactions stay on the server with deleted_at set; restore clears it, purge removes the row for good.
export async function restoreTx(id) {
  const t = S.trash.find(x => x.id === id); if (!t) return;
  await put('v2_transactions', Object.assign({}, t, { deleted_at: null }));
}
export async function purgeTx(id) {
  const k = S.trash.findIndex(x => x.id === id); const t = k >= 0 ? S.trash.splice(k, 1)[0] : null;
  if (S.demo || !t) return t;
  must(await S.sb.from('v2_transactions').delete().eq('id', id).select());
  return t;
}
export async function putSnap(snap) {
  const i = S.snaps.findIndex(x => x.asset_id === snap.asset_id && x.date === snap.date);
  if (i >= 0) S.snaps[i] = snap; else S.snaps.push(snap);
  if (S.demo) return;
  must(await S.sb.from('v2_asset_snapshots').upsert(snap).select());
}

// ---------- demo data (sample only, never real records) ----------
export function loadDemo() {
  S.demo = true; S.user = { id: 'demo', email: 'demo' };
  const B = 'demo-book';
  S.books = [{ id: B, user_id: 'demo', name: '개인 장부', kind: 'personal', icon: 'wallet', sort: 0 }];
  const C = (id, name, type, color) => ({ id, book_id: B, name, type, color, icon: null, hidden: false, sort: 0 });
  S.cats = [C('c1', '식비', 'expense', '#FF8469'), C('c2', '카페', 'expense', '#FFB86B'), C('c3', '쇼핑', 'expense', '#FFD36B'), C('c4', '교통', 'expense', '#7CC8FF'),
    C('c5', '주거', 'expense', '#B794F6'), C('c6', '구독료', 'expense', '#FF8469'), C('c7', '급여', 'income', '#C6F432'), C('c8', '부수입', 'income', '#9BE15D')];
  S.accts = [{ id: 'a1', book_id: B, name: '주거래 통장', type: 'bank', initial_balance: 0, sort: 1 }, { id: 'a2', book_id: B, name: '현금', type: 'cash', initial_balance: 0, sort: 2 }];
  const t = todayStr(), m = t.slice(0, 7);
  S.recs = [{ id: 'r1', book_id: B, name: '넷플릭스', type: 'expense', amount: 17000, amount_type: 'fixed', freq: 'monthly', day: 16, next_date: null, active: true, category_id: 'c6', account_id: 'a1', log: [] },
    { id: 'r2', book_id: B, name: '급여', type: 'income', amount: 2450000, amount_type: 'fixed', freq: 'monthly', day: 10, next_date: null, active: true, category_id: 'c7', account_id: 'a1', log: [] },
    { id: 'r3', book_id: B, name: '휴대폰 요금', type: 'expense', amount: 33550, amount_type: 'variable', freq: 'monthly', day: 25, next_date: null, active: true, category_id: 'c5', account_id: 'a1', log: [] },
    { id: 'r4', book_id: B, name: '관리비', type: 'expense', amount: 180000, amount_type: 'variable', freq: 'monthly', day: 28, next_date: null, active: true, category_id: 'c5', account_id: 'a1', log: [] },
    { id: 'r5', book_id: B, name: '쿠팡 와우멤버십', type: 'expense', amount: 7890, amount_type: 'fixed', freq: 'monthly', day: 29, next_date: null, active: true, category_id: 'c6', account_id: 'a1', log: [] }];
  const T = (d, desc, cat, type, amount, extra) => Object.assign({ id: uid(), book_id: B, date: d, time: '12:00', type, amount, description: desc, vendor: desc, memo: null, category_id: cat, account_id: 'a1', recurring_id: null }, extra || {});
  const months = [-5, -4, -3, -2, -1, 0].map(k => { const [y, mo] = m.split('-').map(Number); const dt = new Date(Date.UTC(y, mo - 1 + k, 1)); return dt.toISOString().slice(0, 7); });
  S.txs = [];
  months.forEach((mm, i) => {
    S.txs.push(T(mm + '-10', '급여', 'c7', 'income', 2450000, { recurring_id: 'r2', time: '09:00' }));
    S.txs.push(T(mm + '-03', '월세', 'c5', 'expense', 550000, { time: '10:00' }));
    S.txs.push(T(mm + '-16', '넷플릭스', 'c6', 'expense', 17000, { recurring_id: 'r1', time: '09:10' }));
    S.txs.push(T(mm + '-12', '김밥천국', 'c1', 'expense', 8500 + i * 300));
    S.txs.push(T(mm + '-14', '쿠팡', 'c3', 'expense', 32900 + i * 2100, { time: '21:30' }));
    S.txs.push(T(mm + '-07', '스타벅스', 'c2', 'expense', 5600, { time: '08:40' }));
    if (i % 2) S.txs.push(T(mm + '-20', '당근마켓 판매', 'c8', 'income', 30000 + i * 5000, { time: '19:00' }));
  });
  S.txs = S.txs.filter(x => x.date <= t);
  S.assets = [{ id: 's1', book_id: B, name: '주거래 통장', type: 'deposit', value: 4280000, sort: 1 }, { id: 's2', book_id: B, name: '업비트', type: 'invest', value: 51000, cost: 104000, sort: 2 }];
  S.snaps = [{ asset_id: 's1', date: months[3] + '-01', value: 3600000 }, { asset_id: 's1', date: months[4] + '-01', value: 3900000 }, { asset_id: 's1', date: months[5] + '-01', value: 4280000 },
    { asset_id: 's2', date: months[3] + '-01', value: 24000 }, { asset_id: 's2', date: months[4] + '-01', value: 17000 }, { asset_id: 's2', date: months[5] + '-01', value: 51000 }];
}
