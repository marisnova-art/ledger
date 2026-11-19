// LEDGER v2 — app entry: sign-in, layout (PC sidebar / mobile tab bar), views and edit sheets.
import { CONFIG } from './config.js';
import { S, initClient, signIn, signOut, loadAll, loadDemo, put, putMany, remove, putSnap, restoreTx, purgeTx } from './store.js';
import { icon, esc, won, signed, man, uid, todayStr, nowTime, ym, addMonths, monthLabel, weekday, shortDate, iconForName, acctIcon, acctLabel, ACCT_TYPES } from './util.js';
import { cur, book, bookTx, cats, accts, recs, assets, catOf, acctOf, monthSum, monthTx, series, score, outlook, recThisMonth, dueDate, computeAlerts, dismiss, markSeen, ASSET_TYPES, assetLabel, assetIcon, signedVal, netWorthAt } from './calc.js';
import { parseLine } from './ai.js';

const app = document.getElementById('app');
const V = { view: 'home', month: ym(todayStr()), lm: ym(todayStr()), q: '', kind: 'all', catF: '', showN: 10, alF: 'all', setKind: 'expense', bpick: false };
let theme = 'dark';
try { theme = localStorage.getItem('ledger.v2.theme') || 'dark'; cur.bookId = localStorage.getItem('ledger.v2.book'); } catch (e) {}
const applyTheme = () => {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light' || (theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name=theme-color]').setAttribute('content', light ? '#BABCB7' : '#0C0D0B');
};
applyTheme();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
const isMobile = () => matchMedia('(max-width: 959px)').matches;

