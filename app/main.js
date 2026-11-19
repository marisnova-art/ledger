// LEDGER v2 — app entry: sign-in, layout (PC sidebar / mobile tab bar), views and edit sheets.
import { CONFIG } from './config.js';
import { S, initClient, signIn, signOut, loadAll, loadDemo, put, putMany, remove, putSnap, restoreTx, purgeTx, restoreItem, purgeItem, uploadReceipt, receiptUrl } from './store.js';
import { CI, CI_GROUPS } from './icons.js';
import { icon, esc, suggestIcons, won, signed, man, uid, todayStr, nowTime, ym, addMonths, addDays, monthLabel, weekday, shortDate, iconForName, acctIcon, acctLabel, ACCT_TYPES } from './util.js';
import { T, cur, book, bookTx, sumOf, cats, accts, mainAcct, recs, assets, catOf, acctOf, monthSum, monthTx, series, score, outlook, recThisMonth, dueDate, recDone, computeAlerts, dismiss, markSeen, ASSET_TYPES, assetLabel, assetIcon, signedVal, netWorthAt, balancesAt } from './calc.js';
import { parseLine, aiParse, imageToB64, imageToBlob, aiInfo } from './ai.js';

const app = document.getElementById('app');
const V = { view: 'home', month: ym(todayStr()), lm: ym(todayStr()), q: '', kind: 'all', catF: '', showN: 10, alF: 'all', setKind: 'expense', bpick: false };
let theme = 'dark';
try { theme = localStorage.getItem('ledger.v2.theme') || 'dark'; cur.bookId = localStorage.getItem('ledger.v2.book'); } catch (e) {}
const applyTheme = () => {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light' || (theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name=theme-color]').setAttribute('content', light ? '#EEEADD' : '#0C0D0B');
};
applyTheme();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
// Block pinch zoom (iOS Safari ignores user-scalable=no).
['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
const isMobile = () => matchMedia('(max-width: 959px)').matches;

/* ---------- small pieces ---------- */
const catIcon = c => c ? (c.icon || iconForName(c.name, c.type === 'income' ? 'coin' : 'tag')) : 'tag';
const bookIconHtml = b => b.image_url ? '<img src="' + esc(b.image_url) + '" alt="">' : icon(b.icon || 'wallet');
const KIND = { personal: '개인', business: '개인사업자', corp: '법인' };
function txRow(t, opts = {}) {
  const c = catOf(t.category_id), a = acctOf(t.account_id), inc = t.type === 'income';
  const title = t.description || t.vendor || (c && c.name) || '거래';
  const sub = [t.vendor && t.vendor !== title ? t.vendor : '', c ? c.name : '분류 없음', a ? a.name : '', opts.date ? shortDate(t.date) + (isMobile() ? '' : ' ' + weekday(t.date)) : '', isMobile() ? '' : t.time || ''].filter(Boolean).join(' · ');
  return '<button class="tx ' + (inc ? 'r-in' : 'r-out') + '" data-tx="' + t.id + '"><span class="ic ' + (inc ? 'inc' : 'exp') + '">' + icon(catIcon(c)) + '</span><span class="mid"><div class="ttl"><span class="tt">' + esc(title) + '</span>' + (t.recurring_id ? '<span class="rec" title="반복 거래" aria-label="반복 거래">' + icon('repeat') + '</span>' : '') + (t.receipt_path ? '<span class="rec" title="영수증 있음" aria-label="영수증 있음">' + icon('receipt') + '</span>' : '') + '</div><div class="small muted">' + esc(sub) + '</div></span><span class="amt ' + (inc ? 'up' : 'down') + '">' + (inc ? '+' : '−') + won(t.amount) + '</span></button>';
}
function dayGroups(list) {
  const g = {}; list.forEach(t => { (g[t.date] = g[t.date] || []).push(t); });
  return Object.keys(g).sort().reverse().map(d => {
    const s = g[d].reduce((x, t) => { if (t.type === 'income') x.i += +t.amount; else x.e += +t.amount; return x; }, { i: 0, e: 0 });
    return '<div class="dayband"><span class="dl">' + shortDate(d) + ' ' + weekday(d) + '</span><span class="muted">' + g[d].length + '건</span><span class="sp"></span>' + (s.i ? '<span class="up">+' + won(s.i) + '</span>' : '') + (s.e ? '<span class="down">−' + won(s.e) + '</span>' : '') + '</div>' + g[d].map(t => txRow(t)).join('');
  }).join('');
}
const sortTx = list => list.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || String(b.created_at || '').localeCompare(String(a.created_at || '')));
const mstep = (attr, m, max) => '<span class="mstep"><button data-' + attr + '="-1" aria-label="이전 달">' + icon('left') + '</button><span>' + m.slice(0, 4) + '년 ' + monthLabel(m) + '</span><button data-' + attr + '="1" aria-label="다음 달"' + (m >= max ? ' disabled' : '') + '>' + icon('right') + '</button></span>';

/* ---------- charts ---------- */
function barChart(s, W = CW.bar, act = s.length - 1) {
  const H = W < 520 ? 240 : 300, L = 48, R = 16, Tp = 40, B = 34;
  const max = Math.max(1, ...s.map(d => Math.max(d.inc, d.exp)));
  const step = [100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000].find(v => max / v <= 4) || 20000000;
  const top = Math.ceil(max / step) * step, y = v => Tp + (H - Tp - B) * (1 - v / top);
  const gw = (W - L - R) / s.length, bw = Math.min(16, gw / 6);
  let g = '';
  for (let v = 0; v <= top; v += step) g += '<text x="' + (L - 12) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="13" fill="var(--muted)">' + (v / 10000).toLocaleString('ko-KR') + '만</text>';
  for (let i = 1; i < s.length; i++) g += '<line x1="' + (L + gw * i) + '" x2="' + (L + gw * i) + '" y1="' + Tp + '" y2="' + y(0) + '" stroke="var(--line)" stroke-dasharray="2 6"/>';
  g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--line)"/>';
  const pts = []; let bars = '', hits = '';
  s.forEach((d, i) => {
    const cx = L + gw * i + gw / 2, last = i === act, op = last ? 1 : .45;
    const pill = (x, v, gid) => { const h = Math.max(bw, y(0) - y(v)); return v ? '<rect x="' + x + '" y="' + (y(0) - h) + '" width="' + bw + '" height="' + h + '" rx="' + bw / 2 + '" fill="url(#' + gid + ')" opacity="' + op + '"/>' : ''; };
    bars += pill(cx - bw - 4, d.inc, 'gI') + pill(cx + 4, d.exp, 'gE');
    bars += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="13" fill="' + (last ? 'var(--ink)' : 'var(--muted)') + '">' + monthLabel(d.m) + '</text>';
    pts.push([cx, y(Math.max(0, d.inc - d.exp)), d.inc - d.exp]);
    hits += '<rect class="hit" x="' + (L + gw * i) + '" y="' + Tp + '" width="' + gw + '" height="' + (H - Tp) + '" fill="transparent" data-m="' + d.m + '" data-inc="' + d.inc + '" data-exp="' + d.exp + '"/>';
  });
  let line = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; const yb = y(0), c1 = Math.min(yb, p1[1] + (p2[1] - p0[1]) / 6), c2 = Math.min(yb, p2[1] - (p3[1] - p1[1]) / 6); line += ' C' + (p1[0] + (p2[0] - p0[0]) / 6) + ' ' + c1 + ',' + (p2[0] - (p3[0] - p1[0]) / 6) + ' ' + c2 + ',' + p2[0] + ' ' + p2[1]; }
  const lp = pts[act], tag = (lp[2] >= 0 ? '+' : '−') + Math.round(Math.abs(lp[2]) / 10000).toLocaleString('ko-KR') + '만', tw = tag.length * 8 + 20, ty = Math.max(2, lp[1] - 44);
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 6개월 ' + T('in') + '과 ' + T('out') + '"><defs><linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".35"/></linearGradient><linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--coral)"/><stop offset="1" stop-color="var(--coral)" stop-opacity=".35"/></linearGradient><radialGradient id="gH"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient></defs>' + g + bars +
    '<path d="' + line + '" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" opacity=".85"/><circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="28" fill="url(#gH)"/><circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="5.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>' +
    '<g transform="translate(' + Math.min(W - tw, lp[0] - tw / 2) + ' ' + ty + ')"><rect width="' + tw + '" height="26" rx="13" fill="var(--accent)"/><text x="' + tw / 2 + '" y="17.5" text-anchor="middle" font-size="13" fill="var(--on-accent)">' + tag + '</text></g>' + hits + '</svg>';
}
function areaChart(vals, labels) {
  CH.area = [vals, labels];
  const W = CW.area, H = W < 520 ? 180 : 220, L = 12, R = 12, Tp = 44, B = 30, n = vals.length;
  const mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * 0.15 || Math.abs(mx) * 0.1 || 1;
  const x = i => L + (W - L - R) * i / (n - 1), y = v => Tp + (H - Tp - B) * (1 - (v - (mn - pad)) / ((mx + pad) - (mn - pad)));
  let line = 'M' + x(0) + ' ' + y(vals[0]);
  for (let i = 0; i < n - 1; i++) { const a = [x(Math.max(0, i - 1)), y(vals[Math.max(0, i - 1)])], b = [x(i), y(vals[i])], c = [x(i + 1), y(vals[i + 1])], d = [x(Math.min(n - 1, i + 2)), y(vals[Math.min(n - 1, i + 2)])]; line += ' C' + (b[0] + (c[0] - a[0]) / 6) + ' ' + (b[1] + (c[1] - a[1]) / 6) + ',' + (c[0] - (d[0] - b[0]) / 6) + ' ' + (c[1] - (d[1] - b[1]) / 6) + ',' + c[0] + ' ' + c[1]; }
  const dlt = vals[n - 1] - vals[n - 2], tag = (dlt >= 0 ? '+' : '−') + Math.round(Math.abs(dlt) / 10000).toLocaleString('ko-KR') + '만', tw = tag.length * 8 + 20;
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 6개월 순자산"><defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
    labels.map((m, i) => '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '" font-size="13" fill="' + (i === n - 1 ? 'var(--ink)' : 'var(--muted)') + '">' + m + '</text>').join('') +
    '<path d="' + line + ' L' + x(n - 1) + ' ' + (H - B) + ' L' + x(0) + ' ' + (H - B) + ' Z" fill="url(#gA)"/><path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/>' +
    '<circle cx="' + x(n - 1) + '" cy="' + y(vals[n - 1]) + '" r="5.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/><g transform="translate(' + (x(n - 1) - tw) + ' ' + Math.max(2, y(vals[n - 1]) - 40) + ')"><rect width="' + tw + '" height="26" rx="13" fill="var(--accent)"/><text x="' + tw / 2 + '" y="17.5" text-anchor="middle" font-size="13" fill="var(--on-accent)">' + tag + '</text></g></svg>';
}
const OP = [1, .74, .52, .36, .24, .16];
function assetBar() {
  const groups = assetGroups().filter(g => g.sum > 0), gross = groups.reduce((x, g) => x + g.sum, 0) || 1;
  const col = i => 'color-mix(in srgb, var(--accent) ' + Math.round(OP[Math.min(i, 5)] * 100) + '%, var(--mixbase))';
  return '<div class="abar">' + groups.map((g, i) => '<span style="flex:' + g.sum + ';background:' + col(i) + '"></span>').join('') + '</div><div class="alegend small muted">' + groups.map((g, i) => '<span><i style="background:' + col(i) + '"></i>' + g.label + ' <b>' + Math.round(g.sum / gross * 100) + '%</b></span>').join('') + '</div>';
}
function homeAssetRows() {
  const { bal } = balancesAt(ym(todayStr()));
  const rows = accts().map(a => ({ v: bal[a.id], h: '<button class="row" data-acct="' + a.id + '"><span class="ic inc">' + icon(acctIcon(a)) + '</span><span class="mid"><div>' + esc(a.name) + '</div><div class="small muted">' + acctLabel(a.type) + '</div></span><span class="small strong' + (bal[a.id] < 0 ? ' down' : '') + '">' + won(bal[a.id]) + '</span></button>' }))
    .concat(assets().map(a => ({ v: signedVal(a), h: '<button class="row" data-asset="' + a.id + '"><span class="ic ' + (a.type === 'loan' ? 'exp' : 'inc') + '">' + icon(assetIcon(a.type)) + '</span><span class="mid"><div>' + esc(a.name) + '</div><div class="small muted">' + assetLabel(a.type) + '</div></span><span class="small strong' + (a.type === 'loan' ? ' down' : '') + '">' + won(signedVal(a)) + '</span></button>' })));
  return rows.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 5).map(r => r.h).join('');
}
function assetGroups() {
  const by = {}; assets().forEach(a => { (by[a.type] = by[a.type] || []).push(a); });
  const g = Object.keys(by).map(k => ({ k, label: assetLabel(k), ic: assetIcon(k), list: by[k], sum: by[k].reduce((x, a) => x + signedVal(a), 0) }));
  if (accts().length) { const { bal, tot } = balancesAt(ym(todayStr())); g.push({ k: 'acct', label: '계좌·현금', ic: 'bank', acct: true, bal, list: accts(), sum: tot }); }
  return g.sort((a, b) => b.sum - a.sum);
}

