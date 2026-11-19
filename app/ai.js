// One-line entry parser ("어제 저녁 쿠팡이츠 덮밥 23000") → { date, time, type, amount, description, category_id, account_id }.
// Runs locally with keyword rules; later this can be swapped for a real AI call with the same output shape.
import { todayStr, addDays, iconForName } from './util.js';

const KW = [[/스타벅스|커피|카페|이디야|메가|투썸|빽다방/, ['카페', '커피']], [/배민|배달의민족|쿠팡이츠|요기요|배달/, ['배달', '식비', '외식']],
  [/쿠팡|무신사|네이버페이|11번가|다이소|올리브영/, ['쇼핑', '생활']], [/택시|버스|지하철|주유|카카오T|교통/, ['교통']],
  [/월세|임대|관리비/, ['주거', '월세', '관리비']], [/넷플릭스|유튜브|구독|멤버십|디즈니|왓챠/, ['구독', '구독료']],
  [/월급|급여/, ['급여', '월급']], [/식당|점심|저녁|아침|김밥|치킨|마트|편의점|덮밥|국밥/, ['식비', '외식']],
  [/전기|가스|수도/, ['공과금', '주거']], [/병원|약국|약/, ['의료', '병원']], [/통신|휴대폰|핸드폰/, ['통신', '통신비']]];
const TIMEWORD = { 아침: '08:00', 오전: '10:00', 점심: '12:30', 오후: '15:00', 저녁: '19:00', 밤: '22:00', 새벽: '03:00' };

export function parseLine(line, { cats, accts }) {
  if (!line) return null;
  const t = todayStr(); let rest = ' ' + line + ' ', date = t;
  const dm = rest.match(/\s(오늘|어제|그제|그저께)\s/);
  if (dm) { date = addDays(t, { 오늘: 0, 어제: -1, 그제: -2, 그저께: -2 }[dm[1]]); rest = rest.replace(dm[0], ' '); }
  const dd = rest.match(/\s(\d{1,2})[./](\d{1,2})\s/) || rest.match(/\s(\d{1,2})월\s*(\d{1,2})일\s/);
  if (dd) { let y = t.slice(0, 4); const c = y + '-' + dd[1].padStart(2, '0') + '-' + dd[2].padStart(2, '0'); date = c > t ? (Number(y) - 1) + c.slice(4) : c; rest = rest.replace(dd[0], ' '); }
  let time = '', meal = '';
  const tm = rest.match(/\s(?:(오전|오후|아침|저녁|밤|새벽)\s*)?(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})분|\s*반)?)\s/);
  if (tm) { let h = +tm[2]; const m = tm[3] || tm[4] || (/반/.test(tm[0]) ? '30' : '00'); if (['오후', '저녁', '밤'].includes(tm[1]) && h < 12) h += 12; time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); rest = rest.replace(tm[0], ' '); }
  else { const pm = rest.match(/\s(오전|오후|아침|점심|저녁|밤|새벽)\s/); if (pm) { time = TIMEWORD[pm[1]]; rest = rest.replace(pm[0], ' '); if (pm[1] === '점심' || pm[1] === '저녁' || pm[1] === '아침') meal = pm[1]; } }
  const am = rest.match(/(\d[\d,]*(?:\.\d+)?)\s*(만|천)?\s*원?(?=\s)/); if (!am) return null;
  const amount = Math.round(Number(am[1].replace(/,/g, '')) * (am[2] === '만' ? 10000 : am[2] === '천' ? 1000 : 1));
  if (!amount) return null;
  rest = rest.replace(am[0], ' ');
  const income = /입금|수입|받음|받았|매출|정산|월급|급여|환급|용돈|이자/.test(line);
  const type = income ? 'income' : 'expense';
  let account_id = null;
  (accts || []).forEach(a => { if (!account_id && line.includes(a.name)) { account_id = a.id; rest = rest.replace(a.name, ' '); } });
  if (!account_id) { const k = /카드/.test(line) ? 'card' : /현금/.test(line) ? 'cash' : null; const a = k && (accts || []).find(x => x.type === k); if (a) account_id = a.id; }
  rest = rest.replace(/입금|받음|받았|사먹음|사먹었|사먹|샀음|샀다|결제함|결제|구매함|구매|썼음|씀|냈음|냄|카드|현금/g, ' ').replace(/\s+/g, ' ').trim();
  const pool = (cats || []).filter(c => c.type === type && !c.hidden);
  let cat = pool.find(c => line.includes(c.name));
  if (!cat) for (const [re, names] of KW) if (re.test(line)) { cat = pool.find(c => names.some(n => c.name.includes(n))); if (cat) break; }
  if (!cat) { const k = iconForName(line, ''); if (k) cat = pool.find(c => (c.icon || iconForName(c.name, '')) === k); }
  cat = cat || pool[0];
  return { date, time, type, amount, description: rest || (meal && type === 'expense' ? meal : '') || (cat ? cat.name : ''), category_id: cat ? cat.id : null, account_id };
}