/* ---------- small pieces ---------- */
const catIcon = c => c ? (c.icon || iconForName(c.name, c.type === 'income' ? 'coin' : 'tag')) : 'tag';
const bookIconHtml = b => b.image_url ? '<img src="' + esc(b.image_url) + '" alt="">' : icon(b.icon || 'wallet');
const KIND = { personal: '개인', business: '개인사업자', corp: '법인' };
function txRow(t, opts = {}) {
  const c = catOf(t.category_id), a = acctOf(t.account_id), inc = t.type === 'income';
  const sub = [c ? c.name : '분류 없음', a ? a.name : '', opts.date ? shortDate(t.date) + ' ' + weekday(t.date) : '', t.time || ''].filter(Boolean).join(' · ');
  return '<button class="tx" data-tx="' + t.id + '"><span class="ic ' + (inc ? 'inc' : 'exp') + '">' + icon(catIcon(c)) + '</span><span class="mid"><div>' + esc(t.description || t.vendor || (c && c.name) || '거래') + (t.recurring_id ? '<span class="rec">' + icon('repeat') + '반복</span>' : '') + '</div><div class="small muted">' + esc(sub) + '</div></span><span class="amt ' + (inc ? 'up' : 'down') + '">' + (inc ? '+' : '−') + won(t.amount) + '</span></button>';
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
function barChart(s, W = 760) {
  const H = 300, L = 48, R = 16, Tp = 40, B = 34;
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
    const cx = L + gw * i + gw / 2, last = i === s.length - 1, op = last ? 1 : .55;
    const pill = (x, v, gid) => { const h = Math.max(bw, y(0) - y(v)); return v ? '<rect x="' + x + '" y="' + (y(0) - h) + '" width="' + bw + '" height="' + h + '" rx="' + bw / 2 + '" fill="url(#' + gid + ')" opacity="' + op + '"/>' : ''; };
    bars += pill(cx - bw - 4, d.inc, 'gI') + pill(cx + 4, d.exp, 'gE');
    bars += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="13" fill="' + (last ? 'var(--ink)' : 'var(--muted)') + '" font-weight="' + (last ? 600 : 400) + '">' + monthLabel(d.m) + '</text>';
    pts.push([cx, y(Math.max(0, d.inc - d.exp)), d.inc - d.exp]);
    hits += '<rect class="hit" x="' + (L + gw * i) + '" y="' + Tp + '" width="' + gw + '" height="' + (H - Tp) + '" fill="transparent" data-m="' + d.m + '" data-inc="' + d.inc + '" data-exp="' + d.exp + '"/>';
  });
  let line = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; const yb = y(0), c1 = Math.min(yb, p1[1] + (p2[1] - p0[1]) / 6), c2 = Math.min(yb, p2[1] - (p3[1] - p1[1]) / 6); line += ' C' + (p1[0] + (p2[0] - p0[0]) / 6) + ' ' + c1 + ',' + (p2[0] - (p3[0] - p1[0]) / 6) + ' ' + c2 + ',' + p2[0] + ' ' + p2[1]; }
  const lp = pts[pts.length - 1], tag = (lp[2] >= 0 ? '+' : '−') + Math.round(Math.abs(lp[2]) / 10000).toLocaleString('ko-KR') + '만', tw = tag.length * 8 + 20, ty = Math.max(2, lp[1] - 44);
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 6개월 들어온 돈과 나간 돈"><defs><linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".35"/></linearGradient><linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--coral)"/><stop offset="1" stop-color="var(--coral)" stop-opacity=".35"/></linearGradient><radialGradient id="gH"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient></defs>' + g + bars +
    '<path d="' + line + '" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" opacity=".85"/><circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="28" fill="url(#gH)"/><circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="5.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>' +
    '<g transform="translate(' + Math.min(W - tw, lp[0] - tw / 2) + ' ' + ty + ')"><rect width="' + tw + '" height="26" rx="13" fill="var(--accent)"/><text x="' + tw / 2 + '" y="17.5" text-anchor="middle" font-size="13" font-weight="600" fill="var(--on-accent)">' + tag + '</text></g>' + hits + '</svg>';
}
function areaChart(vals, labels) {
  const W = 760, H = 220, L = 12, R = 12, Tp = 44, B = 30, n = vals.length;
  const mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * 0.15 || Math.abs(mx) * 0.1 || 1;
  const x = i => L + (W - L - R) * i / (n - 1), y = v => Tp + (H - Tp - B) * (1 - (v - (mn - pad)) / ((mx + pad) - (mn - pad)));
  let line = 'M' + x(0) + ' ' + y(vals[0]);
  for (let i = 0; i < n - 1; i++) { const a = [x(Math.max(0, i - 1)), y(vals[Math.max(0, i - 1)])], b = [x(i), y(vals[i])], c = [x(i + 1), y(vals[i + 1])], d = [x(Math.min(n - 1, i + 2)), y(vals[Math.min(n - 1, i + 2)])]; line += ' C' + (b[0] + (c[0] - a[0]) / 6) + ' ' + (b[1] + (c[1] - a[1]) / 6) + ',' + (c[0] - (d[0] - b[0]) / 6) + ' ' + (c[1] - (d[1] - b[1]) / 6) + ',' + c[0] + ' ' + c[1]; }
  const dlt = vals[n - 1] - vals[n - 2], tag = (dlt >= 0 ? '+' : '−') + Math.round(Math.abs(dlt) / 10000).toLocaleString('ko-KR') + '만', tw = tag.length * 8 + 20;
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 6개월 순자산"><defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
    labels.map((m, i) => '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '" font-size="13" fill="' + (i === n - 1 ? 'var(--ink)' : 'var(--muted)') + '">' + m + '</text>').join('') +
    '<path d="' + line + ' L' + x(n - 1) + ' ' + (H - B) + ' L' + x(0) + ' ' + (H - B) + ' Z" fill="url(#gA)"/><path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/>' +
    '<circle cx="' + x(n - 1) + '" cy="' + y(vals[n - 1]) + '" r="5.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/><g transform="translate(' + (x(n - 1) - tw) + ' ' + Math.max(2, y(vals[n - 1]) - 40) + ')"><rect width="' + tw + '" height="26" rx="13" fill="var(--accent)"/><text x="' + tw / 2 + '" y="17.5" text-anchor="middle" font-size="13" font-weight="600" fill="var(--on-accent)">' + tag + '</text></g></svg>';
}
const OP = [1, .74, .52, .36, .24, .16];
function assetBar() {
  const groups = assetGroups().filter(g => g.sum > 0), gross = groups.reduce((x, g) => x + g.sum, 0) || 1;
  const col = i => 'color-mix(in srgb, var(--accent) ' + Math.round(OP[Math.min(i, 5)] * 100) + '%, var(--mixbase))';
  return '<div class="abar">' + groups.map((g, i) => '<span style="flex:' + g.sum + ';background:' + col(i) + '"></span>').join('') + '</div><div class="alegend small muted">' + groups.map((g, i) => '<span><i style="background:' + col(i) + '"></i>' + g.label + ' <b>' + Math.round(g.sum / gross * 100) + '%</b></span>').join('') + '</div>';
}
function assetGroups() {
  const by = {}; assets().forEach(a => { (by[a.type] = by[a.type] || []).push(a); });
  return Object.keys(by).map(k => ({ k, label: assetLabel(k), ic: assetIcon(k), list: by[k], sum: by[k].reduce((x, a) => x + signedVal(a), 0) })).sort((a, b) => b.sum - a.sum);
}

/* ---------- views ---------- */
function heroAccts() {
  const t0 = todayStr(), bal = {}; accts().forEach(a => { bal[a.id] = Number(a.initial_balance || 0); });
  bookTx().forEach(t => { if (t.date > t0) return; const v = Number(t.amount); if (t.type === 'income') { if (t.account_id in bal) bal[t.account_id] += v; } else if (t.type === 'expense') { if (t.account_id in bal) bal[t.account_id] -= v; } else { if (t.account_id in bal) bal[t.account_id] -= v; if (t.to_account_id in bal) bal[t.to_account_id] += v; } });
  if (!accts().length) return '';
  return '<div class="hacc">' + accts().map(a => '<button class="hac" data-acct="' + a.id + '">' + icon(acctIcon(a)) + '<span class="hn">' + esc(a.name) + '</span><b>' + won(bal[a.id]) + '</b></button>').join('') + '</div>';
}
function heroMore(m) {
  const o = outlook(m);
  if (!o) return '';
  const used = o.used == null ? null : Math.round(o.used * 100), time = Math.round(o.day / o.dim * 100);
  return '<div class="hmore"><div class="kv"><span class="lbl2">월말 예상</span><b>' + signed(o.end) + '</b></div>' +
    (used == null ? '' : '<div class="ptrack" title="들어온 돈의 ' + used + '% 사용 · 이번 달 ' + time + '% 지남"><i style="width:' + Math.min(100, used) + '%"></i><em style="left:' + time + '%"></em></div><div class="kv small"><span>' + used + '% 썼어요</span><span>' + time + '% 지남</span></div>') + '</div>';
}
function homeView() {
  const m = V.month, now = monthSum(m), prev = monthSum(addMonths(m, -1)), net = now.inc - now.exp, diff = net - (prev.inc - prev.exp), sc = score(m);
  const recent = sortTx(bookTx()), shown = recent.slice(0, V.showN), rest = recent.length - shown.length;
  const rt = recThisMonth(), alerts = computeAlerts(), isP = book().kind === 'personal';
  const nw = netWorthAt(ym(todayStr())), nwd = nw - netWorthAt(addMonths(ym(todayStr()), -1));
  const nM = isMobile() ? 6 : 12, s6 = series(m, nM), nUsed = Math.max(1, s6.filter(d => d.inc || d.exp).length), avgI = s6.reduce((x, d) => x + d.inc, 0) / nUsed, avgE = s6.reduce((x, d) => x + d.exp, 0) / nUsed;
  const col = isP ? 's4' : 's6';
  return '<section class="card hero s6 m1"><div class="card-h">' + mstep('hm', m, ym(todayStr())).replace('<span>' + m.slice(0, 4) + '년 ' + monthLabel(m), '<span class="muted">' + monthLabel(m) + ' 남은 돈') + '</div>' +
      '<div class="num">' + signed(net) + '</div>' + heroMore(m) + heroAccts() + '<div class="stats three"><div><span class="small muted lbl in"><svg viewBox="0 0 18 18"><path d="M5 9h8M9 5v8"/></svg>들어온 돈</span><span class="v">+' + won(now.inc) + '</span></div><div><span class="small muted lbl out"><svg viewBox="0 0 18 18"><path d="M5 9h8"/></svg>나간 돈</span><span class="v">−' + won(now.exp) + '</span></div><div><span class="small muted lbl ' + (diff >= 0 ? 'in' : 'out') + '"><svg viewBox="0 0 18 18">' + (diff >= 0 ? '<path d="M9 13V5M5.5 8.5L9 5l3.5 3.5"/>' : '<path d="M9 5v8M5.5 9.5L9 13l3.5-3.5"/>') + '</svg>지난달보다</span><span class="v">' + signed(diff) + '</span></div></div></section>' +
    '<section class="card score s6 m2"><div class="glow"></div><div class="card-h"><span>재무 건강 점수</span><span class="small muted">' + monthLabel(m) + ' 기준</span></div><div class="kv"><span class="big">' + sc.v + '</span><span class="strong">' + sc.grade + '</span></div>' +
      '<div class="facs">' + sc.f.map(f => '<div class="fac" title="' + esc(f.note) + '"><span>' + f.k + '</span><b>' + f.v + '</b><span class="fst ' + f.st[1] + '">' + f.st[0] + '</span></div>').join('') + '</div><div class="bar"><span class="marker" style="left:calc(' + sc.v + '% - 1px)"></span></div></section>' +
    '<section class="card s12 m3"><div class="card-h"><span class="strong">최근 거래 <span class="small muted">' + recent.length + '건</span></span><button class="golink" data-go="list">전체 보기 ›</button></div><div>' + (shown.length ? shown.map(t => txRow(t, { date: true })).join('') : '<div class="empty">아직 거래가 없어요. 거래 추가로 시작해 보세요.</div>') + '</div>' + (rest > 0 ? '<button class="more" data-more>' + Math.min(10, rest) + '건 더 보기</button>' : '') + '</section>' +
    '<section class="card ' + col + ' m4"><div class="card-h"><span class="strong">이번 달 반복 거래 <span class="small muted">' + rt.filter(x => x.done).length + '/' + rt.length + ' 완료</span></span>' + '<button class="golink" data-go="settings">관리 ›</button></div>' +
      (rt.length ? rt.slice().sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due)).slice(0, 7).map(({ r, due, done }) => '<button class="row" data-rec="' + r.id + '"><span class="mid"><div>' + esc(r.name) + '</div><div class="small muted">' + shortDate(due) + ' · ' + (done ? '완료' : '예정') + '</div></span><span class="small strong ' + (r.type === 'income' ? 'up' : 'down') + '">' + won(r.amount) + '</span></button>').join('') + '' : '<div class="empty small">등록된 반복 거래가 없어요</div>') + '</section>' +
    '<section class="card ' + col + ' m5"><div class="card-h"><span class="strong">알림 <span class="small muted">' + (alerts.length ? alerts.length + '건' : '') + '</span></span><button class="golink" data-go="alerts">전체 보기 ›</button></div>' + (alerts.length ? alerts.slice(0, 3).map(alertRow).join('') : '<div class="empty small">지금은 알릴 게 없어요</div>') + '</section>' +
    (isP ? '<section class="card s4 m6"><div class="card-h"><span class="strong">내 자산</span><button class="golink" data-go="assets">자산 보기 ›</button></div><div class="kv"><span class="muted">순자산</span><span class="strong">' + won(nw) + '</span></div><div class="kv small"><span class="muted">지난달보다</span><span class="' + (nwd >= 0 ? 'up' : 'down') + '">' + signed(nwd) + '</span></div>' + (assets().length ? assetBar() + '<div>' + assets().slice().sort((a, b) => Math.abs(signedVal(b)) - Math.abs(signedVal(a))).slice(0, 5).map(a => '<button class="row" data-asset="' + a.id + '"><span class="ic ' + (a.type === 'loan' ? 'exp' : 'inc') + '">' + icon(assetIcon(a.type)) + '</span><span class="mid"><div>' + esc(a.name) + '</div><div class="small muted">' + assetLabel(a.type) + '</div></span><span class="small strong' + (a.type === 'loan' ? ' down' : '') + '">' + won(signedVal(a)) + '</span></button>').join('') + '</div>' : '<div class="small muted">예금, 주식, 코인, 부동산, 대출을 적어 두면 순자산 추이를 보여드려요.</div>') + '</section>' : '') +
    '<section class="card chart s12 m7"><div class="card-h"><span class="strong">최근 ' + nM + '개월</span><span class="legend small muted"><span><i style="background:var(--accent)"></i>들어온 돈</span><span><i style="background:var(--coral)"></i>나간 돈</span><span>— 남은 돈</span></span></div>' + barChart(s6, isMobile() ? 760 : 1400) + '<div class="ctip" hidden></div>' +
      '<div class="stats" style="margin-top:0"><div><span class="small muted">월평균 들어온 돈</span><span class="v">' + won(avgI) + '</span></div><div><span class="small muted">월평균 나간 돈</span><span class="v">' + won(avgE) + '</span></div><div><span class="small muted">월평균 남은 돈</span><span class="v">' + signed(avgI - avgE) + '</span></div></div></section>';
}