/* ---------- views ---------- */
function compCard(m, type) {
  const isE = type === 'expense', base = isE ? 'var(--coral)' : 'var(--accent)';
  const by = {}; monthTx(m).filter(t => t.type === type).forEach(t => { by[t.category_id || ''] = (by[t.category_id || ''] || 0) + Number(t.amount); });
  const rows = Object.entries(by).map(([id, v]) => ({ c: catOf(id), v })).sort((a, b) => b.v - a.v), sum = rows.reduce((a, r) => a + r.v, 0);
  const col = i => 'color-mix(in srgb, ' + base + ' ' + Math.round(OP[Math.min(i, 5)] * 100) + '%, var(--mixbase))';
  const head = '<div class="card-h"><span class="strong ct">' + monthLabel(m) + ' ' + (isE ? '지출' : '수입') + ' 구성 <span class="small muted">' + rows.length + '개 분류</span></span><span class="small muted">' + (isE ? '−' : '+') + won(sum) + '</span></div>';
  if (!sum) return head + '<div class="empty small">' + monthLabel(m) + '에는 ' + (isE ? T('out') + '이' : T('in') + '이') + ' 없어요</div>';
  const R = 70, C = 2 * Math.PI * R; let off = 0;
  const seg = rows.map((r, i) => { const len = r.v / sum * C, el = '<circle r="' + R + '" cx="90" cy="90" fill="none" stroke="' + col(i) + '" stroke-width="26" stroke-dasharray="' + Math.max(0, len - 2) + ' ' + C + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 90 90)"/>'; off += len; return el; }).join('');
  return head + '<div class="comp"><svg viewBox="0 0 180 180" role="img" aria-label="' + (isE ? '지출' : '수입') + ' 구성">' + seg + '<text x="90" y="86" text-anchor="middle" font-size="13" fill="var(--muted)">' + (isE ? T('out') : T('in')) + '</text><text x="90" y="106" text-anchor="middle" font-size="16" fill="var(--ink)">' + man(sum) + '</text></svg>' +
    '<div class="clist">' + rows.map((r, i) => '<button class="crow" data-compcat="' + (r.c ? r.c.id : '') + '"><i style="background:' + col(i) + '"></i><span class="mid">' + esc(r.c ? r.c.name : '분류 없음') + '</span><b>' + won(r.v) + '</b><span class="small muted">' + Math.round(r.v / sum * 100) + '%</span></button>').join('') + '</div></div>';
}

function heroAccts(m) {
  if (!accts().length) return '';
  const { bal } = balancesAt(m);
  return '<div class="hacc">' + accts().map(a => '<button class="hac" data-acct="' + a.id + '">' + icon(acctIcon(a)) + '<span class="hn">' + esc(a.name) + '</span><b>' + won(bal[a.id]) + '</b></button>').join('') + '</div>';
}
function heroMore(m) {
  const o = outlook(m);
  if (!o) return '';
  const used = o.used == null ? null : Math.round(o.used * 100), time = Math.round(o.day / o.dim * 100), tot = balancesAt(m).tot;
  return '<div class="hmore"><div class="kv"><span class="lbl2">' + (o.past ? monthLabel(m) + ' 남긴 비율' : monthLabel(m) + ' 말 예상 잔액') + '</span><b>' + (o.past ? (used == null ? '—' : (100 - used) + '%') : won(tot + o.inn - o.out)) + '</b></div>' +
    '<div class="ptrack" title="' + T('in') + '의 ' + (used || 0) + '% 사용 · 이번 달 ' + time + '% 지남"><i style="width:' + Math.min(100, used || 0) + '%"></i>' + (o.past ? '' : '<em style="left:' + time + '%"></em>') + '</div><div class="kv small"><span>' + (used == null ? T('in') + ' 없음' : monthLabel(m) + ' ' + T('in') + '의 ' + used + '% 썼어요') + '</span><span>' + (o.past ? monthLabel(m) + ' 마감' : time + '% 지남') + '</span></div>' +
    '<div class="small hcap">' + (o.past ? T('in') + ' 중 쓰지 않고 남긴 비율' : '지금 잔액에 이번 달 남은 반복 거래를 더하고 뺀 예상') + '</div></div>';
}
// Hero tiles: small numbers with a mini chart each. PC: inside the hero card; mobile: a swipeable strip below it.
function heroTiles(m) {
  const t = todayStr(), isNow = m === ym(t), o = outlook(m) || {}, dim = o.dim || 30, day = o.day || dim, s = monthSum(m), pm = addMonths(m, -1);
  // tile = header (icon + label + badge) / value / note / mini chart; the whole tile is a button
  const tile = (go, ic, k, badge, v, note, viz) => '<button class="htile" ' + go + '><span class="hhead"><span class="hic">' + icon(ic) + '</span><span class="small hk">' + k + '</span>' + (badge ? '<span class="small hbadge">' + badge + '</span>' : '') + '</span><span class="hv">' + v + '</span>' + (note ? '<span class="small hnote">' + note + '</span>' : '') + viz + '</button>';
  const daily = mm => { const a = new Array(31).fill(0); monthTx(mm).forEach(x => { if (x.type === 'expense') a[+x.date.slice(8) - 1] += Number(x.amount); }); return a; };
  const cum = a => { let c = 0; return a.map(v => (c += v)); };
  const out = [];
  // 1. spending flow vs last month (cumulative)
  const cn = cum(daily(m)).slice(0, isNow ? day : dim), cp = cum(daily(pm)).slice(0, dimOfM(pm));
  const mx = Math.max(1, ...cn, ...cp), W = 220, H = 60, X = i => (i / Math.max(1, dim - 1)) * W, Y = v => H - 4 - (v / mx) * (H - 12);
  const path = a => a.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
  const sameDay = cp[Math.min(cp.length, cn.length) - 1] || 0, nowV = cn[cn.length - 1] || 0, dd = nowV - sameDay, pct = sameDay ? Math.round(dd / sameDay * 100) : 0;
  const area = cn.length ? path(cn) + 'L' + X(cn.length - 1).toFixed(1) + ' ' + H + 'L0 ' + H + 'Z' : '';
  out.push(tile('data-go="list"', 'trend', '지출 흐름', isNow ? day + '일째' : monthLabel(m) + ' 마감', won(nowV), dd > 0 ? '지난달 같은 날보다 ' + won(dd) + ' 더' + (pct ? ' (▲' + pct + '%)' : '') : dd < 0 ? '지난달 같은 날보다 ' + won(-dd) + ' 덜' + (pct ? ' (▼' + (-pct) + '%)' : '') : '지난달과 같아요',
    '<svg class="hviz" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path d="' + area + '" fill="currentColor" fill-opacity=".10"/><path d="' + path(cp) + '" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><path d="' + path(cn) + '" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><span class="small hleg"><span><i></i>' + monthLabel(m) + '</span><span><i class="dash"></i>' + monthLabel(pm) + '</span></span>'));
  // 2. per-day money (gauge: average so far vs allowed per day)
  const gauge = (val, lim) => { const r = Math.max(0, Math.min(1, lim ? val / lim : 1)), L = 100; return '<div class="hgauge"><i><b style="width:' + Math.round(r * L) + '%"></b></i></div>'; };
  if (isNow) {
    const left = Math.max(0, o.end || 0), dl = dim - day + 1, per = Math.round(left / dl), avg = Math.round(s.exp / Math.max(1, day));
    const st = per <= 0 ? '남은 예산이 없어요' : avg <= per ? '지금 속도면 괜찮아요' : '하루 평균이 ' + won(avg - per) + ' 많아요';
    out.push(tile('data-go="list"', 'wallet', '하루 써도 되는 돈', '남은 ' + dl + '일', per > 0 ? won(per) : '0원', st,
      gauge(avg, per) + '<span class="small hrow"><span>지금 하루 평균</span><span>' + won(avg) + '</span></span>'));
  } else {
    const avg = Math.round(s.exp / dim), pa = Math.round(monthSum(pm).exp / dimOfM(pm)), d2 = avg - pa;
    out.push(tile('data-go="list"', 'wallet', '하루 평균 지출', monthLabel(m), won(avg), d2 > 0 ? monthLabel(pm) + '보다 ' + won(d2) + ' 많아요' : d2 < 0 ? monthLabel(pm) + '보다 ' + won(-d2) + ' 적어요' : monthLabel(pm) + '과 같아요',
      gauge(Math.min(avg, pa), Math.max(avg, pa, 1)) + '<span class="small hrow"><span>' + monthLabel(pm) + ' 하루 평균</span><span>' + won(pa) + '</span></span>'));
  }
  // 3. upcoming payments (7 days) / past: biggest day
  if (isNow) {
    const days = [...Array(7)].map((_, i) => addDays(t, i)), due = upcoming(days[0], days[6]);
    const out_ = due.filter(x => x.r.type === 'expense'), in_ = due.filter(x => x.r.type === 'income');
    const sum = out_.reduce((a, x) => a + Number(x.r.amount || 0), 0), sumI = in_.reduce((a, x) => a + Number(x.r.amount || 0), 0), nx = due[0];
    const sameDay = nx ? due.filter(x => x.d === nx.d) : [];
    const note = nx ? shortDate(nx.d) + ' ' + esc(nx.r.name) + (sameDay.length > 1 ? ' 외 ' + (sameDay.length - 1) + '건' : '') + (due.length > sameDay.length ? ' · 7일간 ' + due.length + '건' : '') : '앞으로 7일은 예정된 거래가 없어요';
    out.push(tile('data-upcoming', 'calendar', '다가오는 거래', '7일', due.length ? (sum ? '−' + won(sum) : '') + (sumI ? (sum ? ' <span class="small up">+' + won(sumI) + '</span>' : '+' + won(sumI)) : '') : '없어요', note,
      '<div class="hdays">' + days.map(d => { const n = due.filter(x => x.d === d), o = n.some(x => x.r.type === 'expense'); return '<span class="hd' + (n.length ? (o ? ' on' : ' inc') : '') + (d === t ? ' today' : '') + '"><em>' + weekday(d) + '</em>' + Number(d.slice(8)) + (n.length > 1 ? '<i class="hn">' + n.length + '</i>' : '') + '</span>'; }).join('') + '</div>'));
  } else {
    const a = daily(m).slice(0, dim), top = Math.max(1, ...a), mi = a.indexOf(Math.max(...a));
    const tx = monthTx(m).filter(x => x.type === 'expense' && +x.date.slice(8) === mi + 1).sort((x, y) => y.amount - x.amount)[0];
    out.push(tile('data-go="list"', 'calendar', '가장 많이 쓴 날', a[mi] ? Number(m.slice(5)) + '.' + String(mi + 1).padStart(2, '0') : '', a[mi] ? won(a[mi]) : '없어요', tx ? esc(tx.description || '') : '',
      '<svg class="hviz" viewBox="0 0 ' + (dim * 7) + ' 60" preserveAspectRatio="none">' + a.map((v, i) => '<rect x="' + (i * 7 + 1) + '" y="' + (60 - Math.max(2, v / top * 56)) + '" width="5" height="' + Math.max(2, v / top * 56) + '" rx="1.5" fill="currentColor" fill-opacity="' + (i === mi ? 1 : .3) + '"/>').join('') + '</svg>'));
  }
  // 4. top categories
  const bc = {}; monthTx(m).forEach(x => { if (x.type === 'expense') bc[x.category_id] = (bc[x.category_id] || 0) + Number(x.amount); });
  const rows = Object.entries(bc).sort((a, b) => b[1] - a[1]), tot = rows.reduce((a, r) => a + r[1], 0), top3 = rows.slice(0, 3), OPS = [1, .55, .3];
  const nm = id => (catOf(id) || {}).name || '분류 없음';
  out.push(tile(top3.length ? 'data-compcat="' + (top3[0][0] || '') + '"' : 'data-go="list"', 'pie', '많이 쓴 분류', rows.length ? rows.length + '개 분류' : '', top3.length ? esc(nm(top3[0][0])) + ' ' + won(top3[0][1]) : '없어요', top3.length ? T('out') + '의 ' + Math.round(top3[0][1] / tot * 100) + '%' : '',
    '<div class="hstack">' + top3.map((r, i) => '<b style="width:' + (r[1] / tot * 100) + '%;opacity:' + OPS[i] + '"></b>').join('') + '</div><span class="small hleg">' + top3.slice(0, 2).map((r, i) => '<span><i style="opacity:' + OPS[i] + '"></i>' + esc(nm(r[0])) + ' ' + Math.round(r[1] / tot * 100) + '%</span>').join('') + '</span>'));
  return out;
}
const dimOfM = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate();
function scoreCard(m) {
  const sc = score(m), ps = score(addMonths(m, -1)), d = sc.v - ps.v;
  const weak = sc.f.slice().sort((a, b) => (a.p / a.max) - (b.p / b.max))[0], gain = weak.max - weak.p;
  const TIP = { '저축률': '남기는 돈을 조금 늘리면', '고정 지출': '고정 지출을 줄이면', '지출 속도': '지출 속도만 조금 늦추면', '기록 습관': '기록을 더 자주 하면' };
  const tip = gain > 0 ? TIP[weak.k] + ' 최대 ' + gain + '점 더 받을 수 있어요' : '모든 항목이 좋아요. 지금처럼만 하면 돼요';
  return '<section class="card score s6 m9"><div class="glow"></div><div class="card-h"><span class="ct">재무 건강 점수</span><span class="small muted">' + monthLabel(m) + ' 기준</span></div>' +
    '<div class="shead"><span class="big">' + sc.v + '</span><span class="sg"><span>' + sc.grade + '</span><span class="small ' + (d >= 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' + d + '점' : d < 0 ? '▼ ' + (-d) + '점' : '지난달과 같아요') + '</span></span></div>' +
    '<div class="bar"><span class="marker" style="left:calc(' + sc.v + '% - 1px)"></span></div><div class="small muted stip">' + tip + '</div>' +
    '<div class="facs">' + sc.f.map(f => '<div class="fac" title="' + esc(f.note) + '"><div class="fr"><span>' + f.k + '</span><span>' + f.v + '</span><span class="fst ' + f.st[1] + '">' + f.p + '/' + f.max + '</span></div><i class="fp"><b class="' + f.st[1] + '" style="width:' + Math.round(f.p / f.max * 100) + '%"></b></i></div>').join('') + '</div></section>';
}
// Totals under recurring lists: per month for active items; with rt (this month's status) also what is still to come.
function recSum(rt) {
  const act = recs().filter(r => r.active !== false); if (!act.length) return '';
  const tot = ty => act.filter(r => r.type === ty).reduce((x, r) => x + Number(r.amount || 0), 0);
  const left = ty => (rt || []).filter(x => !x.done && x.r.type === ty).reduce((a, x) => a + Number(x.r.amount || 0), 0);
  const kv = (k, v, cls) => '<div class="kv small"><span class="muted">' + k + '</span><span class="' + cls + '">' + v + '</span></div>';
  const o = tot('expense'), i = tot('income');
  return '<div class="rsum">' + (rt && rt.length ? kv('이번 달 완료', rt.filter(x => x.done).length + ' / ' + rt.length + '건', '') : '') + (o ? kv('한 달 합계 · ' + T('out'), '−' + won(o), 'down') : '') + (i ? kv('한 달 합계 · ' + T('in'), '+' + won(i), 'up') : '') +
    (rt ? (left('expense') ? kv('이번 달 남은 금액 · ' + T('out'), '−' + won(left('expense')), 'down') : '') + (left('income') ? kv('이번 달 남은 금액 · ' + T('in'), '+' + won(left('income')), 'up') : '') : '') + '</div>';
}
// Recurring items (in and out) due between from and to that are not recorded yet, by date.
function upcoming(from, to) {
  const due = [];
  recs().filter(r => r.active !== false).forEach(r => [ym(from), addMonths(ym(from), 1)].forEach(mm => { const d = dueDate(r, mm); if (d >= from && d <= to && !recDone(r, mm)) due.push({ r, d }); }));
  return due.sort((a, b) => a.d.localeCompare(b.d) || (a.r.type === b.r.type ? 0 : a.r.type === 'income' ? 1 : -1));
}
function openUpcoming() {
  const t = todayStr(), end = addDays(t, 6), list = upcoming(t, end), later = upcoming(addDays(t, 7), addDays(t, 37));
  const row = x => '<button class="row" data-uprec="' + x.r.id + '" data-updue="' + x.d + '"><span class="ic ' + (x.r.type === 'income' ? 'inc' : 'exp') + '">' + icon('repeat') + '</span><span class="mid"><div>' + esc(x.r.name) + '</div><div class="small muted">' + (x.d === t ? '오늘' : x.d === addDays(t, 1) ? '내일' : (Math.round((new Date(x.d) - new Date(t)) / 864e5)) + '일 뒤') + ' · 눌러서 기록</div></span><span class="strong ' + (x.r.type === 'income' ? 'up' : 'down') + '">' + (x.r.type === 'income' ? '+' : '−') + won(x.r.amount) + '</span></button>';
  const byDay = l => { const g = {}; l.forEach(x => { (g[x.d] = g[x.d] || []).push(x); }); return Object.keys(g).map(d => { const o = g[d].filter(x => x.r.type === 'expense').reduce((a, x) => a + Number(x.r.amount || 0), 0), i = g[d].filter(x => x.r.type === 'income').reduce((a, x) => a + Number(x.r.amount || 0), 0); return '<div class="dayband"><span class="dl">' + shortDate(d) + ' ' + weekday(d) + '</span><span class="muted">' + g[d].length + '건' + (o ? ' · −' + won(o) : '') + (i ? ' · +' + won(i) : '') + '</span></div>' + g[d].map(row).join(''); }).join(''); };
  const tot = (l, ty) => l.filter(x => x.r.type === ty).reduce((a, x) => a + Number(x.r.amount || 0), 0);
  const html = '<div class="rsum" style="margin:0 0 8px">' + '<div class="kv small"><span class="muted">7일 예정 · ' + T('out') + '</span><span class="down">−' + won(tot(list, 'expense')) + '</span></div>' + (tot(list, 'income') ? '<div class="kv small"><span class="muted">7일 예정 · ' + T('in') + '</span><span class="up">+' + won(tot(list, 'income')) + '</span></div>' : '') + '</div>' +
    (list.length ? byDay(list) : '<div class="empty small">앞으로 7일은 예정된 거래가 없어요</div>') +
    (later.length ? '<div class="card-h" style="margin-top:16px"><span class="strong">그 다음 30일</span></div>' + byDay(later) : '');
  sheet('다가오는 거래', html, { click: e => { const b = e.target.closest('[data-uprec]'); if (b) { closeSheet(); recordRec(b.dataset.uprec, b.dataset.updue); } } });
}
function homeView() {
  const m = V.month, now = monthSum(m), prev = monthSum(addMonths(m, -1)), net = now.inc - now.exp, diff = net - (prev.inc - prev.exp), sc = score(m);
  const recent = sortTx(bookTx()), shown = recent.slice(0, V.showN), rest = recent.length - shown.length;
  const rt = recThisMonth(), alerts = computeAlerts(), isP = book().kind === 'personal';
  const nw = netWorthAt(ym(todayStr())), nwd = nw - netWorthAt(addMonths(ym(todayStr()), -1));
  CH.avg = null; const nM = 6, s6 = series(m, nM), nUsed = Math.max(1, s6.filter(d => d.inc || d.exp).length), avgI = s6.reduce((x, d) => x + d.inc, 0) / nUsed, avgE = s6.reduce((x, d) => x + d.exp, 0) / nUsed; CH.s = s6; CH.avg = [avgI, avgE]; CH.act = s6.length - 1;
  const col = isP ? 's4' : 's6';
  const tiles = heroTiles(m), mob = isMobile();
  const past = m < ym(todayStr()), tot = balancesAt(m).tot;
  return '<section class="card hero s12 m1"><div class="hgrid"><div class="hl"><div class="card-h">' + mstep('hm', m, ym(todayStr())).replace('<span>' + m.slice(0, 4) + '년 ' + monthLabel(m), '<span class="muted">' + (past ? monthLabel(m) + ' 말 ' + T('cash') : monthLabel(m) + ' ' + T('cash') + ' · 오늘 기준')) + '</div>' +
      '<div class="num">' + won(tot) + '</div><div class="small hcap">' + (accts().length ? (past ? monthLabel(m) + ' 마지막 날 ' : '오늘 ') + '계좌와 현금 잔액을 모두 더한 금액이에요' : '계좌·현금을 추가하면 잔액 합계가 보여요') + '</div>' + heroAccts(m) +
      '<div class="stats three"><div><span class="small muted lbl in"><svg viewBox="0 0 18 18"><path d="M5 9h8M9 5v8"/></svg>' + (isMobile() ? '' : monthLabel(m) + ' ') + T('in') + '</span><span class="v">+' + won(now.inc) + '</span></div><div><span class="small muted lbl out"><svg viewBox="0 0 18 18"><path d="M5 9h8"/></svg>' + (isMobile() ? '' : monthLabel(m) + ' ') + T('out') + '</span><span class="v">−' + won(now.exp) + '</span></div><div title="지난달보다 ' + signed(diff) + '"><span class="small muted lbl ' + (diff >= 0 ? 'in' : 'out') + '"><svg viewBox="0 0 18 18">' + (diff >= 0 ? '<path d="M9 13V5M5.5 8.5L9 5l3.5 3.5"/>' : '<path d="M9 5v8M5.5 9.5L9 13l3.5-3.5"/>') + '</svg>' + (isMobile() ? '' : monthLabel(m) + ' ') + T('net') + '</span><span class="v">' + signed(net) + '</span></div></div>' +
      heroMore(m) + '</div>' +
      (mob ? '' : '<div class="hr"><div class="htiles">' + tiles.join('') + '</div></div>') + '</div></section>' +
    (mob ? '<div class="hstrip m2">' + tiles.join('') + '</div>' : '') +
    '<section class="card s12 m3"><div class="card-h"><span class="strong ct">최근 거래 <span class="small muted">' + recent.length + '건</span></span><button class="golink" data-go="list">전체 보기 ›</button></div><div>' + (shown.length ? shown.map(t => txRow(t, { date: true })).join('') : '<div class="empty">아직 거래가 없어요. 거래 추가로 시작해 보세요.</div>') + '</div>' + (rest > 0 ? '<button class="more" data-more>' + Math.min(10, rest) + '건 더 보기</button>' : '') + '</section>' +
    '<section class="card ' + col + ' m4"><div class="card-h"><span class="strong ct">이번 달 반복 거래</span>' + '<button class="golink" data-go="settings">관리 ›</button></div>' +
      (rt.length ? rt.slice().sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due)).slice(0, 7).map(({ r, due, done }) => '<button class="row" data-rec="' + r.id + '"><span class="mid"><div>' + esc(r.name) + '</div><div class="small muted">' + shortDate(due) + ' · ' + (done ? '완료' : '예정') + '</div></span><span class="small strong ' + (r.type === 'income' ? 'up' : 'down') + '">' + won(r.amount) + '</span></button>').join('') : '<div class="empty small">등록된 반복 거래가 없어요</div>') + recSum(rt) + '</section>' +
    '<section class="card ' + col + ' m5"><div class="card-h"><span class="strong ct">알림 <span class="small muted">' + (alerts.length ? alerts.length + '건' : '') + '</span></span><button class="golink" data-go="alerts">전체 보기 ›</button></div>' + (alerts.length ? alerts.slice(0, 5).map(a => alertRow(a, true)).join('') : '<div class="empty small">지금은 알릴 게 없어요</div>') + '</section>' +
    (isP ? '<section class="card s4 m6"><div class="card-h"><span class="strong ct">내 자산</span><button class="golink" data-go="assets">자산 보기 ›</button></div><div class="kv"><span class="muted">순자산</span><span class="strong">' + won(nw) + '</span></div><div class="kv small"><span class="muted">지난달보다</span><span class="' + (nwd >= 0 ? 'up' : 'down') + '">' + signed(nwd) + '</span></div>' + (assetGroups().length ? assetBar() + '<div>' + homeAssetRows() + '</div>' : '<div class="small muted">예금, 주식, 코인, 부동산, 대출을 적어 두면 순자산 추이를 보여드려요.</div>') + '</section>' : '') +
    '<section class="card s6 m7">' + compCard(m, 'expense') + '</section>' +
    '<section class="card s6 m8">' + compCard(m, 'income') + '</section>' +
    scoreCard(m) +
    '<section class="card chart s6 m9"><div class="card-h"><span class="strong ct">최근 ' + nM + '개월</span><span class="legend small muted"><span><i style="background:var(--accent)"></i>' + T('in') + '</span><span><i style="background:var(--coral)"></i>' + T('out') + '</span><span>— ' + T('left') + '</span></span></div>' + '<div class="cbox">' + barChart(s6, 760) + '</div>' +
      '<div class="stats three cstats" style="margin-top:0">' + chartStats('월평균 ', avgI, avgE) + '</div></section>';
}

