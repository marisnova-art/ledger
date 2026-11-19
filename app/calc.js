// Derived numbers: monthly totals, 6-month series, recurring status, computed alerts, net worth.
import { S } from './store.js';
import { todayStr, addMonths, addDays, ym, won } from './util.js';

export const cur = { bookId: null };
export const book = () => S.books.find(b => b.id === cur.bookId) || S.books[0];
export const bookTx = () => S.txs.filter(t => t.book_id === book().id && !t.deleted_at);
export const cats = type => S.cats.filter(c => c.book_id === book().id && (!type || c.type === type)).sort((a, b) => a.sort - b.sort);
export const accts = () => S.accts.filter(a => a.book_id === book().id).sort((a, b) => a.sort - b.sort);
export const recs = () => S.recs.filter(r => r.book_id === book().id);
export const assets = () => S.assets.filter(a => a.book_id === book().id).sort((a, b) => a.sort - b.sort);
export const catOf = id => S.cats.find(c => c.id === id);
export const acctOf = id => S.accts.find(a => a.id === id);

export function sumOf(list) {
  return list.reduce((a, t) => { if (t.type === 'income') a.inc += Number(t.amount); else if (t.type === 'expense') a.exp += Number(t.amount); return a; }, { inc: 0, exp: 0 });
}
export const monthTx = m => bookTx().filter(t => t.date.startsWith(m));
export const monthSum = m => sumOf(monthTx(m));
export function series(endM, n = 6) {
  const out = []; for (let k = n - 1; k >= 0; k--) { const m = addMonths(endM, -k); out.push(Object.assign({ m }, monthSum(m))); } return out;
}
// Financial health score = four parts, each shown on the card so the number is explainable.
const dimOf = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate();
export function score(m) {
  const s = monthSum(m), t = todayStr(), isNow = m === ym(t), dim = dimOf(m);
  const elapsed = isNow ? Number(t.slice(8)) : dim;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 1. savings rate (40)
  const rate = s.inc ? (s.inc - s.exp) / s.inc : (s.exp ? -1 : 0);
  const p1 = Math.round(clamp(rate / 0.3, 0, 1) * 40);
  // 2. fixed costs vs income (25): recurring expenses
  const fixed = recs().filter(r => r.active !== false && r.type === 'expense').reduce((a, r) => a + Number(r.amount || 0), 0);
  const fr = s.inc ? fixed / s.inc : null;
  const p2 = fr == null ? 12 : Math.round(clamp((0.7 - fr) / 0.4, 0, 1) * 25);
  // 3. spending pace vs the last 3 months, scaled to days elapsed (20)
  const avg = [1, 2, 3].map(k => monthSum(addMonths(m, -k)).exp).reduce((a, b) => a + b, 0) / 3;
  const expected = avg * elapsed / dim, pace = expected ? s.exp / expected : null;
  const p3 = pace == null ? 10 : Math.round(clamp((1.5 - pace) / 0.5, 0, 1) * 20);
  // 4. recording habit: days with at least one entry (15)
  const days = new Set(monthTx(m).map(x => x.date)).size, hr = days / Math.max(1, elapsed);
  const p4 = Math.round(clamp(hr / 0.5, 0, 1) * 15);
  const v = clamp(p1 + p2 + p3 + p4, 0, 100);
  const st = (x, max) => x >= max * 0.75 ? ['좋아요', 'good'] : x >= max * 0.4 ? ['보통', 'mid'] : ['주의', 'bad'];
  const pct = x => Math.round(x * 100) + '%';
  const f = [
    { k: '저축률', v: s.inc ? pct(rate) : '수입 없음', note: '들어온 돈 중 남은 비율', p: p1, max: 40, st: st(p1, 40) },
    { k: '고정 지출', v: fr == null ? '—' : pct(fr), note: '반복 지출 ÷ 들어온 돈', p: p2, max: 25, st: st(p2, 25) },
    { k: '지출 속도', v: pace == null ? '—' : pct(pace), note: '지난 3달 같은 시점 대비', p: p3, max: 20, st: st(p3, 20) },
    { k: '기록 습관', v: days + '/' + elapsed + '일', note: '기록한 날', p: p4, max: 15, st: st(p4, 15) }
  ];
  return { v, grade: v >= 80 ? '아주 좋아요' : v >= 60 ? '좋아요' : v >= 40 ? '보통이에요' : '조심할 때예요', f };
}
// Month-end outlook: current net minus recurring items not yet recorded this month.
export function outlook(m) {
  const s = monthSum(m), t = todayStr();
  if (m !== ym(t)) { const d0 = dimOf(m); return { end: s.inc - s.exp, out: 0, inn: 0, n: 0, day: d0, dim: d0, used: s.inc ? s.exp / s.inc : null, past: true }; }
  const left = recs().filter(r => r.active !== false && !recDone(r, m));
  const out = left.filter(r => r.type === 'expense').reduce((a, r) => a + Number(r.amount || 0), 0);
  const inn = left.filter(r => r.type === 'income').reduce((a, r) => a + Number(r.amount || 0), 0);
  const dim = dimOf(m), day = Number(t.slice(8));
  return { end: s.inc - s.exp - out + inn, out, inn, n: left.length, day, dim, used: s.inc ? s.exp / s.inc : null };
}