function listView() {
  const q = V.q.trim().toLowerCase(), m = V.lm;
  let list = bookTx();
  if (q) list = list.filter(t => [t.description, t.vendor, t.memo, (catOf(t.category_id) || {}).name].join(' ').toLowerCase().includes(q));
  else list = list.filter(t => t.date.startsWith(m));
  const base = list;
  if (V.kind !== 'all') list = list.filter(t => t.type === V.kind);
  if (V.catF) list = list.filter(t => t.category_id === V.catF);
  const s = monthSum(m), used = [...new Set(base.map(t => t.category_id))].map(catOf).filter(Boolean);
  return '<section class="card s12"><div class="card-h">' + (q ? '<span class="strong">검색 결과 <span class="small muted">전체 기간 · ' + list.length + '건</span></span>' : mstep('lm', m, ym(todayStr()))) + '</div>' +
      (q ? '' : '<div class="stats four"><div><span class="small muted">거래</span><span class="v">' + monthTx(m).length + '건</span></div><div><span class="small muted">들어온 돈</span><span class="v up">+' + won(s.inc) + '</span></div><div><span class="small muted">나간 돈</span><span class="v down">−' + won(s.exp) + '</span></div><div><span class="small muted">남은 돈</span><span class="v">' + signed(s.inc - s.exp) + '</span></div></div>') +
      (isMobile() ? '<label class="search m">' + icon('search') + '<input id="q" type="search" placeholder="내용·거래처·메모·분류로 찾기" value="' + esc(V.q) + '" autocomplete="off"></label>' : '') +
      '<div class="pills scroll"><button class="pill" data-kind="all" aria-pressed="' + (V.kind === 'all') + '">전체</button><button class="pill kin" data-kind="income" aria-pressed="' + (V.kind === 'income') + '">들어온 돈</button><button class="pill kout" data-kind="expense" aria-pressed="' + (V.kind === 'expense') + '">나간 돈</button>' +
        used.map(c => '<button class="pill" data-catf="' + c.id + '" aria-pressed="' + (V.catF === c.id) + '">' + icon(catIcon(c)) + esc(c.name) + '</button>').join('') + '</div>' +
      '<div>' + (list.length ? dayGroups(list) : '<div class="empty">' + (q ? '찾는 거래가 없어요' : '이 달에는 거래가 없어요') + '</div>') + '</div></section>';
}