function advFilter(list, a) {
  return list.filter(t => {
    const m = t.date.slice(0, 7), v = Number(t.amount);
    if (a.from && m < a.from) return false;
    if (a.to && m > a.to) return false;
    if (a.kind && a.kind !== 'all' && t.type !== a.kind) return false;
    if (a.min && v < a.min) return false;
    if (a.max && v > a.max) return false;
    if (a.cats && a.cats.length && !a.cats.includes(t.category_id)) return false;
    if (a.accts && a.accts.length && !a.accts.includes(t.account_id)) return false;
    if (a.rc === 'yes' && !t.receipt_path) return false;
    if (a.rc === 'no' && t.receipt_path) return false;
    if (a.text) { const q = a.text.toLowerCase(); if (![t.description, t.vendor, t.memo].join(' ').toLowerCase().includes(q)) return false; }
    return true;
  });
}
function advSummary(a) {
  const p = [];
  p.push((a.from ? a.from.replace('-', '.') : '처음') + ' ~ ' + (a.to ? a.to.replace('-', '.') : '지금'));
  if (a.kind && a.kind !== 'all') p.push(a.kind === 'income' ? T('in') : T('out'));
  if (a.min || a.max) p.push((a.min ? won(a.min) : '') + ' ~ ' + (a.max ? won(a.max) : ''));
  if (a.cats && a.cats.length) p.push(a.cats.map(id => (catOf(id) || {}).name).filter(Boolean).join(', '));
  if (a.accts && a.accts.length) p.push(a.accts.map(id => (acctOf(id) || {}).name).filter(Boolean).join(', '));
  if (a.rc === 'yes') p.push('영수증 있음'); else if (a.rc === 'no') p.push('영수증 없음');
  if (a.text) p.push('"' + a.text + '"');
  return p.join(' · ');
}
function monthGroups(list) {
  const g = {}; list.forEach(t => { (g[t.date.slice(0, 7)] = g[t.date.slice(0, 7)] || []).push(t); });
  return Object.keys(g).sort().reverse().map(m => {
    const s = g[m].reduce((x, t) => { if (t.type === 'income') x.i += +t.amount; else if (t.type === 'expense') x.e += +t.amount; return x; }, { i: 0, e: 0 });
    return '<div class="mband"><span class="strong">' + m.slice(0, 4) + '년 ' + monthLabel(m) + '</span><span class="muted">' + g[m].length + '건</span><span class="sp"></span><span class="up">+' + won(s.i) + '</span><span class="down">−' + won(s.e) + '</span><span class="strong">' + signed(s.i - s.e) + '</span></div>' + dayGroups(g[m]);
  }).join('');
}
// Filter chip: optional tinted icon, label and count.
const chip = (attr, on, cls, label, n, ic) => '<button class="pill chip ' + cls + '" ' + attr + ' aria-pressed="' + on + '">' + (ic ? '<span class="cic">' + ic + '</span>' : '') + label + '<span class="cn">' + n + '</span></button>';
// Summary at the top of the transaction list: in / out tiles, then what is left with an in-vs-out bar.
function listSummary(s, list) {
  const net = s.inc - s.exp, tot = s.inc + s.exp, pi = tot ? s.inc / tot * 100 : 50, used = s.inc ? Math.round(s.exp / s.inc * 100) : null;
  return '<div class="lsum">' +
    '<div class="lt in"><span class="lic">' + icon('plus') + '</span><span class="small muted">' + T('in') + '</span><span class="v up">+' + won(s.inc) + '</span></div>' +
    '<div class="lt out"><span class="lic">' + icon('minus') + '</span><span class="small muted">' + T('out') + '</span><span class="v down">−' + won(s.exp) + '</span></div>' +
    '<div class="lt net"><div class="kv"><span class="small muted">' + T('left') + ' · ' + list.length + '건</span><span class="v">' + signed(net) + '</span></div>' +
      '<div class="lbar"><i class="bi" style="flex:' + pi.toFixed(1) + '"></i><i class="bo" style="flex:' + (100 - pi).toFixed(1) + '"></i></div>' +
      '<span class="small muted">' + (used == null ? (s.exp ? T('in') + ' 없이 ' + T('out') + '만 있어요' : '이 기간에는 거래가 없어요') : T('in') + '의 ' + used + '%를 썼어요') + '</span></div></div>';
}
function listView() {
  const q = V.q.trim().toLowerCase(), m = V.lm, adv = V.adv;
  let list = bookTx();
  if (adv) list = advFilter(list, adv);
  else if (q) list = list.filter(t => [t.description, t.vendor, t.memo, (catOf(t.category_id) || {}).name].join(' ').toLowerCase().includes(q));
  else list = list.filter(t => t.date.startsWith(m));
  const base = list;
  if (V.kind !== 'all') list = list.filter(t => t.type === V.kind);
  if (V.catF) list = list.filter(t => t.category_id === V.catF);
  const s = sumOf(list), used = [...new Set(base.map(t => t.category_id))].map(catOf).filter(Boolean);
  const head = adv ? '<span class="strong">상세 검색 결과 <span class="small muted">' + list.length + '건</span></span><span class="acts-h"><button class="btn-ghost" data-advopen>조건 바꾸기</button><button class="btn-ghost" data-advoff>' + icon('x') + '해제</button></span>'
    : q ? '<span class="strong">검색 결과 <span class="small muted">전체 기간 · ' + list.length + '건</span></span><button class="btn-ghost" data-advopen>' + icon('search') + '상세 검색</button>'
    : mstep('lm', m, ym(todayStr())) + '<button class="btn-ghost" data-advopen>' + icon('search') + '상세 검색</button>';
  return '<section class="card s12"><div class="lv" data-live="a"><div class="card-h">' + head + '</div>' +
      (adv ? '<div class="small muted">' + esc(advSummary(adv)) + '</div>' : '') +
      listSummary(s, list) +
      '</div>' + (isMobile() && !adv ? '<label class="search m">' + icon('search') + '<input id="q" type="search" placeholder="내용·거래처·메모·분류로 찾기" value="' + esc(V.q) + '" autocomplete="off"></label>' : '') +
      '<div class="lv" data-live="b"><div class="pills scroll chips">' + chip('data-kind="all"', V.kind === 'all', '', '전체', base.length) + chip('data-kind="income"', V.kind === 'income', 'kin', T('in'), base.filter(t => t.type === 'income').length) + chip('data-kind="expense"', V.kind === 'expense', 'kout', T('out'), base.filter(t => t.type === 'expense').length) +
        '<span class="chip-sep" aria-hidden="true"></span>' + used.map(c => chip('data-catf="' + c.id + '"', V.catF === c.id, c.type === 'income' ? 'cin' : 'cout', esc(c.name), base.filter(t => t.category_id === c.id).length, icon(catIcon(c)))).join('') + '</div>' +
      '<div>' + (list.length ? ((adv || q) ? monthGroups(sortTx(list)) : dayGroups(list)) : '<div class="empty">' + (adv || q ? '찾는 거래가 없어요' : '이 달에는 거래가 없어요') + '</div>') + '</div></div></section>';
}
function openAdv() {
  const a = Object.assign({ from: addMonths(ym(todayStr()), -2), to: ym(todayStr()), kind: 'all', min: null, max: null, cats: [], accts: [], text: '', rc: 'all' }, V.adv || {});
  a.cats = (a.cats || []).slice(); a.accts = (a.accts || []).slice();
  const fmtW = v => v ? Number(v).toLocaleString('ko-KR') : '';
  const num = id => Number((document.getElementById(id).value || '').replace(/[^0-9]/g, '')) || null;
  const draw = () => sheet('상세 검색',
    '<div class="tx2"><div class="col">' +
      '<div class="grid2"><label class="field"><span>시작 월</span><input id="advFrom" type="month" value="' + (a.from || '') + '"></label><label class="field"><span>끝 월</span><input id="advTo" type="month" value="' + (a.to || '') + '" max="' + ym(todayStr()) + '"></label></div>' +
      '<div class="chips">' + [['이번 달', 0], ['3개월', -2], ['6개월', -5], ['올해', 'y'], ['전체', 'all']].map(([l, k]) => '<button class="chip" data-advq="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<div class="seg three"><button data-advk="all" aria-pressed="' + (a.kind === 'all') + '">전체</button><button class="inc" data-advk="income" aria-pressed="' + (a.kind === 'income') + '">' + T('in') + '</button><button class="exp" data-advk="expense" aria-pressed="' + (a.kind === 'expense') + '">' + T('out') + '</button></div>' +
      '<div class="grid2"><label class="field"><span>최소 금액</span><input id="advMin" inputmode="numeric" data-won value="' + fmtW(a.min) + '" placeholder="0"></label><label class="field"><span>최대 금액</span><input id="advMax" inputmode="numeric" data-won value="' + fmtW(a.max) + '" placeholder="제한 없음"></label></div>' +
      '<label class="field"><span>내용·거래처·메모</span><input id="advText" value="' + esc(a.text || '') + '" placeholder="예: 쿠팡"></label>' +
      '<div class="field"><span>영수증</span><div class="seg three"><button data-advr="all" aria-pressed="' + (a.rc === 'all') + '">전체</button><button data-advr="yes" aria-pressed="' + (a.rc === 'yes') + '">영수증 있음</button><button data-advr="no" aria-pressed="' + (a.rc === 'no') + '">영수증 없음</button></div></div>' +
    '</div><div class="col">' +
      '<div class="field"><span>분류 (여러 개 고를 수 있어요)</span><div class="chips">' + cats().map(c => '<button class="chip" data-advc="' + c.id + '" aria-pressed="' + a.cats.includes(c.id) + '">' + icon(catIcon(c)) + esc(c.name) + '</button>').join('') + '</div></div>' +
      '<div class="field"><span>계좌·카드</span><div class="chips">' + accts().map(x => '<button class="chip" data-adva="' + x.id + '" aria-pressed="' + a.accts.includes(x.id) + '">' + icon(acctIcon(x)) + esc(x.name) + '</button>').join('') + '</div></div>' +
    '</div></div>' +
    '<div class="acts"><button class="btn-line" data-advreset>조건 지우기</button><button class="save" data-advgo>검색</button></div>', handlers, 'wide');
  const read = () => { a.from = document.getElementById('advFrom').value; a.to = document.getElementById('advTo').value; a.min = num('advMin'); a.max = num('advMax'); a.text = document.getElementById('advText').value.trim(); };
  const handlers = {
    input: e => { if (e.target.hasAttribute('data-won')) { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v ? Number(v).toLocaleString('ko-KR') : ''; } },
    keydown: e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); layer.querySelector('[data-advgo]').click(); } },
    click: e => {
      const t = e.target, nowM = ym(todayStr());
      const qk = t.closest('[data-advq]'); if (qk) { read(); const k = qk.dataset.advq; a.to = nowM; a.from = k === 'all' ? '' : k === 'y' ? nowM.slice(0, 4) + '-01' : addMonths(nowM, +k); draw(); return; }
      const kk = t.closest('[data-advk]'); if (kk) { a.kind = kk.dataset.advk; pick('advk', kk); return; }
      const rr = t.closest('[data-advr]'); if (rr) { a.rc = rr.dataset.advr; pick('advr', rr); return; }
      const cc = t.closest('[data-advc]'); if (cc) { const id = cc.dataset.advc, i = a.cats.indexOf(id); if (i >= 0) a.cats.splice(i, 1); else a.cats.push(id); cc.setAttribute('aria-pressed', i < 0); return; }
      const aa = t.closest('[data-adva]'); if (aa) { const id = aa.dataset.adva, i = a.accts.indexOf(id); if (i >= 0) a.accts.splice(i, 1); else a.accts.push(id); aa.setAttribute('aria-pressed', i < 0); return; }
      if (t.closest('[data-advreset]')) { Object.assign(a, { from: addMonths(nowM, -2), to: nowM, kind: 'all', min: null, max: null, cats: [], accts: [], text: '', rc: 'all' }); draw(); return; }
      if (t.closest('[data-advgo]')) { read(); V.adv = a; V.q = ''; V.kind = 'all'; V.catF = ''; V.view = 'list'; closeSheet(); render(); window.scrollTo(0, 0); }
    }
  };
  draw();
}