// Recurring: due date in a month, and whether it is already recorded.
export function dueDate(r, m) {
  const [y, mo] = m.split('-').map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return m + '-' + String(Math.min(r.day || 1, last)).padStart(2, '0');
}
export function recDone(r, m) {
  if (bookTx().some(t => t.recurring_id === r.id && t.date.startsWith(m))) return true;
  return (r.log || []).some(l => (l.date || '').startsWith(m) && l.status === 'done');
}
export function recThisMonth() {
  const m = ym(todayStr());
  return recs().filter(r => r.active !== false).map(r => ({ r, due: dueDate(r, m), done: recDone(r, m) })).sort((a, b) => a.due.localeCompare(b.due));
}

// Alerts are computed from the data each time; "확인" hides one on this device.
let dismissed = new Set();
try { dismissed = new Set(JSON.parse(localStorage.getItem('ledger.v2.dismissed') || '[]')); } catch (e) {}
export function dismiss(id, on = true) {
  if (on) dismissed.add(id); else dismissed.delete(id);
  try { localStorage.setItem('ledger.v2.dismissed', JSON.stringify([...dismissed])); } catch (e) {}
}
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem('ledger.v2.seen') || '[]')); } catch (e) {}
export function markSeen(ids) {
  ids.forEach(i => seen.add(i));
  try { localStorage.setItem('ledger.v2.seen', JSON.stringify([...seen].slice(-300))); } catch (e) {}
}