function alertRow(a) {
  return '<div class="tx al"><span class="ic ' + (a.warn ? 'warn' : 'inc') + '">' + icon(a.ic) + '</span><span class="mid"><div' + (a.unread ? ' class="strong"' : '') + '>' + esc(a.title) + (a.unread ? '<span class="newdot" aria-label="새 알림"></span>' : '') + '</div><div class="small muted">' + esc(a.sub) + '</div></span>' +
    '<div class="acts-al">' + (a.act ? '<button class="btn-ghost" data-aact="' + esc(a.id) + '">' + esc(a.actLabel) + '</button>' : '') + '<button class="btn-ghost" data-adone="' + esc(a.id) + '" title="확인하고 지우기">' + icon('check') + '확인</button></div></div>';
}
function alertsView() {
  const all = computeAlerts(), list = all.filter(a => V.alF === 'all' || a.t === V.alF), unread = all.filter(a => a.unread);
  const T = [['all', '전체'], ['rec', '반복 거래'], ['odd', '평소와 다름'], ['check', '확인 필요']];
  const g = {}; list.forEach(a => { (g[a.d] = g[a.d] || []).push(a); });
  const t = todayStr(), label = d => d === t ? '오늘' : shortDate(d) + ' ' + weekday(d);
  setTimeout(() => markSeen(all.map(a => a.id)), 1500);
  return '<section class="card s8"><div class="card-h"><span class="strong">알림 <span class="small muted">' + (unread.length ? '새 알림 ' + unread.length + '건' : all.length ? '모두 읽었어요' : '') + '</span></span></div>' +
      '<div class="pills scroll">' + T.map(([k, l]) => '<button class="pill" data-alf="' + k + '" aria-pressed="' + (V.alF === k) + '">' + l + ' <span class="muted">' + (k === 'all' ? all.length : all.filter(a => a.t === k).length) + '</span></button>').join('') + '</div>' +
      (list.length ? Object.keys(g).sort().reverse().map(d => '<div class="dayband"><span class="dl">' + label(d) + '</span><span class="muted">' + g[d].length + '건</span></div>' + g[d].map(alertRow).join('')).join('') : '<div class="empty">지금은 알릴 게 없어요</div>') + '</section>' +
    '<section class="card s4" style="align-self:start"><span class="strong">알려드리는 것</span><p class="small muted hint">반복 거래 결제·입금 3일 전부터, 기록되지 않은 반복 거래, 분류별로 평소보다 많이 쓴 달, 같은 날 같은 금액(중복 의심), 3달 연속 비슷한 거래(반복 등록 제안), 반복 거래 금액이 바뀐 경우를 알려드려요.</p><p class="small muted hint">"확인"을 누르면 이 기기에서 그 알림이 사라져요.</p></section>';
}

function assetsView() {
  const nowM = ym(todayStr()), months = [-5, -4, -3, -2, -1, 0].map(k => addMonths(nowM, k)), vals = months.map(netWorthAt);
  const nw = vals[5], d = nw - vals[4], gross = assets().filter(a => a.type !== 'loan').reduce((x, a) => x + Number(a.value || 0), 0), debt = assets().filter(a => a.type === 'loan').reduce((x, a) => x + Number(a.value || 0), 0);
  const groups = assetGroups().map(g => '<div class="grp"><span class="strong">' + g.label + '</span><span class="muted">' + g.list.length + '개</span><span class="sp"></span><span class="strong' + (g.sum < 0 ? ' down' : '') + '">' + won(g.sum) + '</span></div>' +
    g.list.map(a => '<button class="row" data-asset="' + a.id + '"><span class="ic ' + (a.type === 'loan' ? 'exp' : 'inc') + '">' + icon(g.ic) + '</span><span class="mid"><div>' + esc(a.name) + '</div><div class="small muted">' + (a.memo && a.memo !== a.name ? esc(a.memo) + ' · ' : '') + (a.cost ? '원금 ' + won(a.cost) : '눌러서 금액 고치기') + '</div></span><span class="strong' + (a.type === 'loan' ? ' down' : '') + '">' + won(signedVal(a)) + '</span>' + icon('right') + '</button>').join('')).join('');
  return '<div class="m1 s12" style="display:contents"></div>' + (isMobile() ? '<div><button class="golink" data-go="home">‹ 홈</button></div>' : '') +
    '<section class="card hero s5"><div class="card-h"><span class="muted">순자산</span><span class="tag">' + monthLabel(nowM) + ' 기준</span></div><div class="num">' + won(nw) + '</div><div class="stats three"><div><span class="small muted">가진 자산</span><span class="v">' + man(gross) + '</span></div><div><span class="small muted">대출</span><span class="v">−' + man(debt) + '</span></div><div><span class="small muted">지난달보다</span><span class="v">' + signed(d) + '</span></div></div></section>' +
    '<section class="card chart s7"><div class="card-h"><span class="strong">순자산 추이</span><span class="small muted">최근 6개월 · 매달 말</span></div>' + areaChart(vals, months.map(monthLabel)) + '</section>' +
    (assets().length ? '<section class="card s12"><div class="card-h"><span class="strong">자산 구성</span><span class="small muted">대출 제외</span></div>' + assetBar() + '</section>' : '') +
    '<section class="card s12"><div class="card-h"><span class="strong">내 자산</span><span class="small muted">금액을 고치면 그날 기록으로 남아요</span></div>' + (groups || '<div class="empty">아직 적어 둔 자산이 없어요</div>') + '<button class="btn-dash" data-addasset>' + icon('plus') + '자산 추가</button><p class="small muted hint">투자 조언은 하지 않고, 적어 주신 금액으로 기록과 추이만 보여드려요.</p></section>';
}