function alertRow(a, compact) {
  const b = (attr, ic, label, tip) => '<button class="btn-ghost' + (compact ? ' icon' : '') + '" ' + attr + ' title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' + icon(ic) + (compact ? '' : esc(label)) + '</button>';
  const tp = a.title.split(' · '), t1 = compact && tp.length > 1 ? tp[0] : a.title, s1 = compact && tp.length > 1 ? tp.slice(1).join(' · ') + ' · ' + a.sub.split(' · ')[0] : a.sub;
  return '<div class="tx al"><span class="ic ' + (a.warn ? 'warn' : 'inc') + '">' + icon(a.ic) + '</span><span class="mid"><div>' + esc(t1) + '</div><div class="small muted">' + esc(s1) + '</div></span>' +
    '<div class="acts-al">' + (a.act ? b('data-aact="' + esc(a.id) + '"', a.actIc || 'right', a.actLabel, a.actLabel) : '') + b('data-adone="' + esc(a.id) + '"', 'check', '확인', '확인하고 지우기') + '</div></div>';
}
function alertsView() {
  const all = computeAlerts(), list = all.filter(a => V.alF === 'all' || a.t === V.alF), unread = all.filter(a => a.unread);
  const T = [['all', '전체'], ['rec', '반복 거래'], ['odd', '평소와 다름'], ['check', '확인 필요']];
  const g = {}; list.forEach(a => { (g[a.d] = g[a.d] || []).push(a); });
  const t = todayStr(), label = d => d === t ? '오늘' : shortDate(d) + ' ' + weekday(d);
  setTimeout(() => markSeen(all.map(a => a.id)), 1500);
  return '<section class="card s8"><div class="card-h"><span class="strong ct">알림 <span class="small muted">' + (unread.length ? '새 알림 ' + unread.length + '건' : all.length ? '모두 읽었어요' : '') + '</span></span></div>' +
      '<div class="pills scroll">' + T.map(([k, l]) => '<button class="pill" data-alf="' + k + '" aria-pressed="' + (V.alF === k) + '">' + l + ' <span class="muted">' + (k === 'all' ? all.length : all.filter(a => a.t === k).length) + '</span></button>').join('') + '</div>' +
      (list.length ? Object.keys(g).sort().reverse().map(d => '<div class="dayband"><span class="dl">' + label(d) + '</span><span class="muted">' + g[d].length + '건</span></div>' + g[d].map(a => alertRow(a)).join('')).join('') : '<div class="empty">지금은 알릴 게 없어요</div>') + '</section>' +
    '<section class="card s4" style="align-self:start"><span class="strong ct">알려드리는 것</span><p class="small muted hint">반복 거래 결제·입금 3일 전부터, 기록되지 않은 반복 거래, 분류별로 평소보다 많이 쓴 달, 같은 날 같은 금액(중복 의심), 3달 연속 비슷한 거래(반복 등록 제안), 반복 거래 금액이 바뀐 경우를 알려드려요.</p><p class="small muted hint">"확인"을 누르면 이 기기에서 그 알림이 사라져요.</p></section>';
}

function assetsView() {
  const nowM = ym(todayStr()), months = [-5, -4, -3, -2, -1, 0].map(k => addMonths(nowM, k)), vals = months.map(netWorthAt);
  const nw = vals[5], d = nw - vals[4], gross = assets().filter(a => a.type !== 'loan').reduce((x, a) => x + Number(a.value || 0), 0) + balancesAt(nowM).tot, debt = assets().filter(a => a.type === 'loan').reduce((x, a) => x + Number(a.value || 0), 0);
  const groups = assetGroups().map(g => '<div class="grp"><span class="strong">' + g.label + '</span><span class="muted">' + g.list.length + '개</span><span class="sp"></span><span class="strong' + (g.sum < 0 ? ' down' : '') + '">' + won(g.sum) + '</span></div>' +
    (g.acct ? g.list.map(a => '<button class="row" data-acct="' + a.id + '"><span class="ic inc">' + icon(acctIcon(a)) + '</span><span class="mid"><div>' + esc(a.name) + '</div><div class="small muted">' + acctLabel(a.type) + ' · 거래로 자동 계산</div></span><span class="strong' + (g.bal[a.id] < 0 ? ' down' : '') + '">' + won(g.bal[a.id]) + '</span>' + icon('right') + '</button>').join('') : '') +
    (g.acct ? [] : g.list).map(a => '<button class="row" data-asset="' + a.id + '"><span class="ic ' + (a.type === 'loan' ? 'exp' : 'inc') + '">' + icon(g.ic) + '</span><span class="mid"><div>' + esc(a.name) + '</div><div class="small muted">' + assetSub(a) + '</div></span><span class="strong' + (a.type === 'loan' ? ' down' : '') + '">' + won(signedVal(a)) + '</span>' + icon('right') + '</button>').join('')).join('');
  return '<div class="m1 s12" style="display:contents"></div>' + (isMobile() ? '<div><button class="golink" data-go="home">‹ 홈</button></div>' : '') +
    '<section class="card hero s5"><div class="card-h"><span class="muted">순자산</span><span class="tag">' + monthLabel(nowM) + ' 기준</span></div><div class="num">' + won(nw) + '</div><div class="stats three"><div><span class="small muted">가진 자산</span><span class="v">' + man(gross) + '</span></div><div><span class="small muted">대출</span><span class="v">−' + man(debt) + '</span></div><div><span class="small muted">지난달보다</span><span class="v">' + signed(d) + '</span></div></div></section>' +
    '<section class="card chart s7"><div class="card-h"><span class="strong ct">순자산 추이</span><span class="small muted">최근 6개월 · 매달 말</span></div>' + '<div class="abox">' + areaChart(vals, months.map(monthLabel)) + '</div>' + '</section>' +
    (assetGroups().length ? '<section class="card s12"><div class="card-h"><span class="strong ct">자산 구성</span><span class="small muted">대출 제외</span></div>' + assetBar() + '</section>' : '') +
    '<section class="card s12"><div class="card-h"><span class="strong ct">내 자산</span><span class="small muted">금액을 고치면 그날 기록으로 남아요</span></div>' + (groups || '<div class="empty">아직 적어 둔 자산이 없어요</div>') + (accts().length ? '<p class="small muted hint">계좌·현금은 거래 기록으로 잔액이 자동 계산돼요. 같은 통장을 자산에 또 적지 않아도 돼요.</p>' : '') + '<button class="btn-dash" data-addasset>' + icon('plus') + '자산 추가</button><p class="small muted hint">투자 조언은 하지 않고, 적어 주신 금액으로 기록과 추이만 보여드려요.</p></section>';
}

function settingsView() {
  const b = book(), list = cats(V.setKind);
  const cnt = id => bookTx().filter(t => t.category_id === id).length;
  const seg = [['dark', '다크'], ['light', '라이트 아이보리'], ['system', '기기 설정 따라']].map(o => '<button data-theme="' + o[0] + '" aria-pressed="' + (theme === o[0]) + '">' + o[1] + '</button>').join('');
  return '<section class="card s5"><div class="card-h"><span class="strong ct">장부</span><span class="small muted">' + KIND[b.kind] + '</span></div>' +
      '<div class="bookid"><button class="bdot" data-bpick aria-label="아이콘 바꾸기">' + bookIconHtml(b) + '</button><label class="field" style="flex:1"><span>장부 이름</span><input id="bkName" value="' + esc(b.name) + '" maxlength="20"></label></div>' +
      (V.bpick ? '<div class="ipick">' + ['wallet', 'store', 'building', 'house', 'coin', 'card', 'cup', 'people', 'bag', 'heart', 'book', 'trend'].map(k => '<button data-bicon="' + k + '" aria-pressed="' + (!b.image_url && b.icon === k) + '" aria-label="' + k + '">' + icon(k) + '</button>').join('') + '</div><label class="btn-dash" style="cursor:pointer">' + icon('image') + '내 이미지 올리기<input type="file" accept="image/*" id="bImg" hidden></label>' + (b.image_url ? '<button class="btn-ghost" data-bimgclr>기본 아이콘 쓰기</button>' : '')
        : '<p class="small muted hint">아이콘을 누르면 기본 아이콘이나 내 이미지로 바꿀 수 있어요.</p>') + '</section>' +
    '<section class="card s7"><span class="strong ct">화면 모드</span><div class="seg">' + seg + '</div><p class="small muted hint">다크는 선명한 포인트 컬러, 라이트 아이보리는 밝고 따뜻한 바탕이에요.</p></section>' +
    '<section class="card s8"><div class="card-h"><span class="strong ct">분류</span><span class="small muted">눌러서 이름·아이콘·숨김·삭제</span></div><div class="seg"><button class="exp" data-skind="expense" aria-pressed="' + (V.setKind === 'expense') + '">' + T('out') + ' ' + cats('expense').length + '</button><button class="inc" data-skind="income" aria-pressed="' + (V.setKind === 'income') + '">' + T('in') + ' ' + cats('income').length + '</button></div>' +
      '<div>' + list.map(c => '<button class="row' + (c.hidden ? ' hiddenrow' : '') + '" data-cat="' + c.id + '"><span class="ic ' + (c.type === 'income' ? 'inc' : 'exp') + '">' + icon(catIcon(c)) + '</span><span class="mid"><div>' + esc(c.name) + (c.hidden ? ' <span class="tag">숨김</span>' : '') + '</div><div class="small muted">거래 ' + cnt(c.id) + '건</div></span>' + icon('right') + '</button>').join('') + '</div><button class="btn-dash" data-addcat>' + icon('plus') + '새 분류</button></section>' +
    '<section class="card s4"><span class="strong ct">계좌·카드</span><div>' + accts().map(a => '<button class="row" data-acct="' + a.id + '"><span class="ic">' + icon(acctIcon(a)) + '</span><span class="mid"><div>' + esc(a.name) + ((mainAcct() || {}).id === a.id ? ' <span class="tag">주 계좌</span>' : '') + '</div><div class="small muted">' + acctLabel(a.type) + ((a.detail || {}).org ? ' · ' + esc(a.detail.org) : '') + ((a.detail || {}).last4 ? ' (' + esc(a.detail.last4) + ')' : '') + (a.initial_balance ? ' · 시작 금액 ' + won(a.initial_balance) : '') + '</div></span>' + icon('right') + '</button>').join('') + '</div><button class="btn-dash" data-addacct>' + icon('plus') + '계좌·카드 추가</button></section>' +
    '<section class="card s8"><span class="strong ct">반복 거래</span><div>' + recs().map(r => '<button class="row' + (r.active === false ? ' hiddenrow' : '') + '" data-rec="' + r.id + '"><span class="ic ' + (r.type === 'income' ? 'inc' : 'exp') + '">' + icon('repeat') + '</span><span class="mid"><div>' + esc(r.name) + (r.active === false ? ' <span class="tag">멈춤</span>' : '') + '</div><div class="small muted">매달 ' + r.day + '일 · ' + ((catOf(r.category_id) || {}).name || '분류 없음') + (r.amount_type === 'variable' ? ' · 금액 바뀜' : '') + '</div></span><span class="strong ' + (r.type === 'income' ? 'up' : 'down') + '">' + won(r.amount) + '</span>' + icon('right') + '</button>').join('') + '</div>' + recSum() + '<button class="btn-dash" data-addrec>' + icon('plus') + '반복 거래 추가</button></section>' +
    trashCard() +
    '<section class="card s4"><span class="strong ct">계정</span><div class="kv small"><span class="muted">로그인</span><span>' + esc(S.demo ? '체험 모드' : S.user.email) + '</span></div><div class="kv small"><span class="muted">버전</span><span>' + esc(verText) + '</span></div><button class="btn-ghost" data-logout>' + icon('logout') + (S.demo ? '체험 끝내기' : '로그아웃') + '</button></section>';
}

const TLABEL = { v2_categories: '분류', v2_accounts: '계좌·카드', v2_recurring: '반복 거래', v2_assets: '자산' };
function trashCard() {
  const bid = book().id;
  const list = S.trash.filter(t => t.book_id === bid).map(t => ({ k: 'tx', t, at: String(t.deleted_at) }))
    .concat(S.trashItems.filter(x => x.row.book_id === bid).map(x => ({ k: x.table, t: x.row, at: String(x.row.deleted_at) })))
    .sort((a, b) => b.at.localeCompare(a.at));
  const shown = list.slice(0, V.trashN || 10);
  const row = ({ k, t, at }) => {
    const btns = '<button class="btn-ghost" data-trestore="' + t.id + '" data-ttable="' + k + '">' + icon('undo') + '되살리기</button><button class="btn-ghost" data-tpurge="' + t.id + '" data-ttable="' + k + '" aria-label="완전 삭제" title="완전 삭제">' + icon('trash') + '</button>';
    if (k === 'tx') { const inc = t.type === 'income', c = catOf(t.category_id); return '<div class="tx" style="cursor:default"><span class="ic ' + (inc ? 'inc' : 'exp') + '">' + icon(catIcon(c)) + '</span><span class="mid"><div>' + esc(t.description || (c && c.name) || '거래') + '</div><div class="small muted">' + esc(['거래', shortDate(t.date) + ' ' + weekday(t.date), '지운 날 ' + shortDate(at.slice(0, 10))].join(' · ')) + '</div></span><span class="amt ' + (inc ? 'up' : 'down') + '">' + (inc ? '+' : '−') + won(t.amount) + '</span>' + btns + '</div>'; }
    const ic = k === 'v2_categories' ? catIcon(t) : k === 'v2_accounts' ? acctIcon(t) : k === 'v2_assets' ? assetIcon(t.type) : 'repeat';
    const amt = k === 'v2_assets' ? won(t.value) : k === 'v2_recurring' ? won(t.amount) : '';
    return '<div class="tx" style="cursor:default"><span class="ic">' + icon(ic) + '</span><span class="mid"><div>' + esc(t.name) + '</div><div class="small muted">' + TLABEL[k] + ' · 지운 날 ' + shortDate(at.slice(0, 10)) + '</div></span><span class="amt">' + amt + '</span>' + btns + '</div>';
  };
  return '<section class="card s8"><div class="card-h"><span class="strong ct">휴지통 <span class="small muted">' + list.length + '건</span></span><span class="small muted">지운 거래·분류·계좌·자산·반복 거래를 되살릴 수 있어요</span></div>' +
    (list.length ? shown.map(row).join('') + (list.length > shown.length ? '<button class="more" data-trashmore>' + Math.min(10, list.length - shown.length) + '건 더 보기</button>' : '') : '<div class="empty small">휴지통이 비어 있어요</div>') + '</section>';
}