export function computeAlerts() {
  const t = todayStr(), m = ym(t), out = [];
  const add = a => { if (!dismissed.has(a.id)) out.push(Object.assign({ unread: !seen.has(a.id) }, a)); };
  // 1-2. recurring due soon / overdue
  recThisMonth().forEach(({ r, due, done }) => {
    if (done) return;
    const diff = Math.round((new Date(due + 'T00:00:00Z') - new Date(t + 'T00:00:00Z')) / 86400000);
    const what = r.type === 'income' ? '입금' : '결제';
    if (diff >= 0 && diff <= 3) add({ id: 'due:' + r.id + ':' + due, d: t, t: 'rec', ic: 'repeat', title: (diff === 0 ? '오늘 ' : diff === 1 ? '내일 ' : diff + '일 뒤 ') + r.name + ' ' + won(r.amount) + ' ' + what + ' 예정', sub: '반복 거래 · 매달 ' + r.day + '일', act: 'record', actLabel: '지금 기록하기', ref: r.id });
    else if (diff < 0) add({ id: 'late:' + r.id + ':' + due, d: t, t: 'check', warn: true, ic: 'alert', title: r.name + ' ' + what + '이 아직 기록되지 않았어요', sub: '매달 ' + r.day + '일 · ' + won(r.amount), act: 'record', actLabel: '기록하기', ref: r.id });
  });
  // 3. category spending well above the usual (previous 3 months average)
  const day = Number(t.slice(8)), dim = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate();
  cats('expense').forEach(c => {
    const now = monthTx(m).filter(x => x.category_id === c.id && x.type === 'expense').reduce((a, x) => a + Number(x.amount), 0);
    const prev = [1, 2, 3].map(k => monthTx(addMonths(m, -k)).filter(x => x.category_id === c.id && x.type === 'expense').reduce((a, x) => a + Number(x.amount), 0));
    const avg = prev.reduce((a, b) => a + b, 0) / 3;
    if (avg > 0 && now > 10000 && now > avg * 1.3 && prev.filter(Boolean).length >= 2) {
      const pct = Math.round((now / avg - 1) * 100);
      add({ id: 'over:' + c.id + ':' + m, d: t, t: 'odd', warn: true, ic: 'alert', title: '이번 달 ' + c.name + ' 지출이 평소보다 ' + pct + '% 많아요', sub: won(now) + ' · 지난 3달 평균 ' + won(avg) + (day < dim ? ' · 아직 ' + (dim - day) + '일 남았어요' : ''), act: 'cat', actLabel: c.name + ' 거래 보기', ref: c.id });
    }
  });
  // 4. possible duplicates in the last 30 days
  const since = addDays(t, -30), groups = {};
  bookTx().filter(x => x.date >= since).forEach(x => { const k = x.date + '|' + x.type + '|' + x.amount + '|' + (x.description || ''); (groups[k] = groups[k] || []).push(x); });
  Object.values(groups).filter(g => g.length > 1).forEach(g => {
    const x = g[0];
    add({ id: 'dup:' + g.map(y => y.id).sort().join(','), d: x.date, t: 'check', warn: true, ic: 'copy', title: '같은 날 같은 금액이 ' + g.length + '번 있어요', sub: (x.description || '거래') + ' ' + won(x.amount) + ' · 중복일 수 있어요', act: 'search', actLabel: '거래 보기', ref: x.description || '' });
  });
  // 5. new repeating pattern (same description 3 months in a row, similar amount, not yet recurring)
  const names = new Set(recs().map(r => r.name));
  const by = {};
  bookTx().filter(x => !x.recurring_id && x.description).forEach(x => { (by[x.type + '|' + x.description] = by[x.type + '|' + x.description] || []).push(x); });
  Object.entries(by).forEach(([k, list]) => {
    const desc = k.split('|').slice(1).join('|'); if (names.has(desc)) return;
    const ms = [0, 1, 2].map(i => addMonths(m, -i));
    const per = ms.map(mm => list.filter(x => x.date.startsWith(mm)));
    if (per.some(p => p.length !== 1)) return;
    const amts = per.map(p => Number(p[0].amount)), avg = amts.reduce((a, b) => a + b, 0) / 3;
    if (amts.some(a => Math.abs(a - avg) > avg * 0.15)) return;
    add({ id: 'pat:' + k + ':' + m, d: t, t: 'check', ic: 'calendar', title: desc + ', 3달 연속 비슷한 금액이에요', sub: won(Math.round(avg)) + ' · 매달 ' + Number(per[0][0].date.slice(8)) + '일쯤 · 반복으로 등록할까요?', act: 'mkrec', actLabel: '반복으로 등록', ref: per[0][0].id });
  });
  // 6. recurring amount changed this month
  recs().forEach(r => {
    const x = monthTx(m).find(y => y.recurring_id === r.id); if (!x || !r.amount) return;
    const d = Number(x.amount) - Number(r.amount);
    if (Math.abs(d) > r.amount * 0.05) add({ id: 'chg:' + r.id + ':' + m, d: x.date, t: 'rec', ic: 'repeat', title: r.name + ' 금액이 ' + (d > 0 ? won(d) + ' 늘었어요' : won(-d) + ' 줄었어요'), sub: '이번 달 ' + won(x.amount) + ' · 등록된 금액 ' + won(r.amount), act: 'search', actLabel: '거래 보기', ref: x.description || r.name });
  });
  return out.sort((a, b) => b.d.localeCompare(a.d));
}

// Assets: loans count as minus. Month-end values come from snapshots, carried forward.
export const ASSET_TYPES = { deposit: ['예금·적금', 'bank'], stock: ['주식·ETF', 'trend'], invest: ['투자', 'trend'], coin: ['코인', 'btc'], estate: ['부동산', 'house'], movable: ['물건·차량', 'car'], etc: ['기타 자산', 'box'], loan: ['대출', 'loan'] };
export const assetLabel = t => (ASSET_TYPES[t] || [t || '기타', 'box'])[0];
export const assetIcon = t => (ASSET_TYPES[t] || ['', 'box'])[1];
export const signedVal = a => (a.type === 'loan' ? -1 : 1) * Number(a.value || 0);
export function assetValueAt(a, m) {
  if (m >= ym(todayStr())) return signedVal(a);
  const end = m + '-31';
  const s = S.snaps.filter(x => x.asset_id === a.id && x.date <= end).sort((x, y) => x.date.localeCompare(y.date)).pop();
  return s ? (a.type === 'loan' ? -1 : 1) * Number(s.value) : 0;
}
export const netWorthAt = m => assets().reduce((x, a) => x + assetValueAt(a, m), 0);
