// Small shared helpers: icons, money/date formatting, ids, category icon matching.
import { CI } from './icons.js';
export const P = {
  wallet: 'M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7zm0 0V6a2 2 0 0 1 2-2h11M16 14h2',
  store: 'M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18M9 20v-6h6v6',
  building: 'M5 21V4h10v17M15 9h4v12M8 8h4M8 12h4M8 16h4M3 21h18',
  cup: 'M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8zM17 9h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 4-3 7h3v11',
  bag: 'M5 8h14l-1 12H6L5 8zM9 8a3 3 0 0 1 6 0',
  bus: 'M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2zM4 11h16M7 19v-3M17 19v-3',
  repeat: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  house: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5',
  coin: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM8 9l2 7 2-5 2 5 2-7',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10',
  bike: 'M5 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM19 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM5 15l4-6h5l3 6M14 9l-1-3h3',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  people: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  plus: 'M12 5v14M5 12h14',
  pie: 'M12 3v9h9M12 3a9 9 0 1 0 9 9',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  btc: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM9.5 8h4a2 2 0 0 1 0 4h-4zM9.5 12h4.5a2 2 0 0 1 0 4H9.5zM9.5 7v10M12 6v2M12 16v2',
  car: 'M5 16h14M6 16l1.5-5h9L18 16M6 16v3M18 16v3M8 14h.01M16 14h.01',
  loan: 'M4 7h16v10H4zM12 10v4M10 12h4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4',
  gear: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  check: 'M5 12l5 5L20 7',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  search: 'M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14zM20 20l-4-4',
  x: 'M6 6l12 12M18 6L6 18',
  chev: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  up: 'M12 19V5M5 12l7-7 7 7',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  phone: 'M7 3h10v18H7zM11 18h2',
  heart: 'M12 20s-7-4.5-9-9a5 5 0 0 1 9-3a5 5 0 0 1 9 3c-2 4.5-9 9-9 9z',
  gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  plane: 'M2 13l20-8-8 20-3-8-9-4z',
  med: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  game: 'M6 9h12a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8zM8 11v4M6 13h4M16 12h.01M18 14h.01',
  pet: 'M7 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM17 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM4 14a2 2 0 1 0 0-4M20 14a2 2 0 1 0 0-4M12 21c-3 0-5-2-5-4s2-4 5-4 5 2 5 4-2 4-5 4z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  edu: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  shirt: 'M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z',
  tag: 'M3 12V3h9l9 9-9 9zM8 8h.01',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z'
};
export const icon = (k, cls) => '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (CI[k] ? CI[k][0] : P[k] || P.tag) + '"/></svg>';

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const won = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원';
export const signed = n => (n > 0 ? '+' : '') + won(n);
export const man = n => (n < 0 ? '−' : '') + Math.round(Math.abs(n) / 10000).toLocaleString('ko-KR') + '만원';
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

// Dates are handled as Korea local dates (YYYY-MM-DD strings).
export function todayStr() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
export function nowTime() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(11, 16);
}
export const ym = d => d.slice(0, 7);
export function addMonths(m, k) {
  let [y, mo] = m.split('-').map(Number); mo += k;
  while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; }
  return y + '-' + String(mo).padStart(2, '0');
}
export function addDays(d, k) {
  const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10);
}
export const monthLabel = m => Number(m.slice(5)) + '월';
export const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const weekday = d => WD[new Date(d + 'T00:00:00Z').getUTCDay()];
export const shortDate = d => d.slice(5).replace('-', '.');

// Category icon matching by name: score every library icon by its Korean keywords.
// (Stand-in for the planned AI pick; same interface so AI can replace it later.)
const CI_TAGS = Object.keys(CI).map(k => [k, CI[k][2].toLowerCase().split(' ')]);
export function suggestIcons(name, n = 3) {
  const q = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (!q) return [];
  const sc = [];
  for (const [k, tags] of CI_TAGS) {
    let best = 0;
    tags.forEach((t, i) => {
      let v = 0;
      if (q === t) v = 100;
      else if (q.includes(t)) v = 20 + t.length * 4;
      else if (q.length >= 2 && t.startsWith(q)) v = 10 + q.length * 3;
      else if (q.length >= 2 && t.includes(q)) v = 6 + q.length * 2;
      if (v) v -= i * 0.5;
      if (v > best) best = v;
    });
    if (best > 0) sc.push([k, best]);
  }
  const out = sc.sort((x, y) => y[1] - x[1]).slice(0, n).map(x => x[0]);
  // Fill up to n with neighbours from the best match's group so there is always a choice.
  if (out.length && out.length < n) for (const k of Object.keys(CI)) { if (out.length >= n) break; if (CI[k][1] === CI[out[0]][1] && !out.includes(k)) out.push(k); }
  return out;
}
export function iconForName(name, fallback) {
  return suggestIcons(name, 1)[0] || (fallback == null ? 'tag' : fallback);
}
export const ACCT_TYPES = [['bank', '입출금 통장', 'bank'], ['saving', '저축 통장', 'coin'], ['check', '체크카드', 'card'], ['card', '신용카드', 'card'], ['cash', '현금', 'cash'], ['pay', '간편결제', 'phone']];
export const acctLabel = t => (ACCT_TYPES.find(x => x[0] === t) || [t, t || '기타'])[1];
export const acctIcon = a => (ACCT_TYPES.find(x => x[0] === a.type) || [0, 0, 'bank'])[2];