/* ---------- shell ---------- */
const NAV = [['home', 'home', '홈'], ['list', 'list', '거래 내역'], ['assets', 'pie', '자산'], ['alerts', 'bell', '알림'], ['settings', 'gear', '설정']];
function render() {
  if (!S.books.find(b => b.id === cur.bookId)) cur.bookId = S.books[0] && S.books[0].id;
  const b = book(), focus = document.activeElement && document.activeElement.id, sel = focus && document.activeElement.selectionStart;
  if (V.view === 'assets' && b.kind !== 'personal') V.view = 'home';
  const nAlerts = computeAlerts().filter(a => a.unread).length;
  const netOf = id => { const s = S.txs.filter(t => t.book_id === id && !t.deleted_at && t.date.startsWith(ym(todayStr()))); return s.reduce((x, t) => x + (t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0) * t.amount, 0); };
  const body = { home: homeView, list: listView, assets: assetsView, alerts: alertsView, settings: settingsView }[V.view]();
  app.innerHTML = '<div class="shell"><aside class="side" aria-label="장부와 메뉴"><div class="brand"><span class="mark"><svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg></span><span class="wm"><b>' + esc(CONFIG.BRAND) + '</b><span class="small muted">' + (S.demo ? '체험 모드' : '장부 ' + S.books.length + '개') + '</span></span></div>' +
      '<div><h2>내 장부</h2>' + S.books.map(x => { const n = netOf(x.id); return '<button class="book" data-book="' + x.id + '" aria-current="' + (x.id === b.id) + '"><span class="bdot">' + bookIconHtml(x) + '</span><span class="meta"><span class="strong">' + esc(x.name) + '</span><span class="small muted">' + KIND[x.kind] + ' · 이번 달 ' + (n >= 0 ? '+' : '−') + man(Math.abs(n)).replace('원', '') + '</span></span></button>'; }).join('') + '</div>' +
      '<nav class="nav" aria-label="메뉴">' + NAV.filter(n => n[0] !== 'assets' || b.kind === 'personal').map(n => '<button data-go="' + n[0] + '"' + (V.view === n[0] ? ' aria-current="page"' : '') + '>' + icon(n[1]) + n[2] + (n[0] === 'alerts' && nAlerts ? '<span class="newdot"></span>' : '') + '</button>').join('') + '</nav>' +
      '<div class="foot small muted">' + (S.demo ? '예시 데이터예요. 저장되지 않아요.' : '') + '</div></aside>' +
    '<div class="main"><div class="topbar"><div class="title"><span>' + esc(b.name) + '</span><span class="tag">' + KIND[b.kind] + '</span></div>' +
      '<label class="search">' + icon('search') + '<input id="qtop" type="text" placeholder="내용·거래처·메모 빠른 검색" value="' + esc(V.q) + '" autocomplete="off">' + (V.q ? '<button class="x" data-qclear aria-label="검색어 지우기">' + icon('x') + '</button>' : '') + '</label>' +
      '<button class="btn-ghost tall" data-advopen>상세 검색</button><button class="btn-add" data-add>' + icon('plus') + '거래 추가</button></div>' +
      '<div class="mhead"><button class="bookbtn" data-bookmenu><span class="bdot">' + bookIconHtml(b) + '</span><span>' + esc(b.name) + '</span>' + icon('chev') + '</button><button class="icon-btn" data-msearch aria-label="검색">' + icon('search') + '</button></div>' +
      '<main class="view" id="view">' + body + '</main></div>' +
    '<nav class="tabbar" aria-label="메뉴"><div class="inner">' + [['home', 'home', '홈'], ['list', 'list', '내역']].map(n => '<button class="tab" data-go="' + n[0] + '"' + (V.view === n[0] || (n[0] === 'home' && V.view === 'assets') ? ' aria-current="page"' : '') + '>' + icon(n[1]) + n[2] + '</button>').join('') +
      '<button class="tab add" data-add aria-label="거래 추가">' + icon('plus') + '</button>' + [['alerts', 'bell', '알림'], ['settings', 'gear', '설정']].map(n => '<button class="tab" data-go="' + n[0] + '"' + (V.view === n[0] ? ' aria-current="page"' : '') + '>' + icon(n[1]) + n[2] + (n[0] === 'alerts' && nAlerts ? '<span class="newdot" style="position:absolute;margin:-30px 0 0 22px"></span>' : '') + '</button>').join('') + '</div></nav></div>' +
    '<button class="totop" data-totop aria-label="맨 위로">' + icon('up') + '</button>';
  if (focus && (focus === 'q' || focus === 'qtop')) { const el = document.getElementById(focus) || document.getElementById(focus === 'q' ? 'qtop' : 'q'); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) {} } }
  try { localStorage.setItem('ledger.v2.book', b.id); } catch (e) {}
  onScroll();
  fitCharts();
}
const go = v => { V.view = v; V.bpick = false; render(); window.scrollTo(0, 0); };
const onScroll = () => { const t = document.querySelector('.totop'); if (t) t.classList.toggle('show', window.scrollY > 400); };
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', (() => { let w = isMobile(), t = 0; return () => { if (isMobile() !== w) { w = isMobile(); render(); } else { clearTimeout(t); t = setTimeout(fitCharts, 150); } }; })());

/* ---------- toast + safe writes ---------- */
let toastT;
function toast(msg, undo) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button>되돌리기</button>' : '');
  document.body.appendChild(el);
  if (undo) el.querySelector('button').onclick = async () => { el.remove(); try { await undo(); } catch (e) { fail(e); } render(); };
  clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 4500);
}
function fail(e) {
  console.error(e);
  toast('저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
  if (!S.demo) loadAll().then(render).catch(() => {});
}
const safe = p => Promise.resolve(p).catch(fail);

/* ---------- sheets ---------- */
const layer = document.getElementById('layer');
let sheetHandlers = null;
function sheet(title, html, handlers, cls) {
  const prev = layer.querySelector('.sheet'), st = prev ? prev.scrollTop : 0, same = prev && prev.getAttribute('aria-label') === title;
  layer.innerHTML = '<div class="backdrop" data-close></div><div class="sheet' + (cls ? ' ' + cls : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"></div><h3>' + esc(title) + '</h3>' + html + '</div>';
  sheetHandlers = handlers || {};
  lockScroll(true);
  const nw = layer.querySelector('.sheet'); if (same && nw) nw.scrollTop = st; // redraw keeps the scroll position
  fitSheet();
  const f = layer.querySelector('[autofocus]'); if (f && !isMobile()) setTimeout(() => f.focus(), 30);
}
// Mobile: keep the bottom sheet inside the visible area when the keyboard opens (iOS shrinks the visual viewport).
function fitSheet() {
  const sh = layer.querySelector('.sheet'), vv = window.visualViewport; if (!sh) return;
  const kb = isMobile() && vv && vv.height < window.innerHeight * 0.8; // only when the keyboard is up
  if (!kb) { sh.style.removeProperty('--vvh'); sh.style.removeProperty('--vvb'); return; }
  sh.style.setProperty('--vvh', Math.round(vv.height) + 'px');
  sh.style.setProperty('--vvb', Math.round(Math.max(0, window.innerHeight - vv.height - vv.offsetTop)) + 'px');
}
// iOS: stop the whole sheet/page from rubber-banding. Only the sheet's own content may scroll, and not past its ends.
let tY = 0;
document.addEventListener('touchstart', e => { tY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (!layer.firstChild) return;
  const sh = e.target.closest && e.target.closest('.sheet');
  if (!sh) { e.preventDefault(); return; }
  const dy = e.touches[0].clientY - tY, top = sh.scrollTop <= 0, end = sh.scrollTop + sh.clientHeight >= sh.scrollHeight - 1;
  if (sh.scrollHeight <= sh.clientHeight || (top && dy > 0) || (end && dy < 0)) e.preventDefault();
}, { passive: false });
if (window.visualViewport) { visualViewport.addEventListener('resize', fitSheet); visualViewport.addEventListener('scroll', fitSheet); }
// Keep the page behind a sheet from moving (iOS scrolls the body when an input in a sheet gets focus).
let lockY = null;
function lockScroll(on) {
  const bd = document.body;
  if (on && lockY === null) { lockY = window.scrollY; bd.style.position = 'fixed'; bd.style.top = -lockY + 'px'; bd.style.left = '0'; bd.style.right = '0'; bd.style.width = '100%'; }
  else if (!on && lockY !== null) { bd.style.position = bd.style.top = bd.style.left = bd.style.right = bd.style.width = ''; window.scrollTo(0, lockY); lockY = null; }
}
const closeSheet = () => { layer.innerHTML = ''; sheetHandlers = null; lockScroll(false); };
// Re-draw a sheet's content but leave one live element (e.g. the input being typed in) untouched,
// so Korean IME composition isn't broken by replacing the node.
function patchAround(sel, html) {
  const live = layer.querySelector('.sheet ' + sel); if (!live) return false;
  const t = document.createElement('div'); t.innerHTML = html; const nw = t.querySelector(sel); if (!nw) return false;
  const sh = live.parentNode; let n;
  while ((n = live.nextSibling)) sh.removeChild(n);
  let x = nw.nextSibling; while (x) { const nx = x.nextSibling; sh.appendChild(x); x = nx; }
  return true;
}
layer.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { closeSheet(); return; }
  if (sheetHandlers && sheetHandlers.click) sheetHandlers.click(e);
});
layer.addEventListener('input', e => { if (sheetHandlers && sheetHandlers.input) sheetHandlers.input(e); });
layer.addEventListener('change', e => { if (sheetHandlers && sheetHandlers.change) sheetHandlers.change(e); });
layer.addEventListener('keydown', e => { if (sheetHandlers && sheetHandlers.keydown) sheetHandlers.keydown(e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && layer.innerHTML) closeSheet();
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select' || layer.innerHTML) return;
  if (e.key === '/') { e.preventDefault(); const q = document.getElementById('qtop'); if (q) q.focus(); }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openTx(); }
});
const pick = (attr, sel) => layer.querySelectorAll('[data-' + attr + ']').forEach(b => b.setAttribute('aria-pressed', b === sel));