function settingsView() {
  const b = book(), list = cats(V.setKind);
  const cnt = id => bookTx().filter(t => t.category_id === id).length;
  const seg = [['dark', '다크'], ['light', '라이트 그레이'], ['system', '기기 설정 따라']].map(o => '<button data-theme="' + o[0] + '" aria-pressed="' + (theme === o[0]) + '">' + o[1] + '</button>').join('');
  return '<section class="card s5"><div class="card-h"><span class="strong">장부</span><span class="small muted">' + KIND[b.kind] + '</span></div>' +
      '<div class="bookid"><button class="bdot" data-bpick aria-label="아이콘 바꾸기">' + bookIconHtml(b) + '</button><label class="field" style="flex:1"><span>장부 이름</span><input id="bkName" value="' + esc(b.name) + '" maxlength="20"></label></div>' +
      (V.bpick ? '<div class="ipick">' + ['wallet', 'store', 'building', 'house', 'coin', 'card', 'cup', 'people', 'bag', 'heart', 'book', 'trend'].map(k => '<button data-bicon="' + k + '" aria-pressed="' + (!b.image_url && b.icon === k) + '" aria-label="' + k + '">' + icon(k) + '</button>').join('') + '</div><label class="btn-dash" style="cursor:pointer">' + icon('image') + '내 이미지 올리기<input type="file" accept="image/*" id="bImg" hidden></label>' + (b.image_url ? '<button class="btn-ghost" data-bimgclr>기본 아이콘 쓰기</button>' : '')
        : '<p class="small muted hint">아이콘을 누르면 기본 아이콘이나 내 이미지로 바꿀 수 있어요.</p>') + '</section>' +
    '<section class="card s7"><span class="strong">화면 모드</span><div class="seg">' + seg + '</div><p class="small muted hint">다크는 선명한 포인트 컬러, 라이트 그레이는 눈이 편한 차분한 컬러예요.</p></section>' +
    '<section class="card s8"><div class="card-h"><span class="strong">분류</span><span class="small muted">눌러서 이름·아이콘·숨김·삭제</span></div><div class="seg"><button class="exp" data-skind="expense" aria-pressed="' + (V.setKind === 'expense') + '">나간 돈 ' + cats('expense').length + '</button><button class="inc" data-skind="income" aria-pressed="' + (V.setKind === 'income') + '">들어온 돈 ' + cats('income').length + '</button></div>' +
      '<div>' + list.map(c => '<button class="row' + (c.hidden ? ' hiddenrow' : '') + '" data-cat="' + c.id + '"><span class="ic ' + (c.type === 'income' ? 'inc' : 'exp') + '">' + icon(catIcon(c)) + '</span><span class="mid"><div>' + esc(c.name) + (c.hidden ? ' <span class="tag">숨김</span>' : '') + '</div><div class="small muted">거래 ' + cnt(c.id) + '건</div></span>' + icon('right') + '</button>').join('') + '</div><button class="btn-dash" data-addcat>' + icon('plus') + '새 분류</button></section>' +
    '<section class="card s4"><span class="strong">계좌·카드</span><div>' + accts().map(a => '<button class="row" data-acct="' + a.id + '"><span class="ic">' + icon(acctIcon(a)) + '</span><span class="mid"><div>' + esc(a.name) + '</div><div class="small muted">' + acctLabel(a.type) + (a.initial_balance ? ' · 시작 금액 ' + won(a.initial_balance) : '') + '</div></span>' + icon('right') + '</button>').join('') + '</div><button class="btn-dash" data-addacct>' + icon('plus') + '계좌·카드 추가</button></section>' +
    '<section class="card s8"><span class="strong">반복 거래</span><div>' + recs().map(r => '<button class="row' + (r.active === false ? ' hiddenrow' : '') + '" data-rec="' + r.id + '"><span class="ic ' + (r.type === 'income' ? 'inc' : 'exp') + '">' + icon('repeat') + '</span><span class="mid"><div>' + esc(r.name) + (r.active === false ? ' <span class="tag">멈춤</span>' : '') + '</div><div class="small muted">매달 ' + r.day + '일 · ' + ((catOf(r.category_id) || {}).name || '분류 없음') + (r.amount_type === 'variable' ? ' · 금액 바뀜' : '') + '</div></span><span class="strong ' + (r.type === 'income' ? 'up' : 'down') + '">' + won(r.amount) + '</span>' + icon('right') + '</button>').join('') + '</div><button class="btn-dash" data-addrec>' + icon('plus') + '반복 거래 추가</button></section>' +
    trashCard() +
    '<section class="card s4"><span class="strong">계정</span><div class="kv small"><span class="muted">로그인</span><span>' + esc(S.demo ? '체험 모드' : S.user.email) + '</span></div><button class="btn-ghost" data-logout>' + icon('logout') + (S.demo ? '체험 끝내기' : '로그아웃') + '</button></section>';
}