// Real AI parse through /api/ai-parse (Cloudflare Workers AI). Returns items in the same shape as parseLine,
// or null when AI is unavailable (demo, offline, no key, daily limit) so callers keep the local result.
const aiCache = new Map();
export const aiInfo = { model: '', why: '', err: '' }; // which model answered last (shown in the entry sheet)
export function aiParse(text, { sb, cats, accts, now, image }) {
  text = (text || '').trim();
  if (!sb || (!image && text.length < 4)) return Promise.resolve(null);
  if (!image && aiCache.has(text)) return aiCache.get(text);
  const catIds = new Set((cats || []).map(c => c.id)), acctIds = new Set((accts || []).map(a => a.id)), t = todayStr();
  const p = sb.auth.getSession().then(({ data: ses }) => {
    const tok = ses && ses.session && ses.session.access_token; if (!tok) return null;
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 45000);
    aiInfo.err = '';
    return fetch('/api/ai-parse', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({
      text, today: t, now, image,
      categories: (cats || []).filter(c => !c.hidden).map(c => ({ id: c.id, name: c.name, type: c.type })),
      accounts: (accts || []).map(a => ({ id: a.id, name: a.name, type: a.type }))
    }) }).then(async r => { clearTimeout(to); if (r.ok) return r.json(); let j = {}; try { j = await r.json(); } catch (e) {} aiInfo.err = 'http ' + r.status + (j.error ? ' ' + j.error : '') + (j.detail ? ' ' + j.detail : ''); return null; })
      .catch(e => { clearTimeout(to); aiInfo.err = e && e.name === 'AbortError' ? '45초 안에 응답이 없어요' : '연결 실패'; return null; });
  }).then(data => {
    if (!data) { if (!aiInfo.err) aiInfo.err = '로그인 정보 없음'; return null; }
    if (!Array.isArray(data.items)) { aiInfo.err = '응답 형식 오류'; return null; }
    aiInfo.model = String(data.model || ''); aiInfo.why = String(data.gemini || '');
    const items = data.items.map(it => ({
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) && it.date <= t ? it.date : t,
      time: /^\d{2}:\d{2}$/.test(it.time) ? it.time : '',
      type: it.type === 'income' ? 'income' : 'expense',
      amount: Math.abs(Math.round(Number(it.amount) || 0)),
      description: String(it.description || '').slice(0, 60),
      vendor: String(it.vendor || '').slice(0, 40),
      category_id: catIds.has(it.category_id) ? it.category_id : null,
      account_id: acctIds.has(it.account_id) ? it.account_id : null
    })).filter(it => it.amount > 0);
    if (!items.length) aiInfo.err = 'AI가 금액 있는 거래를 못 찾음 · ' + (aiInfo.model || '?');
    return items.length ? items : null;
  }).catch(() => null);
  if (image) return p;
  p.then(r => { if (!r) aiCache.delete(text); });
  aiCache.set(text, p);
  return p;
}

// Shrinks a photo/screenshot to at most 1600px on the long side as JPEG, returned as base64 (no prefix).
export function imageToB64(file, max = 1600) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    im.onerror = () => { URL.revokeObjectURL(url); bad(new Error('image')); };
    im.src = url;
  });
}

// Smaller JPEG for keeping the receipt itself (about 100–200KB).
export function imageToBlob(file, max = 1200, q = 0.72) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); c.toBlob(b => b ? ok(b) : bad(new Error('image')), 'image/jpeg', q);
    };
    im.onerror = () => { URL.revokeObjectURL(url); bad(new Error('image')); };
    im.src = url;
  });
}