/* transaction add / edit */
// Full-screen image viewer (tap anywhere to close).
function showImage(src, name) {
  const el = document.createElement('div'); el.className = 'lightbox';
  el.innerHTML = '<img alt="영수증" src="' + esc(src) + '"><div class="lb-acts"><button class="btn-line" data-lbsave>' + icon('download') + '저장</button><button class="btn-line" data-lbclose>' + icon('x') + '닫기</button></div>';
  el.addEventListener('click', async e => {
    if (!e.target.closest('[data-lbsave]')) { el.remove(); return; }
    try {
      const blob = await (await fetch(src)).blob();
      const fname = (name || '영수증').replace(/[\\/:*?"<>|]/g, '') + '.jpg';
      const file = new File([blob], fname, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /iP(hone|ad)|Android/.test(navigator.userAgent)) { await navigator.share({ files: [file] }); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) { if (!err || err.name !== 'AbortError') toast('영수증을 저장하지 못했어요. 잠시 후 다시 해 주세요.'); }
  });
  document.body.appendChild(el);
}
function openTx(t, copy) {
  const isNew = !t || copy;
  const d = t ? Object.assign({}, t) : { type: 'expense', amount: '', date: todayStr(), time: '', description: '', vendor: '', memo: '', category_id: null, account_id: (mainAcct() || {}).id || null };
  if (copy === true) { d.id = null; d.date = todayStr(); d.time = ''; d.recurring_id = null; } // copy=true: duplicate a row; copy='rec': record a recurring payment
  if (!d.category_id) { const c = cats(d.type).filter(x => !x.hidden)[0]; d.category_id = c ? c.id : null; }
  let ai = '', aiRes = null, aiWait = '', aiTimer = 0, imgItems = null, imgBusy = false, imgErr = '', imgFile = null, rcBlob = null, rcLocal = '', rcRemove = false;
  const isDup = it => bookTx().some(x => x.date === it.date && x.type === it.type && Number(x.amount) === Number(it.amount));
  const readImage = async file => {
    if (!S.sb) { toast('체험 모드에서는 사진 읽기를 쓸 수 없어요. 로그인하면 쓸 수 있어요.'); return; }
    imgBusy = true; imgItems = null; imgErr = ''; imgFile = file; draw();
    let items = null;
    try { const b64 = await imageToB64(file); items = await aiParse('', { sb: S.sb, cats: cats(), accts: accts(), now: nowTime(), image: b64 }); } catch (e) { items = null; }
    imgBusy = false;
    if (!items) { imgErr = '사진에서 거래를 찾지 못했어요' + (aiInfo.err ? ' (' + aiInfo.err + (aiInfo.why ? ' · Gemini: ' + aiInfo.why : '') + ')' : '') + '. 다시 찍거나 직접 입력해 주세요.'; draw(); return; }
    imgItems = items.map(it => {
      const dup = isDup(it);
      if (!it.category_id) { const g = parseLine([it.description, it.vendor, it.amount].join(' '), { cats: cats(), accts: accts() }); if (g && g.type === it.type) it.category_id = g.category_id; }
      return Object.assign(it, { dup, on: !dup });
    });
    draw();
  };
  const localItems = () => ai.split(/\n|;/).map(s => s.trim()).filter(Boolean).map(s => parseLine(s, { cats: cats(), accts: accts() })).filter(Boolean);
  const curItems = () => (aiRes && aiRes.text === ai.trim() ? aiRes.items : localItems()).map(it => Object.assign({}, it, { category_id: it.category_id || (parseLine(it.description + ' ' + it.amount, { cats: cats(), accts: accts() }) || {}).category_id || null }));
  const askAI = () => {
    const text = ai.trim(); if (!S.sb || text.length < 4) return Promise.resolve(null);
    aiWait = text;
    return aiParse(text, { sb: S.sb, cats: cats(), accts: accts(), now: nowTime() }).then(items => {
      if (aiWait === text) aiWait = '';
      if (items) aiRes = { text, items };
      if (ai.trim() === text && document.getElementById('aiIn')) draw();
      return items;
    });
  };
  let saving = false;
  const saveAI = async () => {
    if (saving) return; saving = true;
    const text = ai.trim();
    if (S.sb && !(aiRes && aiRes.text === text)) { clearTimeout(aiTimer); await Promise.race([askAI(), new Promise(r => setTimeout(r, 6000))]); }
    const it = curItems(); if (it.length) saveItems(it); else saving = false;
  };
  const draw = () => {
    const cl = cats(d.type).filter(c => !c.hidden || c.id === d.category_id);
    const items = ai ? curItems() : [];
    const aiName = () => /gemini/i.test(aiInfo.model) ? aiInfo.model.replace(/^gemini-/, 'Gemini ') : aiInfo.model ? (/gemma/i.test(aiInfo.model) ? 'Gemma' : 'Llama') + (aiInfo.why ? ' · Gemini 실패 ' + ([...new Set((aiInfo.why.match(/http \d+|empty|no_key|0건/g) || []).map(x => x.replace('http ', '')))].join(',') || '') : '') : '';
    const aiState = !ai || !S.sb ? '' : aiRes && aiRes.text === ai.trim() ? (aiName() ? 'AI(' + aiName() + ')' : 'AI') + '가 정리했어요' : aiWait === ai.trim() ? 'AI가 정리하는 중…' : '';
    const freq = (() => { const by = {}; bookTx().forEach(x => { const k = x.type + '|' + (x.description || ''); if (!x.description) return; (by[k] = by[k] || []).push(x); }); return Object.values(by).sort((a, b) => b.length - a.length).slice(0, 5).map(g => sortTx(g)[0]); })();
    const html = (isNew && !copy ? '<div class="ai-box"><span class="ai-tag">AI</span><input id="aiIn" placeholder="한 줄로 적기 · 예: 어제 저녁 쿠팡이츠 덮밥 23000" value="' + esc(ai) + '" autocomplete="off"' + (isMobile() ? '' : ' autofocus') + '><label class="ai-cam" aria-label="사진으로 입력" title="영수증·거래내역 사진으로 입력">' + icon('camera') + '<input type="file" accept="image/*" id="aiImg" hidden></label></div>' +
        (imgBusy ? '<div class="small muted ai-state">AI가 사진을 읽는 중이에요… (10~20초 걸릴 수 있어요)</div>' : '') +
        (imgErr ? '<div class="small ai-state down">' + esc(imgErr) + '</div>' : '') +
        (imgItems ? '<div class="small muted ai-state">' + (aiName() ? 'AI(' + aiName() + ')' : 'AI') + '가 사진에서 ' + imgItems.length + '건을 찾았어요. ' + (imgItems.some(x => x.on) ? '저장할 거래를 확인해 주세요.' : '이미 있는 거래 같아서 뺐어요. 그래도 넣으려면 거래를 눌러 주세요.') + '</div><div>' + imgItems.map((it, i) => '<button class="tx imgrow" data-imgi="' + i + '" aria-pressed="' + it.on + '"><span class="ic ' + (it.type === 'income' ? 'inc' : 'exp') + '">' + icon(it.on ? 'check' : catIcon(catOf(it.category_id))) + '</span><span class="mid"><div>' + esc(it.description || it.vendor || '거래') + '</div><div class="small muted">' + esc([it.dup ? (it.on ? '이미 있는 거래 같아요' : '이미 있는 거래 같아서 뺐어요 · 눌러서 넣기') : '', (catOf(it.category_id) || {}).name || '분류 없음', it.vendor, shortDate(it.date) + ' ' + weekday(it.date), it.time].filter(Boolean).join(' · ')) + '</div></span><span class="amt ' + (it.type === 'income' ? 'up' : 'down') + '">' + (it.type === 'income' ? '+' : '−') + won(it.amount) + '</span></button>').join('') + '</div><div class="acts"><button class="btn-line" data-imgclear>취소</button><button class="save" data-imgsave' + (imgItems.some(x => x.on) ? '>' + imgItems.filter(x => x.on).length + '건 저장' : ' disabled>저장할 거래 없음') + '</button></div>' : '') +
        (ai ? (aiState ? '<div class="small muted ai-state">' + aiState + '</div>' : '') + (items.length ? '<div>' + items.map(it => '<div class="tx" style="cursor:default"><span class="ic ' + (it.type === 'income' ? 'inc' : 'exp') + '">' + icon(catIcon(catOf(it.category_id))) + '</span><span class="mid"><div>' + esc(it.description) + '</div><div class="small muted">' + esc([(catOf(it.category_id) || {}).name || '분류 없음', shortDate(it.date) + ' ' + weekday(it.date), it.time].join(' · ')) + '</div></span><span class="amt ' + (it.type === 'income' ? 'up' : 'down') + '">' + (it.type === 'income' ? '+' : '−') + won(it.amount) + '</span></div>').join('') + '</div><button class="save" data-aisave>' + (items.length > 1 ? items.length + '건 ' : '') + '저장 (Enter)</button>' : '<div class="small muted">금액을 찾지 못했어요. 숫자를 함께 적어 주세요.</div>') :
          (imgBusy || imgItems ? '' : freq.length ? '<div class="small muted">자주 하는 거래</div><div class="chips">' + freq.map(x => '<button class="chip" data-freq="' + x.id + '">' + esc(x.description) + ' ' + won(x.amount) + '</button>').join('') + '</div>' : '') + (imgBusy || imgItems ? '' : '<div class="or small muted">또는 직접 입력</div>')) : '') +
      (ai || imgBusy || imgItems ? '' :
      '<div class="tx2"><div class="col">' +
      '<div class="seg"><button class="exp" data-tkind="expense" aria-pressed="' + (d.type === 'expense') + '">' + T('out') + '</button><button class="inc" data-tkind="income" aria-pressed="' + (d.type === 'income') + '">' + T('in') + '</button></div>' +
      '<label class="field"><span>금액</span><input id="fAmt" class="amount-in" inputmode="numeric" placeholder="0원" value="' + (d.amount ? Number(d.amount).toLocaleString('ko-KR') : '') + '"' + (!isNew || copy ? ' autofocus' : '') + '></label>' +
      '<div class="grid2"><label class="field"><span>날짜</span><input id="fDate" type="date" value="' + d.date + '"></label><label class="field"><span>시간 (비우면 지금)</span><input id="fTime" type="time" value="' + esc(d.time || '') + '"></label></div>' +
      '<div class="grid2"><label class="field"><span>내용</span><input id="fDesc" value="' + esc(d.description || '') + '" placeholder="예: 점심"></label><label class="field"><span>거래처</span><input id="fVendor" value="' + esc(d.vendor || '') + '" placeholder="예: 김밥천국"></label></div>' +
      '<label class="field"><span>메모</span><input id="fMemo" value="' + esc(d.memo || '') + '"></label>' +
      '</div><div class="col">' +
      '<div class="field"><span>분류</span><div class="chips">' + cl.map(c => '<button class="chip" data-tcat="' + c.id + '" aria-pressed="' + (d.category_id === c.id) + '">' + icon(catIcon(c)) + esc(c.name) + '</button>').join('') + '<button class="chip" data-tnewcat>' + icon('plus') + '새 분류</button></div></div>' +
      '<div class="field"><span>계좌·카드·현금</span><div class="chips">' + accts().map(a => '<button class="chip" data-tacct="' + a.id + '" aria-pressed="' + (d.account_id === a.id) + '">' + icon(acctIcon(a)) + esc(a.name) + '</button>').join('') + '<button class="chip" data-tnewacct>' + icon('plus') + '새 계좌·카드</button></div></div>' +
      '<div class="field"><span>영수증</span>' + ((d.receipt_path && !rcRemove) || rcLocal
        ? '<div class="rc-box"><button class="rc-thumb" data-rcview aria-label="영수증 크게 보기"><img id="rcImg" alt="영수증" src="' + esc(rcLocal || '') + '"></button><div class="rc-acts"><label class="btn-line">바꾸기<input type="file" accept="image/*" id="rcFile" hidden></label><button class="btn-line danger" data-rcdel>빼기</button></div></div>'
        : '<label class="btn-line rc-add">' + icon('receipt') + '영수증 사진 붙이기<input type="file" accept="image/*" id="rcFile" hidden></label>') + '</div>' +
      '</div></div>' +
      (isNew ? '<button class="save" data-tsave>저장</button>' : '<div class="acts3"><button class="btn-line danger" data-tdel>삭제</button><button class="btn-line" data-tcopy>복사</button><button class="save" data-tsave>저장</button></div>'));
    const keep = document.activeElement && document.activeElement.id, pos = keep && document.activeElement.selectionStart;
    if (keep === 'aiIn' && patchAround('.ai-box', html)) return;
    sheet(isNew ? (copy ? '복사해서 추가' : '거래 추가') : '거래 고치기', html, handlers, 'wide');
    if (d.receipt_path && !rcRemove && !rcLocal) receiptUrl(d.receipt_path).then(u => { const im = document.getElementById('rcImg'); if (im && u) im.src = u; });
    if (keep) { const el = document.getElementById(keep); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } }
  };
  const readForm = () => {
    const g = id => document.getElementById(id);
    if (!g('fAmt')) return;
    d.amount = Number((g('fAmt').value || '').replace(/[^0-9]/g, '')) || 0; d.date = g('fDate').value || todayStr(); d.time = g('fTime').value;
    d.description = g('fDesc').value.trim(); d.vendor = g('fVendor').value.trim(); d.memo = g('fMemo').value.trim();
  };
  const saveItems = async items => {
    const rows = items.map(it => ({ id: uid(), book_id: book().id, date: it.date, time: it.time || nowTime(), type: it.type, amount: it.amount, description: it.description, vendor: it.vendor || null, memo: null, category_id: it.category_id, account_id: it.account_id || d.account_id, to_account_id: null, recurring_id: null, receipt_path: it.receipt_path || null, created_at: new Date().toISOString() }));
    closeSheet(); render();
    try { await putMany('v2_transactions', rows); toast(rows.length + '건 저장했어요', async () => { for (const r of rows) await remove('v2_transactions', r.id); }); render(); } catch (e) { fail(e); }
  };
  const handlers = {
    input: e => { if (e.target.id === 'aiIn') { ai = e.target.value; clearTimeout(aiTimer); if (S.sb && ai.trim().length >= 4) aiTimer = setTimeout(askAI, 900); draw(); } else if (e.target.id === 'fAmt') { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v ? Number(v).toLocaleString('ko-KR') : ''; } },
    keydown: e => { if (e.target.id === 'aiIn' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveAI(); } },
    change: async e => {
      if (e.target.id === 'aiImg' && e.target.files && e.target.files[0]) readImage(e.target.files[0]);
      if (e.target.id === 'rcFile' && e.target.files && e.target.files[0]) {
        if (!S.sb) { toast('체험 모드에서는 영수증을 저장할 수 없어요.'); return; }
        readForm();
        try { rcBlob = await imageToBlob(e.target.files[0]); if (rcLocal) URL.revokeObjectURL(rcLocal); rcLocal = URL.createObjectURL(rcBlob); rcRemove = false; draw(); } catch (er) { toast('사진을 열지 못했어요'); }
      }
    },
    click: async e => {
      const t2 = e.target;
      const k = t2.closest('[data-tkind]'); if (k) { readForm(); d.type = k.dataset.tkind; const c = cats(d.type).filter(x => !x.hidden)[0]; d.category_id = c ? c.id : null; draw(); return; }
      const c = t2.closest('[data-tcat]'); if (c) { d.category_id = c.dataset.tcat; pick('tcat', c); return; }
      const a = t2.closest('[data-tacct]'); if (a) { d.account_id = a.dataset.tacct; pick('tacct', a); return; }
      const fq = t2.closest('[data-freq]'); if (fq) { const x = S.txs.find(y => y.id === fq.dataset.freq); Object.assign(d, { type: x.type, amount: x.amount, description: x.description, vendor: x.vendor, category_id: x.category_id, account_id: x.account_id, date: todayStr(), time: '' }); ai = ''; draw(); const f = document.getElementById('fDate'); if (f) f.focus(); return; }
      if (t2.closest('[data-aisave]')) { saveAI(); return; }
      if (t2.closest('[data-rcview]')) { const im = document.getElementById('rcImg'); if (im && im.src) showImage(im.src, '영수증_' + (d.date || '') + (d.vendor || d.description ? '_' + (d.vendor || d.description) : '')); return; }
      if (t2.closest('[data-rcdel]')) { readForm(); rcRemove = true; rcBlob = null; if (rcLocal) URL.revokeObjectURL(rcLocal); rcLocal = ''; draw(); return; }
      const ir = t2.closest('[data-imgi]'); if (ir) { const it = imgItems[+ir.dataset.imgi]; it.on = !it.on; draw(); return; }
      if (t2.closest('[data-imgclear]')) { imgItems = null; imgErr = ''; draw(); return; }
      if (t2.closest('[data-imgsave]')) {
        const it = imgItems.filter(x => x.on); if (!it.length) return;
        let path = null;
        if (imgFile) { try { path = await uploadReceipt(await imageToBlob(imgFile)); } catch (er) { toast('영수증 사진은 저장하지 못했어요. 거래만 저장할게요.'); } }
        saveItems(it.map(x => Object.assign({}, x, { receipt_path: path })));
        return;
      }
      if (t2.closest('[data-tnewcat]')) { readForm(); openCat(null, d.type, cid => { d.category_id = cid; draw(); }); return; }
      if (t2.closest('[data-tnewacct]')) { readForm(); openAcct(null, aid => { d.account_id = aid; draw(); }); return; }
      if (t2.closest('[data-tcopy]')) { readForm(); openTx(Object.assign({}, d), true); return; }
      if (t2.closest('[data-tdel]')) { const old = S.txs.find(x => x.id === d.id); closeSheet(); render(); try { await remove('v2_transactions', d.id); render(); toast('거래를 지웠어요', async () => { await put('v2_transactions', Object.assign({}, old, { deleted_at: null })); }); } catch (er) { fail(er); } return; }
      if (t2.closest('[data-tsave]')) {
        readForm();
        if (!d.amount) { document.getElementById('fAmt').focus(); return; }
        const old = d.id ? Object.assign({}, S.txs.find(x => x.id === d.id)) : null;
        const row = Object.assign({}, old || {}, { id: d.id || uid(), book_id: book().id, date: d.date, time: d.time || (old && old.time) || nowTime(), type: d.type, amount: d.amount, description: d.description || (catOf(d.category_id) || {}).name || '', vendor: d.vendor || null, memo: d.memo || null, category_id: d.category_id, account_id: d.account_id, recurring_id: d.recurring_id || null });
        if (!old) row.created_at = new Date().toISOString();
        if (rcRemove) row.receipt_path = null;
        if (rcBlob) { try { row.receipt_path = await uploadReceipt(rcBlob); } catch (er) { toast('영수증 사진은 저장하지 못했어요'); } }
        closeSheet(); render();
        const rr = !old && d.cycle && row.recurring_id && S.recs.find(x => x.id === row.recurring_id);
        if (rr) { const rec = Object.assign({}, rr, { log: (rr.log || []).concat([{ date: d.cycle, txId: row.id, amount: Number(row.amount), status: 'done' }]) }); try { await put('v2_recurring', rec); } catch (er) { /* the transaction still saves; the cycle falls back to its date */ } }
        try { await put('v2_transactions', row); render(); toast(old ? '고쳤어요' : won(row.amount) + ' 저장했어요', async () => { if (old) await put('v2_transactions', old); else await remove('v2_transactions', row.id); }); } catch (er) { fail(er); }
      }
    }
  };
  draw();
}

/* category add / edit (with move-on-delete) */
const icBtn = (k, on) => '<button data-cic="' + k + '" aria-pressed="' + (k === on) + '" aria-label="' + esc(CI[k] ? CI[k][2].split(' ')[0] : k) + '">' + icon(k) + '</button>';
const sugRow = (name, on) => { const s = suggestIcons(name); return s.length ? s.map(k => icBtn(k, on)).join('') : '<span class="small muted">이름을 적으면 어울리는 아이콘 3개를 골라 드려요</span>'; };
const allIcons = on => CI_GROUPS.map(g => '<div class="igrp"><span class="small muted">' + g + '</span><div class="ipick">' + Object.keys(CI).filter(k => CI[k][1] === g).map(k => icBtn(k, on)).join('') + '</div></div>').join('');
function openCat(id, type, after) {
  const c = id ? Object.assign({}, catOf(id)) : { id: uid(), book_id: book().id, name: '', type: type || V.setKind, color: null, icon: null, hidden: false, sort: cats(type || V.setKind).length + 1 };
  let ic = c.icon || null;
  const curName = () => { const el = document.getElementById('cName'); return el ? el.value : c.name; };
  const curIc = () => ic || iconForName(curName(), '');
  const n = id ? bookTx().filter(t => t.category_id === id).length : 0;
  const draw = () => sheet(id ? '분류 고치기' : '새 분류 (' + (c.type === 'income' ? T('in') : T('out')) + ')',
    '<label class="field"><span>이름</span><input id="cName" value="' + esc(c.name) + '" maxlength="14" placeholder="예: 반려동물" autofocus></label>' +
    '<div class="field"><span>추천 아이콘' + (ic ? '' : ' (이름에 맞게 자동)') + '</span><div class="ipick isug" id="cSug">' + sugRow(curName(), curIc()) + '</div></div>' +
    '<div class="field"><span>전체 아이콘</span>' + allIcons(curIc()) + '</div>' +
    (id ? '<div class="row"><span class="mid"><div>입력할 때 숨기기</div><div class="small muted">지난 거래는 그대로 남아요</div></span><button class="switch" role="switch" aria-label="숨기기" aria-checked="' + !!c.hidden + '" data-chide></button></div><div class="acts"><button class="btn-line danger" data-cdel>삭제</button><button class="save" data-csave>저장</button></div>' : '<button class="save" data-csave>추가</button>'), {
    input: e => { if (e.target.id !== 'cName') return; const on = curIc(); document.getElementById('cSug').innerHTML = sugRow(e.target.value, on); layer.querySelectorAll('[data-cic]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cic === on)); },
    click: async e => {
      const t = e.target;
      const b = t.closest('[data-cic]'); if (b) { ic = b.dataset.cic; layer.querySelectorAll('[data-cic]').forEach(x => x.setAttribute('aria-pressed', x.dataset.cic === ic)); return; }
      const sw = t.closest('[data-chide]'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
      if (t.closest('[data-csave]')) {
        const name = document.getElementById('cName').value.trim(); if (!name) { document.getElementById('cName').focus(); return; }
        if (cats(c.type).some(x => x.name === name && x.id !== c.id)) { toast('같은 이름의 분류가 있어요'); return; }
        const old = id ? Object.assign({}, catOf(id)) : null;
        const row = Object.assign(c, { name, icon: ic, hidden: id ? layer.querySelector('[data-chide]').getAttribute('aria-checked') === 'true' : false });
        closeSheet();
        try { await put('v2_categories', row); if (after) after(row.id); else { render(); toast(old ? '분류를 저장했어요' : '\'' + name + '\' 분류를 추가했어요', async () => { if (old) await put('v2_categories', old); else await remove('v2_categories', row.id); }); } } catch (er) { fail(er); }
        return;
      }
      if (t.closest('[data-cdel]')) {
        const others = cats(c.type).filter(x => x.id !== c.id);
        sheet('\'' + c.name + '\' 삭제', (n ? '<div>이 분류의 거래 ' + n + '건을 어디로 옮길까요?</div><label class="field"><span>옮길 분류</span><select id="cMove">' + others.map(o => '<option value="' + o.id + '">' + esc(o.name) + '</option>').join('') + '</select></label>' : '<div>이 분류에는 거래가 없어요.</div>') +
          '<div class="acts"><button class="btn-line" data-close>취소</button><button class="save" data-cdelok style="background:var(--coral);color:#fff">' + (n ? '옮기고 삭제' : '삭제') + '</button></div>', {
          click: async e2 => {
            if (!e2.target.closest('[data-cdelok]')) return;
            const to = n ? document.getElementById('cMove').value : null, old = Object.assign({}, catOf(c.id));
            const moved = bookTx().filter(x => x.category_id === c.id).map(x => Object.assign({}, x));
            const recMoved = recs().filter(r => r.category_id === c.id).map(r => Object.assign({}, r));
            closeSheet();
            try {
              if (moved.length) await putMany('v2_transactions', moved.map(x => Object.assign({}, x, { category_id: to })));
              if (recMoved.length) await putMany('v2_recurring', recMoved.map(r => Object.assign({}, r, { category_id: to })));
              await remove('v2_categories', c.id); render();
              toast('\'' + c.name + '\' 삭제' + (moved.length ? ' · ' + moved.length + '건을 옮겼어요' : '했어요'), async () => { await put('v2_categories', old); if (moved.length) await putMany('v2_transactions', moved); if (recMoved.length) await putMany('v2_recurring', recMoved); });
            } catch (er) { fail(er); }
          }
        });
      }
    }
  });
  draw();
}

/* account add / edit */
function openAcct(id, after) {
  const a = id ? Object.assign({}, acctOf(id)) : { id: uid(), book_id: book().id, name: '', type: 'bank', initial_balance: 0, sort: accts().length + 1 };
  const n = id ? bookTx().filter(t => t.account_id === id).length : 0;
  sheet(id ? '계좌·카드 고치기' : '계좌·카드 추가',
    '<div class="field"><span>종류</span><div class="chips">' + ACCT_TYPES.map(o => '<button class="chip" data-atype="' + o[0] + '" aria-pressed="' + (a.type === o[0]) + '">' + icon(o[2]) + o[1] + '</button>').join('') + '</div></div>' +
    '<label class="field"><span>이름</span><input id="aName" value="' + esc(a.name) + '" maxlength="20" placeholder="예: 국민 생활비 통장, 신한 체크(1234)" autofocus></label>' +
    '<div class="grid2"><label class="field"><span>금융사 (선택)</span><input id="aOrg" value="' + esc((a.detail || {}).org || '') + '" placeholder="예: 국민은행, 신한카드"></label><label class="field"><span>끝 4자리 (선택)</span><input id="aLast" inputmode="numeric" maxlength="4" value="' + esc((a.detail || {}).last4 || '') + '"></label></div>' +
    '<label class="field"><span>시작 금액 (선택)</span><input id="aInit" inputmode="numeric" value="' + (a.initial_balance ? Number(a.initial_balance).toLocaleString('ko-KR') : '') + '" placeholder="0"></label>' +
    '<div class="row"><span class="mid"><div>주 계좌</div><div class="small muted">거래를 적을 때 기본으로 이 계좌가 선택돼요</div></span><button class="switch" role="switch" aria-label="주 계좌" aria-checked="' + (!!(a.detail || {}).main || (!id ? false : (mainAcct() || {}).id === id && !accts().some(x => (x.detail || {}).main))) + '" data-amain></button></div>' +
    (id ? '<div class="acts"><button class="btn-line danger" data-adel>삭제</button><button class="save" data-asave>저장</button></div>' : '<button class="save" data-asave>추가</button>'), {
    click: async e => {
      const t = e.target;
      const ty = t.closest('[data-atype]'); if (ty) { a.type = ty.dataset.atype; pick('atype', ty); return; }
      const sw = t.closest('[data-amain]'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
      if (t.closest('[data-asave]')) {
        const name = document.getElementById('aName').value.trim(); if (!name) return;
        const old = id ? Object.assign({}, acctOf(id)) : null;
        const isMain = layer.querySelector('[data-amain]').getAttribute('aria-checked') === 'true';
        a.detail = Object.assign({}, a.detail || {}, { org: document.getElementById('aOrg').value.trim() || undefined, last4: document.getElementById('aLast').value.replace(/[^0-9]/g, '') || undefined, main: isMain || undefined });
        const unset = isMain ? accts().filter(x => x.id !== a.id && (x.detail || {}).main).map(x => Object.assign({}, x, { detail: Object.assign({}, x.detail, { main: undefined }) })) : []; a.name = name; a.initial_balance = Number((document.getElementById('aInit').value || '').replace(/[^0-9-]/g, '')) || 0;
        closeSheet(); try { for (const x of unset) await put('v2_accounts', x); await put('v2_accounts', a); if (after) { after(a.id); return; } render(); toast(old ? '저장했어요' : name + ' 추가했어요', async () => { if (old) await put('v2_accounts', old); else await remove('v2_accounts', a.id); }); } catch (er) { fail(er); }
        return;
      }
      if (t.closest('[data-adel]')) {
        if (n) { toast('거래 ' + n + '건이 이 계좌를 쓰고 있어서 지울 수 없어요'); return; }
        const old = Object.assign({}, acctOf(id)); closeSheet();
        try { await remove('v2_accounts', id); render(); toast(old.name + ' 삭제했어요', async () => { await put('v2_accounts', old); }); } catch (er) { fail(er); }
      }
    }
  });
}

/* recurring add / edit, and "record now" */
function openRec(id, from) {
  const r = id ? Object.assign({}, S.recs.find(x => x.id === id)) : Object.assign({ id: uid(), book_id: book().id, name: '', type: 'expense', amount: 0, amount_type: 'fixed', freq: 'monthly', day: Number(todayStr().slice(8)), active: true, category_id: null, account_id: (accts()[0] || {}).id || null, log: [] }, from || {});
  const draw = () => sheet(id ? '반복 거래' : '반복 거래 추가',
    '<div class="seg"><button class="exp" data-rkind="expense" aria-pressed="' + (r.type === 'expense') + '">' + T('out') + '</button><button class="inc" data-rkind="income" aria-pressed="' + (r.type === 'income') + '">' + T('in') + '</button></div>' +
    '<label class="field"><span>이름</span><input id="rName" value="' + esc(r.name) + '" placeholder="예: 넷플릭스" autofocus></label>' +
    '<div class="grid2"><label class="field"><span>금액</span><input id="rAmt" inputmode="numeric" value="' + (r.amount ? Number(r.amount).toLocaleString('ko-KR') : '') + '"></label><label class="field"><span>매달 며칠</span><input id="rDay" type="number" min="1" max="31" value="' + (r.day || 1) + '"></label></div>' +
    '<div class="field"><span>분류</span><div class="chips">' + cats(r.type).filter(c => !c.hidden).map(c => '<button class="chip" data-rcat="' + c.id + '" aria-pressed="' + (r.category_id === c.id) + '">' + icon(catIcon(c)) + esc(c.name) + '</button>').join('') + '</div></div>' +
    '<div class="row"><span class="mid"><div>금액이 달마다 바뀌어요</div><div class="small muted">카드값, 해외 결제처럼</div></span><button class="switch" role="switch" aria-label="금액 바뀜" aria-checked="' + (r.amount_type === 'variable') + '" data-rvar></button></div>' +
    (id ? '<div class="row"><span class="mid"><div>사용 중</div><div class="small muted">끄면 알림과 목록에서 빠져요</div></span><button class="switch" role="switch" aria-label="사용 중" aria-checked="' + (r.active !== false) + '" data-ract></button></div>' : '') +
    (id ? '<div class="acts3"><button class="btn-line danger" data-rdel>삭제</button><button class="btn-line" data-rnow>지금 기록</button><button class="save" data-rsave>저장</button></div>' : '<button class="save" data-rsave>추가</button>'), {
    click: async e => {
      const t = e.target; const read = () => { r.name = document.getElementById('rName').value.trim(); r.amount = Number((document.getElementById('rAmt').value || '').replace(/[^0-9]/g, '')) || 0; r.day = Math.max(1, Math.min(31, Number(document.getElementById('rDay').value) || 1)); };
      const k = t.closest('[data-rkind]'); if (k) { read(); r.type = k.dataset.rkind; r.category_id = null; draw(); return; }
      const c = t.closest('[data-rcat]'); if (c) { r.category_id = c.dataset.rcat; pick('rcat', c); return; }
      const sw = t.closest('[data-rvar],[data-ract]'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
      if (t.closest('[data-rnow]')) { closeSheet(); recordRec(r.id); return; }
      if (t.closest('[data-rsave]')) {
        read(); if (!r.name || !r.amount) return;
        r.amount_type = layer.querySelector('[data-rvar]').getAttribute('aria-checked') === 'true' ? 'variable' : 'fixed';
        if (id) r.active = layer.querySelector('[data-ract]').getAttribute('aria-checked') === 'true';
        const old = id ? Object.assign({}, S.recs.find(x => x.id === id)) : null;
        closeSheet(); try { await put('v2_recurring', r); render(); toast(old ? '저장했어요' : r.name + ' 반복 거래로 등록했어요', async () => { if (old) await put('v2_recurring', old); else await remove('v2_recurring', r.id); }); } catch (er) { fail(er); }
        return;
      }
      if (t.closest('[data-rdel]')) { const old = Object.assign({}, S.recs.find(x => x.id === id)); closeSheet(); try { await remove('v2_recurring', id); render(); toast(old.name + ' 반복 거래를 지웠어요 · 지난 거래는 그대로예요', async () => { await put('v2_recurring', old); }); } catch (er) { fail(er); } }
    }
  });
  draw();
}
function recordRec(id, due) {
  const r = S.recs.find(x => x.id === id), m = ym(todayStr());
  due = due || dueDate(r, m);
  openTx({ id: null, type: r.type, amount: r.amount, date: due > todayStr() ? todayStr() : due, time: '', description: r.name, vendor: '', memo: '', category_id: r.category_id, account_id: r.account_id, recurring_id: r.id, cycle: due }, 'rec');
  const tx = document.querySelector('.sheet h3'); if (tx) tx.textContent = r.name + ' 기록하기';
}

/* assets */
/* assets: purchase price vs current value, per-type details (stored in detail jsonb) */
const AFIELDS = {
  deposit: [['org', '금융사', 'text'], ['rate', '금리(%)', 'num'], ['monthly', '월 납입액', 'won'], ['maturity', '만기일', 'date']],
  stock: [['qty', '수량', 'num'], ['avg', '평균 단가', 'won'], ['price', '현재가', 'won'], ['bought', '산 날짜', 'date']],
  coin: [['qty', '수량', 'num'], ['avg', '평균 단가', 'won'], ['price', '현재가', 'won'], ['bought', '산 날짜', 'date']],
  estate: [['bought', '산 날짜', 'date'], ['org', '위치', 'text']],
  movable: [['bought', '산 날짜', 'date'], ['org', '메모', 'text']],
  etc: [['bought', '산 날짜', 'date'], ['org', '메모', 'text']],
  loan: [['org', '금융사', 'text'], ['rate', '금리(%)', 'num'], ['monthly', '월 상환액', 'won'], ['maturity', '만기일', 'date']]
};
AFIELDS.invest = AFIELDS.stock;
const pct = (a, b) => (a >= 0 ? '+' : '−') + Math.abs(Math.round(a / b * 1000) / 10) + '%';
function assetSub(a) {
  const d = a.detail || {}, v = Number(a.value || 0), c = Number(a.cost || 0), parts = [];
  if (a.type === 'loan') { if (c) parts.push('갚은 비율 ' + Math.max(0, Math.round((c - v) / c * 100)) + '%'); if (d.rate) parts.push('금리 ' + d.rate + '%'); if (d.org) parts.push(esc(d.org)); return parts.join(' · ') || '눌러서 금액 고치기'; }
  if (c) parts.push('산 금액 ' + won(c) + ' · <span class="' + (v - c >= 0 ? 'up' : 'down') + '">' + signed(v - c) + ' (' + pct(v - c, c) + ')</span>');
  if (d.qty) parts.push(d.qty + '개');
  if (a.type === 'deposit' && d.rate) parts.push('금리 ' + d.rate + '%');
  if (d.maturity) parts.push('만기 ' + d.maturity.slice(2).replace(/-/g, '.'));
  if (d.org && !parts.length) parts.push(esc(d.org));
  return parts.join(' · ') || '눌러서 금액 고치기';
}
function openAsset(id) {
  const a = id ? Object.assign({}, S.assets.find(x => x.id === id)) : { id: uid(), book_id: book().id, name: '', type: 'deposit', value: 0, memo: null, cost: null, detail: {}, sort: assets().length + 1 };
  a.detail = Object.assign({}, a.detail || {});
  const hist = id ? S.snaps.filter(s => s.asset_id === id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 4) : [];
  const fmtW = v => v ? Number(v).toLocaleString('ko-KR') : '';
  const num = el => Number(String(el && el.value || '').replace(/[^0-9.]/g, '')) || 0;
  const gain = () => {
    const c = num(document.getElementById('sCost')), v = num(document.getElementById('sVal')), g = document.getElementById('sGain'); if (!g) return;
    if (a.type === 'loan') g.innerHTML = c ? '갚은 비율 ' + Math.max(0, Math.round((c - v) / c * 100)) + '% · 갚은 돈 ' + won(Math.max(0, c - v)) : '';
    else g.innerHTML = c ? '<span class="' + (v - c >= 0 ? 'up' : 'down') + '">' + signed(v - c) + ' (' + pct(v - c, c) + ')</span> · 산 금액 대비' : '';
  };
  const readAll = () => {
    a.name = document.getElementById('sName').value.trim();
    a.cost = num(document.getElementById('sCost')) || null; a.value = num(document.getElementById('sVal'));
    layer.querySelectorAll('[data-df]').forEach(el => { const k = el.dataset.df, raw = el.value.trim(); if (!raw) delete a.detail[k]; else a.detail[k] = el.hasAttribute('data-won') ? num(el) : (el.getAttribute('inputmode') === 'decimal' ? (Number(raw.replace(/[^0-9.]/g, '')) || raw) : raw); });
  };
  let handlers;
  const draw = () => {
    const loan = a.type === 'loan', F = AFIELDS[a.type] || AFIELDS.etc;
    sheet(id ? a.name : '자산 추가',
      '<div class="chips">' + Object.entries(ASSET_TYPES).filter(([k]) => k !== 'invest' || a.type === 'invest').map(([k, v]) => '<button class="chip" data-stype="' + k + '" aria-pressed="' + (a.type === k) + '">' + icon(v[1]) + v[0] + '</button>').join('') + '</div>' +
      '<label class="field"><span>이름</span><input id="sName" value="' + esc(a.name) + '" placeholder="예: 토스 파킹통장, 삼성전자, 업비트"' + (id ? '' : ' autofocus') + '></label>' +
      '<div class="grid2"><label class="field"><span>' + (loan ? '처음 빌린 돈' : '산 금액 (원금)') + '</span><input id="sCost" inputmode="numeric" data-won value="' + fmtW(a.cost) + '" placeholder="0"></label>' +
      '<label class="field"><span>' + (loan ? '남은 대출' : '지금 시세') + '</span><input id="sVal" inputmode="numeric" data-won value="' + fmtW(a.value) + '" placeholder="0"' + (id ? ' autofocus' : '') + '></label></div>' +
      '<div class="small muted" id="sGain"></div>' +
      '<div class="grid2">' + F.map(([k, l, t]) => '<label class="field"><span>' + l + '</span><input data-df="' + k + '"' + (t === 'date' ? ' type="date"' : t === 'text' ? '' : ' inputmode="decimal"') + (t === 'won' ? ' data-won' : '') + ' value="' + esc(t === 'won' ? fmtW(a.detail[k]) : (a.detail[k] || '')) + '"></label>').join('') + '</div>' +
      (hist.length ? '<div class="small muted">기록 · ' + hist.map(h => shortDate(h.date) + ' ' + won(h.value)).join(' · ') + '</div>' : '') +
      (id ? '<div class="acts"><button class="btn-line danger" data-sdel>삭제</button><button class="save" data-ssave>저장</button></div>' : '<button class="save" data-ssave>추가</button>'), handlers, 'wide');
    gain();
  };
  handlers = {
    input: e => {
      const el = e.target;
      if (el.hasAttribute('data-won')) { const v = el.value.replace(/[^0-9]/g, ''); el.value = v ? Number(v).toLocaleString('ko-KR') : ''; }
      const q = layer.querySelector('[data-df="qty"]'), av = layer.querySelector('[data-df="avg"]'), pr = layer.querySelector('[data-df="price"]');
      if (q && ['qty', 'avg', 'price'].includes(el.dataset.df)) {
        const qty = Number(String(q.value).replace(/[^0-9.]/g, '')) || 0;
        if (qty && num(av)) document.getElementById('sCost').value = Math.round(qty * num(av)).toLocaleString('ko-KR');
        if (qty && num(pr)) document.getElementById('sVal').value = Math.round(qty * num(pr)).toLocaleString('ko-KR');
      }
      gain();
    },
    click: async e => {
      const t = e.target;
      const ty = t.closest('[data-stype]'); if (ty) { readAll(); a.type = ty.dataset.stype; draw(); return; }
      if (t.closest('[data-ssave]')) {
        readAll(); if (!a.name) { document.getElementById('sName').focus(); return; }
        const old = id ? Object.assign({}, S.assets.find(x => x.id === id)) : null, v = a.value, name = a.name;
        closeSheet();
        try { await put('v2_assets', a); if (!old || Number(old.value) !== v) await putSnap({ asset_id: a.id, date: todayStr(), value: v, memo: old ? '직접 수정' : '등록' }); render(); toast(old ? name + ' 저장했어요' : name + ' 추가했어요', async () => { if (old) await put('v2_assets', old); else await remove('v2_assets', a.id); }); } catch (er) { fail(er); }
        return;
      }
      if (t.closest('[data-sdel]')) { closeSheet(); try { await remove('v2_assets', id); render(); toast(a.name + ' 휴지통으로 옮겼어요', async () => { await restoreItem('v2_assets', id); }); } catch (er) { fail(er); } }
    }
  };
  draw();
}

/* books */
function openBookMenu() {
  sheet('장부 선택', S.books.map(x => '<button class="row" data-bsel="' + x.id + '"><span class="bdot" style="width:38px;height:38px;border-radius:99px">' + bookIconHtml(x) + '</span><span class="mid"><div>' + esc(x.name) + '</div><div class="small muted">' + KIND[x.kind] + '</div></span>' + (x.id === book().id ? icon('check') : '') + '</button>').join('') +
    '<button class="btn-dash" data-bnew>' + icon('plus') + '새 장부 만들기</button>', {
    click: e => {
      const b = e.target.closest('[data-bsel]'); if (b) { cur.bookId = b.dataset.bsel; closeSheet(); render(); return; }
      if (e.target.closest('[data-bnew]')) openNewBook();
    }
  });
}
function openNewBook() {
  sheet('새 장부', '<label class="field"><span>이름</span><input id="nbName" placeholder="예: 생활비 장부" autofocus></label><div class="small muted">지금은 개인 장부만 만들 수 있어요. 개인사업자·법인 장부는 출시 전에 열려요.</div><button class="save" data-nbsave>만들기</button>', {
    click: async e => {
      if (!e.target.closest('[data-nbsave]')) return;
      const name = document.getElementById('nbName').value.trim(); if (!name) return;
      const b = { id: uid(), user_id: S.user.id, name, kind: 'personal', icon: 'wallet', sort: S.books.length };
      closeSheet();
      try {
        await put('v2_books', b); cur.bookId = b.id;
        const base = [['식비', 'expense'], ['카페', 'expense'], ['쇼핑', 'expense'], ['교통', 'expense'], ['주거', 'expense'], ['구독', 'expense'], ['급여', 'income'], ['기타 수입', 'income']];
        await putMany('v2_categories', base.map((c, i) => ({ id: uid(), book_id: b.id, name: c[0], type: c[1], color: null, icon: null, hidden: false, sort: i + 1 })));
        await put('v2_accounts', { id: uid(), book_id: b.id, name: '주거래 통장', type: 'bank', initial_balance: 0, sort: 1 });
        render(); toast(name + ' 장부를 만들었어요');
      } catch (er) { fail(er); }
    }
  });
}

/* image → small square data URL for the book icon */
function shrinkImage(file) {
  return new Promise((ok, no) => {
    const r = new FileReader(); r.onerror = no;
    r.onload = () => { const img = new Image(); img.onerror = no; img.onload = () => { const s = 160, c = document.createElement('canvas'); c.width = c.height = s; const k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k; c.getContext('2d').drawImage(img, (s - w) / 2, (s - h) / 2, w, h); ok(c.toDataURL('image/jpeg', .85)); }; img.src = r.result; };
    r.readAsDataURL(file);
  });
}

/* ---------- page events ---------- */
app.addEventListener('click', async e => {
  const t = e.target;
  if (t.closest && t.closest('rect.hit')) { chartTip(e); return; }
  const el = sel => t.closest(sel);
  let x;
  if ((x = el('[data-go]'))) { go(x.dataset.go); return; }
  if (el('[data-add]')) { openTx(); return; }
  if ((x = el('[data-tx]'))) { openTx(S.txs.find(y => y.id === x.dataset.tx)); return; }
  if ((x = el('[data-book]'))) { cur.bookId = x.dataset.book; V.catF = ''; render(); return; }
  if (el('[data-bookmenu]')) { openBookMenu(); return; }
  if (el('[data-msearch]')) { V.view = 'list'; render(); const q = document.getElementById('q'); if (q) q.focus(); return; }
  if (el('[data-advopen]')) { openAdv(); return; }
  if (el('[data-advoff]')) { V.adv = null; render(); return; }
  if (el('[data-qclear]')) { V.q = ''; render(); return; }
  if (el('[data-totop]')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (el('[data-more]')) { V.showN += 10; render(); return; }
  if ((x = el('[data-hm]'))) { V.month = addMonths(V.month, +x.dataset.hm); render(); return; }
  if ((x = el('[data-lm]'))) { V.lm = addMonths(V.lm, +x.dataset.lm); V.catF = ''; render(); return; }
  if ((x = el('[data-kind]'))) { V.kind = x.dataset.kind; render(); return; }
  if ((x = el('[data-compcat]'))) { if (!x.dataset.compcat) return; V.view = 'list'; V.lm = V.month; V.q = ''; V.kind = 'all'; V.catF = x.dataset.compcat; render(); window.scrollTo(0, 0); return; }
  if ((x = el('[data-catf]'))) { V.catF = V.catF === x.dataset.catf ? '' : x.dataset.catf; render(); return; }
  if ((x = el('[data-upcoming]'))) { openUpcoming(); return; }
  if ((x = el('[data-alf]'))) { V.alF = x.dataset.alf; render(); return; }
  if ((x = el('[data-adone]'))) { const id = x.dataset.adone; dismiss(id); render(); toast('알림을 지웠어요', () => dismiss(id, false)); return; }
  if ((x = el('[data-aact]'))) {
    const a = computeAlerts().find(y => y.id === x.dataset.aact); if (!a) return; markSeen([a.id]);
    if (a.act === 'record') recordRec(a.ref, /^\d{4}-\d\d-\d\d$/.test(a.id.split(':').pop()) ? a.id.split(':').pop() : null);
    else if (a.act === 'cat') { V.view = 'list'; V.lm = ym(todayStr()); V.q = ''; V.kind = 'all'; V.catF = a.ref; render(); window.scrollTo(0, 0); }
    else if (a.act === 'search') { V.view = 'list'; V.q = a.ref; render(); window.scrollTo(0, 0); }
    else if (a.act === 'mkrec') { const tx = S.txs.find(y => y.id === a.ref); openRec(null, { name: tx.description, type: tx.type, amount: Number(tx.amount), day: Number(tx.date.slice(8)), category_id: tx.category_id, account_id: tx.account_id }); }
    return;
  }
  if ((x = el('[data-rec]'))) { openRec(x.dataset.rec); return; }
  if (el('[data-addrec]')) { openRec(null); return; }
  if ((x = el('[data-asset]'))) { openAsset(x.dataset.asset); return; }
  if (el('[data-addasset]')) { openAsset(null); return; }
  if ((x = el('[data-skind]'))) { V.setKind = x.dataset.skind; render(); return; }
  if ((x = el('[data-cat]'))) { openCat(x.dataset.cat); return; }
  if (el('[data-addcat]')) { openCat(null, V.setKind); return; }
  if ((x = el('[data-acct]'))) { openAcct(x.dataset.acct); return; }
  if (el('[data-addacct]')) { openAcct(null); return; }
  if ((x = el('button[data-theme]'))) { theme = x.dataset.theme; try { localStorage.setItem('ledger.v2.theme', theme); } catch (er) {} applyTheme(); render(); return; }
  if (el('[data-bpick]')) { V.bpick = !V.bpick; render(); return; }
  if ((x = el('[data-bicon]'))) { const b = Object.assign({}, book()), old = Object.assign({}, b); b.icon = x.dataset.bicon; b.image_url = null; V.bpick = false; render(); await safe(put('v2_books', b)); render(); toast('장부 아이콘을 바꿨어요', () => put('v2_books', old)); return; }
  if (el('[data-bimgclr]')) { const b = Object.assign({}, book(), { image_url: null }); V.bpick = false; await safe(put('v2_books', b)); render(); return; }
  if ((x = el('[data-trestore]'))) { const id = x.dataset.trestore, k = x.dataset.ttable; await safe(k === 'tx' ? restoreTx(id) : restoreItem(k, id)); render(); toast((k === 'tx' ? '거래' : TLABEL[k]) + '를 되살렸어요'); return; }
  if ((x = el('[data-tpurge]'))) {
    const id = x.dataset.tpurge, k = x.dataset.ttable;
    const t = k === 'tx' ? S.trash.find(y => y.id === id) : (S.trashItems.find(y => y.table === k && y.row.id === id) || {}).row; if (!t) return;
    const what = k === 'tx' ? esc(t.description || '거래') + ' ' + won(t.amount) + ' (' + shortDate(t.date) + ')' : TLABEL[k] + ' \'' + esc(t.name) + '\'';
    sheet('완전히 삭제할까요?', '<div>' + what + '를 지우면 되살릴 수 없어요.</div><div class="acts"><button class="btn-line" data-close>취소</button><button class="save" data-purgeok style="background:var(--coral);color:#fff">완전 삭제</button></div>', {
      click: async e2 => { if (!e2.target.closest('[data-purgeok]')) return; closeSheet(); await safe(k === 'tx' ? purgeTx(id) : purgeItem(k, id)); render(); toast('완전히 삭제했어요'); }
    });
    return;
  }
  if (el('[data-trashmore]')) { V.trashN = (V.trashN || 10) + 10; render(); return; }
  if (el('[data-logout]')) { if (S.demo) { location.href = location.pathname; return; } await signOut(); location.reload(); }
});
const CH = { s: null, avg: null, act: -1, area: null };
// Charts are drawn at their on-screen width (1 SVG unit = 1px) so their 13px labels stay 13px on every screen.
const CW = { bar: 760, area: 760 };
function fitCharts() {
  const bb = document.querySelector('.chart .cbox'), ab = document.querySelector('.chart .abox');
  if (bb && CH.s) { const w = Math.round(bb.clientWidth); if (w > 100 && Math.abs(w - CW.bar) > 4) { CW.bar = w; bb.innerHTML = barChart(CH.s, w, CH.act < 0 ? CH.s.length - 1 : CH.act); } }
  if (ab && CH.area) { const w = Math.round(ab.clientWidth); if (w > 100 && Math.abs(w - CW.area) > 4) { CW.area = w; ab.innerHTML = areaChart(CH.area[0], CH.area[1]); } }
}
const chartStats = (pre, i, x) => '<div><span class="small muted">' + pre + T('in') + '</span><span class="v">' + won(i) + '</span></div><div><span class="small muted">' + pre + T('out') + '</span><span class="v">' + won(x) + '</span></div><div><span class="small muted">' + pre + T('left') + '</span><span class="v">' + signed(i - x) + '</span></div>';
function chartFocus(i) {
  const box = document.querySelector('.chart .cbox'), st = document.querySelector('.chart .cstats');
  if (!box || !CH.s) return;
  const k = i == null ? CH.s.length - 1 : i;
  if (k !== CH.act) { CH.act = k; box.innerHTML = barChart(CH.s, CW.bar, k); }
  if (st) st.innerHTML = i == null ? chartStats('월평균 ', CH.avg[0], CH.avg[1]) : chartStats(monthLabel(CH.s[k].m) + ' ', CH.s[k].inc, CH.s[k].exp);
}
function chartTip(e) {
  const h = e.target.closest && e.target.closest('rect.hit');
  if (h) chartFocus(CH.s.findIndex(d => d.m === h.dataset.m));
  else if (CH.act !== -1 && CH.s && !(e.target.closest && e.target.closest('.chart .cbox'))) { if (CH.act !== CH.s.length - 1 || document.querySelector('.chart .cstats .small.muted') && !/월평균/.test(document.querySelector('.chart .cstats .small.muted').textContent)) chartFocus(null); }
}
app.addEventListener('mousemove', chartTip);
app.addEventListener('mouseleave', () => chartFocus(null));
function searchUpdate(id) {
  const v = document.getElementById('view');
  if (!v || document.activeElement !== document.getElementById(id)) { render(); return; }
  if (id === 'qtop') {
    v.innerHTML = { home: homeView, list: listView, assets: assetsView, alerts: alertsView, settings: settingsView }[V.view]();
    document.querySelectorAll('.nav [data-go], .tabbar [data-go]').forEach(b => { if (b.dataset.go === V.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    return;
  }
  const t = document.createElement('div'); t.innerHTML = listView();
  v.querySelectorAll('[data-live]').forEach(n => { const m = t.querySelector('[data-live="' + n.dataset.live + '"]'); if (m) n.innerHTML = m.innerHTML; });
}
app.addEventListener('input', e => {
  if (e.target.id === 'q' || e.target.id === 'qtop') { V.q = e.target.value; V.adv = null; if (V.q && V.view !== 'list') V.view = 'list'; searchUpdate(e.target.id); }
});
app.addEventListener('change', async e => {
  if (e.target.id === 'bkName') { const v = e.target.value.trim(); if (!v || v === book().name) return; const old = Object.assign({}, book()); await safe(put('v2_books', Object.assign({}, book(), { name: v }))); render(); toast('장부 이름을 바꿨어요', () => put('v2_books', old)); }
  if (e.target.id === 'bImg' && e.target.files[0]) { try { const url = await shrinkImage(e.target.files[0]); V.bpick = false; await safe(put('v2_books', Object.assign({}, book(), { image_url: url }))); render(); toast('내 이미지로 바꿨어요'); } catch (er) { toast('이미지를 읽지 못했어요'); } }
});

/* ---------- sign-in + boot ---------- */
function loginView(msg) {
  app.innerHTML = '<div class="center"><form class="login" id="loginForm"><div class="brand"><span class="mark"><svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg></span><span class="wm"><b>' + esc(CONFIG.BRAND) + '</b><span class="small muted">새 버전 미리보기</span></span></div>' +
    '<label class="field"><span>이메일</span><input id="lEmail" type="email" autocomplete="email" required></label><label class="field"><span>비밀번호</span><input id="lPw" type="password" autocomplete="current-password" required minlength="6"></label>' +
    '<div class="err" id="lErr">' + esc(msg || '') + '</div><button class="save" type="submit">로그인</button>' +
    '<p class="small muted hint">지금 쓰시는 LEDGER 계정 그대로 로그인하면 옮겨 둔 기록이 보여요.</p><a class="small muted" href="?demo">로그인 없이 예시 데이터로 둘러보기</a></form></div>';
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = document.getElementById('lErr'); err.textContent = '';
    try { await signIn(document.getElementById('lEmail').value.trim(), document.getElementById('lPw').value); await start(); }
    catch (er) { err.textContent = /Invalid login/i.test(er.message) ? '이메일이나 비밀번호가 맞지 않아요' : (er.message || '로그인하지 못했어요'); }
  });
}
async function start() {
  app.innerHTML = '<div class="center muted">불러오는 중…</div>';
  try { await loadAll(); } catch (e) { console.error(e); app.innerHTML = '<div class="center"><div class="login"><b>기록을 불러오지 못했어요</b><p class="small muted">인터넷 연결을 확인하고 다시 열어 주세요.</p><button class="save" onclick="location.reload()">다시 시도</button></div></div>'; return; }
  const p = new URLSearchParams(location.search);
  if (p.get('action') === 'new-tx' || p.get('action') === 'new-expense') setTimeout(() => openTx(), 50);
  if (p.get('view') === 'transactions') V.view = 'list';
  render();
}
// Intro screen: brand + running version (from config.js, so it shows exactly which update is loaded).
const verText = 'v' + CONFIG.VERSION + ' · ' + CONFIG.BUILT;
const T0 = Date.now();
(() => { const n = document.getElementById('spName'), v = document.getElementById('spVer'); if (n) n.textContent = CONFIG.BRAND; if (v) v.textContent = CONFIG.SHOW_VERSION_ON_INTRO ? verText : ''; })();
const hideSplash = () => { const sp = document.getElementById('splash'); if (!sp) return; setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 400); }, Math.max(0, 900 - (Date.now() - T0))); };
(async () => {
  if (new URLSearchParams(location.search).has('demo')) { loadDemo(); render(); hideSplash(); return; }
  try { const u = await initClient(); if (u) await start(); else loginView(); }
  catch (e) { console.error(e); loginView('서버에 연결하지 못했어요. 잠시 뒤 다시 열어 주세요.'); }
  hideSplash();
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