function trashCard() {
  const list = S.trash.filter(t => t.book_id === book().id), shown = list.slice(0, V.trashN || 10);
  return '<section class="card s8"><div class="card-h"><span class="strong">휴지통 <span class="small muted">' + list.length + '건</span></span><span class="small muted">지운 거래는 여기서 되살릴 수 있어요</span></div>' +
    (list.length ? shown.map(t => { const inc = t.type === 'income', c = catOf(t.category_id); return '<div class="tx" style="cursor:default"><span class="ic ' + (inc ? 'inc' : 'exp') + '">' + icon(catIcon(c)) + '</span><span class="mid"><div>' + esc(t.description || (c && c.name) || '거래') + '</div><div class="small muted">' + esc([shortDate(t.date) + ' ' + weekday(t.date), c ? c.name : '', '지운 날 ' + shortDate(String(t.deleted_at).slice(0, 10))].filter(Boolean).join(' · ')) + '</div></span><span class="amt ' + (inc ? 'up' : 'down') + '">' + (inc ? '+' : '−') + won(t.amount) + '</span><button class="btn-ghost" data-trestore="' + t.id + '">' + icon('undo') + '되살리기</button><button class="btn-ghost" data-tpurge="' + t.id + '" aria-label="완전 삭제" title="완전 삭제">' + icon('trash') + '</button></div>'; }).join('') + (list.length > shown.length ? '<button class="more" data-trashmore>' + Math.min(10, list.length - shown.length) + '건 더 보기</button>' : '')
      : '<div class="empty small">휴지통이 비어 있어요</div>') + '</section>';
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
      '<button class="btn-add" data-add>' + icon('plus') + '거래 추가</button></div>' +
      '<div class="mhead"><button class="bookbtn" data-bookmenu><span class="bdot">' + bookIconHtml(b) + '</span><span>' + esc(b.name) + '</span>' + icon('chev') + '</button><button class="icon-btn" data-msearch aria-label="검색">' + icon('search') + '</button></div>' +
      '<main class="view" id="view">' + body + '</main></div>' +
    '<nav class="tabbar" aria-label="메뉴"><div class="inner">' + [['home', 'home', '홈'], ['list', 'list', '내역']].map(n => '<button class="tab" data-go="' + n[0] + '"' + (V.view === n[0] || (n[0] === 'home' && V.view === 'assets') ? ' aria-current="page"' : '') + '>' + icon(n[1]) + n[2] + '</button>').join('') +
      '<button class="tab add" data-add aria-label="거래 추가">' + icon('plus') + '</button>' + [['alerts', 'bell', '알림'], ['settings', 'gear', '설정']].map(n => '<button class="tab" data-go="' + n[0] + '"' + (V.view === n[0] ? ' aria-current="page"' : '') + '>' + icon(n[1]) + n[2] + (n[0] === 'alerts' && nAlerts ? '<span class="newdot" style="position:absolute;margin:-30px 0 0 22px"></span>' : '') + '</button>').join('') + '</div></nav></div>' +
    '<button class="totop" data-totop aria-label="맨 위로">' + icon('up') + '</button>';
  if (focus && (focus === 'q' || focus === 'qtop')) { const el = document.getElementById(focus) || document.getElementById(focus === 'q' ? 'qtop' : 'q'); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) {} } }
  try { localStorage.setItem('ledger.v2.book', b.id); } catch (e) {}
  onScroll();
}
const go = v => { V.view = v; V.bpick = false; render(); window.scrollTo(0, 0); };
const onScroll = () => { const t = document.querySelector('.totop'); if (t) t.classList.toggle('show', window.scrollY > 400); };
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', (() => { let w = isMobile(); return () => { if (isMobile() !== w) { w = isMobile(); render(); } }; })());

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
function sheet(title, html, handlers) {
  layer.innerHTML = '<div class="backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"></div><h3>' + esc(title) + '</h3>' + html + '</div>';
  sheetHandlers = handlers || {};
  const f = layer.querySelector('[autofocus]'); if (f && !isMobile()) setTimeout(() => f.focus(), 30);
}
const closeSheet = () => { layer.innerHTML = ''; sheetHandlers = null; };
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
function openTx(t, copy) {
  const isNew = !t || copy;
  const d = t ? Object.assign({}, t) : { type: 'expense', amount: '', date: todayStr(), time: '', description: '', vendor: '', memo: '', category_id: null, account_id: (accts()[0] || {}).id || null };
  if (copy) { d.id = null; d.date = todayStr(); d.time = ''; d.recurring_id = null; }
  if (!d.category_id) { const c = cats(d.type).filter(x => !x.hidden)[0]; d.category_id = c ? c.id : null; }
  let ai = '';
  const draw = () => {
    const cl = cats(d.type).filter(c => !c.hidden || c.id === d.category_id);
    const items = ai ? ai.split(/\n|;/).map(s => s.trim()).filter(Boolean).map(s => parseLine(s, { cats: cats(), accts: accts() })).filter(Boolean) : [];
    const freq = (() => { const by = {}; bookTx().forEach(x => { const k = x.type + '|' + (x.description || ''); if (!x.description) return; (by[k] = by[k] || []).push(x); }); return Object.values(by).sort((a, b) => b.length - a.length).slice(0, 5).map(g => sortTx(g)[0]); })();
    const html = (isNew && !copy ? '<div class="ai-box"><span class="ai-tag">AI</span><input id="aiIn" placeholder="한 줄로 적기 · 예: 어제 저녁 쿠팡이츠 덮밥 23000" value="' + esc(ai) + '" autocomplete="off"' + (isMobile() ? '' : ' autofocus') + '></div>' +
        (ai ? (items.length ? '<div>' + items.map(it => '<div class="tx" style="cursor:default"><span class="ic ' + (it.type === 'income' ? 'inc' : 'exp') + '">' + icon(catIcon(catOf(it.category_id))) + '</span><span class="mid"><div>' + esc(it.description) + '</div><div class="small muted">' + esc([(catOf(it.category_id) || {}).name || '분류 없음', shortDate(it.date) + ' ' + weekday(it.date), it.time].join(' · ')) + '</div></span><span class="amt ' + (it.type === 'income' ? 'up' : 'down') + '">' + (it.type === 'income' ? '+' : '−') + won(it.amount) + '</span></div>').join('') + '</div><button class="save" data-aisave>' + (items.length > 1 ? items.length + '건 ' : '') + '저장 (Enter)</button>' : '<div class="small muted">금액을 찾지 못했어요. 숫자를 함께 적어 주세요.</div>') :
          (freq.length ? '<div class="small muted">자주 하는 거래</div><div class="chips">' + freq.map(x => '<button class="chip" data-freq="' + x.id + '">' + esc(x.description) + ' ' + won(x.amount) + '</button>').join('') + '</div>' : '') + '<div class="or small muted">또는 직접 입력</div>') : '') +
      (ai ? '' :
      '<div class="seg"><button class="exp" data-tkind="expense" aria-pressed="' + (d.type === 'expense') + '">나간 돈</button><button class="inc" data-tkind="income" aria-pressed="' + (d.type === 'income') + '">들어온 돈</button></div>' +
      '<label class="field"><span>금액</span><input id="fAmt" class="amount-in" inputmode="numeric" placeholder="0원" value="' + (d.amount ? Number(d.amount).toLocaleString('ko-KR') : '') + '"' + (!isNew || copy ? ' autofocus' : '') + '></label>' +
      '<div class="grid2"><label class="field"><span>날짜</span><input id="fDate" type="date" value="' + d.date + '"></label><label class="field"><span>시간 (비우면 지금)</span><input id="fTime" type="time" value="' + esc(d.time || '') + '"></label></div>' +
      '<div class="grid2"><label class="field"><span>내용</span><input id="fDesc" value="' + esc(d.description || '') + '" placeholder="예: 점심"></label><label class="field"><span>거래처</span><input id="fVendor" value="' + esc(d.vendor || '') + '" placeholder="예: 김밥천국"></label></div>' +
      '<div class="field"><span>분류</span><div class="chips">' + cl.map(c => '<button class="chip" data-tcat="' + c.id + '" aria-pressed="' + (d.category_id === c.id) + '">' + icon(catIcon(c)) + esc(c.name) + '</button>').join('') + '<button class="chip" data-tnewcat>' + icon('plus') + '새 분류</button></div></div>' +
      '<div class="field"><span>계좌·카드·현금</span><div class="chips">' + accts().map(a => '<button class="chip" data-tacct="' + a.id + '" aria-pressed="' + (d.account_id === a.id) + '">' + icon(acctIcon(a)) + esc(a.name) + '</button>').join('') + '<button class="chip" data-tnewacct>' + icon('plus') + '새 계좌·카드</button></div></div>' +
      '<label class="field"><span>메모</span><input id="fMemo" value="' + esc(d.memo || '') + '"></label>' +
      (isNew ? '<button class="save" data-tsave>저장</button>' : '<div class="acts3"><button class="btn-line danger" data-tdel>삭제</button><button class="btn-line" data-tcopy>복사</button><button class="save" data-tsave>저장</button></div>'));
    const keep = document.activeElement && document.activeElement.id, pos = keep && document.activeElement.selectionStart;
    sheet(isNew ? (copy ? '복사해서 추가' : '거래 추가') : '거래 고치기', html, handlers);
    if (keep) { const el = document.getElementById(keep); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } }
  };
  const readForm = () => {
    const g = id => document.getElementById(id);
    if (!g('fAmt')) return;
    d.amount = Number((g('fAmt').value || '').replace(/[^0-9]/g, '')) || 0; d.date = g('fDate').value || todayStr(); d.time = g('fTime').value;
    d.description = g('fDesc').value.trim(); d.vendor = g('fVendor').value.trim(); d.memo = g('fMemo').value.trim();
  };
  const saveItems = async items => {
    const rows = items.map(it => ({ id: uid(), book_id: book().id, date: it.date, time: it.time || nowTime(), type: it.type, amount: it.amount, description: it.description, vendor: it.vendor || null, memo: null, category_id: it.category_id, account_id: it.account_id || d.account_id, to_account_id: null, recurring_id: null, created_at: new Date().toISOString() }));
    closeSheet(); render();
    try { await putMany('v2_transactions', rows); toast(rows.length + '건 저장했어요', async () => { for (const r of rows) await remove('v2_transactions', r.id); }); render(); } catch (e) { fail(e); }
  };
  const handlers = {
    input: e => { if (e.target.id === 'aiIn') { ai = e.target.value; draw(); } else if (e.target.id === 'fAmt') { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v ? Number(v).toLocaleString('ko-KR') : ''; } },
    keydown: e => { if (e.target.id === 'aiIn' && e.key === 'Enter') { e.preventDefault(); const it = ai.split(/\n|;/).map(s => parseLine(s.trim(), { cats: cats(), accts: accts() })).filter(Boolean); if (it.length) saveItems(it); } },
    click: async e => {
      const t2 = e.target;
      const k = t2.closest('[data-tkind]'); if (k) { readForm(); d.type = k.dataset.tkind; const c = cats(d.type).filter(x => !x.hidden)[0]; d.category_id = c ? c.id : null; draw(); return; }
      const c = t2.closest('[data-tcat]'); if (c) { d.category_id = c.dataset.tcat; pick('tcat', c); return; }
      const a = t2.closest('[data-tacct]'); if (a) { d.account_id = a.dataset.tacct; pick('tacct', a); return; }
      const fq = t2.closest('[data-freq]'); if (fq) { const x = S.txs.find(y => y.id === fq.dataset.freq); Object.assign(d, { type: x.type, amount: x.amount, description: x.description, vendor: x.vendor, category_id: x.category_id, account_id: x.account_id, date: todayStr(), time: '' }); ai = ''; draw(); const f = document.getElementById('fDate'); if (f) f.focus(); return; }
      if (t2.closest('[data-aisave]')) { const it = ai.split(/\n|;/).map(s => parseLine(s.trim(), { cats: cats(), accts: accts() })).filter(Boolean); if (it.length) saveItems(it); return; }
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
        closeSheet(); render();
        try { await put('v2_transactions', row); render(); toast(old ? '고쳤어요' : won(row.amount) + ' 저장했어요', async () => { if (old) await put('v2_transactions', old); else await remove('v2_transactions', row.id); }); } catch (er) { fail(er); }
      }
    }
  };
  draw();
}

/* category add / edit (with move-on-delete) */
const PICK_ICONS = ['cup', 'food', 'bag', 'bus', 'house', 'repeat', 'coin', 'wallet', 'card', 'phone', 'med', 'edu', 'plane', 'gift', 'game', 'pet', 'shirt', 'heart', 'bolt', 'people', 'receipt', 'box', 'trend', 'tag'];
function openCat(id, type, after) {
  const c = id ? Object.assign({}, catOf(id)) : { id: uid(), book_id: book().id, name: '', type: type || V.setKind, color: null, icon: null, hidden: false, sort: cats(type || V.setKind).length + 1 };
  let ic = c.icon || null;
  const n = id ? bookTx().filter(t => t.category_id === id).length : 0;
  const draw = () => sheet(id ? '분류 고치기' : '새 분류 (' + (c.type === 'income' ? '들어온 돈' : '나간 돈') + ')',
    '<label class="field"><span>이름</span><input id="cName" value="' + esc(c.name) + '" maxlength="14" placeholder="예: 반려동물" autofocus></label>' +
    '<div class="field"><span>아이콘 ' + (ic ? '' : '(이름에 맞게 자동)') + '</span><div class="ipick">' + PICK_ICONS.map(k => '<button data-cic="' + k + '" aria-pressed="' + ((ic || iconForName(document.getElementById('cName') ? document.getElementById('cName').value : c.name, '')) === k) + '" aria-label="' + k + '">' + icon(k) + '</button>').join('') + '</div></div>' +
    (id ? '<div class="row"><span class="mid"><div>입력할 때 숨기기</div><div class="small muted">지난 거래는 그대로 남아요</div></span><button class="switch" role="switch" aria-label="숨기기" aria-checked="' + !!c.hidden + '" data-chide></button></div><div class="acts"><button class="btn-line danger" data-cdel>삭제</button><button class="save" data-csave>저장</button></div>' : '<button class="save" data-csave>추가</button>'), {
    input: e => { if (e.target.id === 'cName' && !ic) { const k = iconForName(e.target.value, ''); layer.querySelectorAll('[data-cic]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cic === k)); } },
    click: async e => {
      const t = e.target;
      const b = t.closest('[data-cic]'); if (b) { ic = b.dataset.cic; pick('cic', b); return; }
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
    '<label class="field"><span>시작 금액 (선택)</span><input id="aInit" inputmode="numeric" value="' + (a.initial_balance ? Number(a.initial_balance).toLocaleString('ko-KR') : '') + '" placeholder="0"></label>' +
    (id ? '<div class="acts"><button class="btn-line danger" data-adel>삭제</button><button class="save" data-asave>저장</button></div>' : '<button class="save" data-asave>추가</button>'), {
    click: async e => {
      const t = e.target;
      const ty = t.closest('[data-atype]'); if (ty) { a.type = ty.dataset.atype; pick('atype', ty); return; }
      if (t.closest('[data-asave]')) {
        const name = document.getElementById('aName').value.trim(); if (!name) return;
        const old = id ? Object.assign({}, acctOf(id)) : null;
        a.name = name; a.initial_balance = Number((document.getElementById('aInit').value || '').replace(/[^0-9-]/g, '')) || 0;
        closeSheet(); try { await put('v2_accounts', a); if (after) { after(a.id); return; } render(); toast(old ? '저장했어요' : name + ' 추가했어요', async () => { if (old) await put('v2_accounts', old); else await remove('v2_accounts', a.id); }); } catch (er) { fail(er); }
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
    '<div class="seg"><button class="exp" data-rkind="expense" aria-pressed="' + (r.type === 'expense') + '">나간 돈</button><button class="inc" data-rkind="income" aria-pressed="' + (r.type === 'income') + '">들어온 돈</button></div>' +
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
function recordRec(id) {
  const r = S.recs.find(x => x.id === id), m = ym(todayStr());
  openTx({ id: null, type: r.type, amount: r.amount, date: dueDate(r, m) > todayStr() ? todayStr() : dueDate(r, m), time: '', description: r.name, vendor: '', memo: '', category_id: r.category_id, account_id: r.account_id, recurring_id: r.id }, true);
  const tx = document.querySelector('.sheet h3'); if (tx) tx.textContent = r.name + ' 기록하기';
}

/* assets */
function openAsset(id) {
  const a = id ? Object.assign({}, S.assets.find(x => x.id === id)) : { id: uid(), book_id: book().id, name: '', type: 'deposit', value: 0, memo: null, cost: null, sort: assets().length + 1 };
  const hist = id ? S.snaps.filter(s => s.asset_id === id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 4) : [];
  sheet(id ? a.name : '자산 추가',
    (id ? '' : '<div class="chips">' + Object.entries(ASSET_TYPES).filter(([k]) => k !== 'invest').map(([k, v]) => '<button class="chip" data-stype="' + k + '" aria-pressed="' + (a.type === k) + '">' + icon(v[1]) + v[0] + '</button>').join('') + '</div>') +
    '<label class="field"><span>이름</span><input id="sName" value="' + esc(a.name) + '" placeholder="예: 토스 파킹통장"' + (id ? '' : ' autofocus') + '></label>' +
    '<label class="field"><span>지금 금액' + (a.type === 'loan' ? ' (남은 대출)' : '') + '</span><input id="sVal" class="amount-in" inputmode="numeric" value="' + (a.value ? Number(a.value).toLocaleString('ko-KR') : '') + '"' + (id ? ' autofocus' : '') + '></label>' +
    (hist.length ? '<div class="small muted">' + hist.map(h => shortDate(h.date) + ' ' + won(h.value)).join(' · ') + '</div>' : '') +
    (id ? '<div class="acts"><button class="btn-line danger" data-sdel>삭제</button><button class="save" data-ssave>저장</button></div>' : '<button class="save" data-ssave>추가</button>'), {
    input: e => { if (e.target.id === 'sVal') { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v ? Number(v).toLocaleString('ko-KR') : ''; } },
    click: async e => {
      const t = e.target;
      const ty = t.closest('[data-stype]'); if (ty) { a.type = ty.dataset.stype; pick('stype', ty); return; }
      if (t.closest('[data-ssave]')) {
        const name = document.getElementById('sName').value.trim(); if (!name) return;
        const v = Number((document.getElementById('sVal').value || '').replace(/[^0-9]/g, '')) || 0;
        const old = id ? Object.assign({}, S.assets.find(x => x.id === id)) : null;
        a.name = name; a.value = v; closeSheet();
        try { await put('v2_assets', a); await putSnap({ asset_id: a.id, date: todayStr(), value: v, memo: old ? '직접 수정' : '등록' }); render(); toast(old ? name + ' 금액을 고쳤어요' : name + ' 추가했어요', async () => { if (old) await put('v2_assets', old); else await remove('v2_assets', a.id); }); } catch (er) { fail(er); }
        return;
      }
      if (t.closest('[data-sdel]')) { closeSheet(); try { await remove('v2_assets', id); render(); toast(a.name + ' 삭제했어요'); } catch (er) { fail(er); } }
    }
  });
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
  if (el('[data-qclear]')) { V.q = ''; render(); return; }
  if (el('[data-totop]')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (el('[data-more]')) { V.showN += 10; render(); return; }
  if ((x = el('[data-hm]'))) { V.month = addMonths(V.month, +x.dataset.hm); render(); return; }
  if ((x = el('[data-lm]'))) { V.lm = addMonths(V.lm, +x.dataset.lm); V.catF = ''; render(); return; }
  if ((x = el('[data-kind]'))) { V.kind = x.dataset.kind; render(); return; }
  if ((x = el('[data-catf]'))) { V.catF = V.catF === x.dataset.catf ? '' : x.dataset.catf; render(); return; }
  if ((x = el('[data-alf]'))) { V.alF = x.dataset.alf; render(); return; }
  if ((x = el('[data-adone]'))) { const id = x.dataset.adone; dismiss(id); render(); toast('알림을 지웠어요', () => dismiss(id, false)); return; }
  if ((x = el('[data-aact]'))) {
    const a = computeAlerts().find(y => y.id === x.dataset.aact); if (!a) return; markSeen([a.id]);
    if (a.act === 'record') recordRec(a.ref);
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
  if ((x = el('[data-trestore]'))) { const id = x.dataset.trestore; await safe(restoreTx(id)); render(); toast('거래를 되살렸어요'); return; }
  if ((x = el('[data-tpurge]'))) {
    const id = x.dataset.tpurge, t = S.trash.find(y => y.id === id); if (!t) return;
    sheet('완전히 삭제할까요?', '<div>' + esc(t.description || '거래') + ' ' + won(t.amount) + ' (' + shortDate(t.date) + ')를 지우면 되살릴 수 없어요.</div><div class="acts"><button class="btn-line" data-close>취소</button><button class="save" data-purgeok style="background:var(--coral);color:#fff">완전 삭제</button></div>', {
      click: async e2 => { if (!e2.target.closest('[data-purgeok]')) return; closeSheet(); await safe(purgeTx(id)); render(); toast('완전히 삭제했어요'); }
    });
    return;
  }
  if (el('[data-trashmore]')) { V.trashN = (V.trashN || 10) + 10; render(); return; }
  if (el('[data-logout]')) { if (S.demo) { location.href = location.pathname; return; } await signOut(); location.reload(); }
});
function chartTip(e) {
  const h = e.target.closest && e.target.closest('rect.hit'), card = e.target.closest && e.target.closest('.chart');
  const tip = card && card.querySelector('.ctip');
  document.querySelectorAll('.chart .hit.on').forEach(r => r.classList.remove('on'));
  if (!tip) return;
  if (!h) { tip.hidden = true; return; }
  h.classList.add('on');
  const i = +h.dataset.inc, x = +h.dataset.exp, m = h.dataset.m, cr = card.getBoundingClientRect(), hr = h.getBoundingClientRect();
  tip.innerHTML = '<b>' + m.slice(0, 4) + '년 ' + monthLabel(m) + '</b><span><i style="background:var(--accent)"></i>들어온 돈 <b>' + won(i) + '</b></span><span><i style="background:var(--coral)"></i>나간 돈 <b>' + won(x) + '</b></span><span>남은 돈 <b>' + signed(i - x) + '</b></span>';
  tip.hidden = false;
  const left = hr.left - cr.left + hr.width / 2, w = tip.offsetWidth;
  tip.style.left = Math.max(12, Math.min(cr.width - w - 12, left - w / 2)) + 'px';
  tip.style.top = (hr.top - cr.top + 4) + 'px';
}
app.addEventListener('mousemove', chartTip);
app.addEventListener('mouseleave', () => document.querySelectorAll('.ctip').forEach(t => { t.hidden = true; }));
app.addEventListener('input', e => {
  if (e.target.id === 'q' || e.target.id === 'qtop') { V.q = e.target.value; if (V.q && V.view !== 'list') V.view = 'list'; render(); }
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
(async () => {
  if (new URLSearchParams(location.search).has('demo')) { loadDemo(); render(); return; }
  try { const u = await initClient(); if (u) await start(); else loginView(); }
  catch (e) { console.error(e); loginView('서버에 연결하지 못했어요. 잠시 뒤 다시 열어 주세요.'); }
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
