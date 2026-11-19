// POST /api/ai-parse  — Cloudflare Pages Function using Workers AI (binding "AI").
// Turns a one-line note ("어제 저녁 쿠팡이츠 덮밥 23000") or a receipt / bank-app screenshot into
// transactions. Signed-in users only; each call is counted against a daily limit in Supabase
// (public.v2_ai_bump). The app falls back to its local rules whenever this returns an error.

const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'; // text + image, JSON mode, multilingual
const SUPABASE_URL = 'https://wpakjtlyfxwnrsuxkyjv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kw1ZI6jTAnvQqKGUUYIZVA_v7jRZjfl'; // public key; RLS protects data
const DAILY_LIMIT = 50;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json(503, { error: 'no_ai_binding' });
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return json(401, { error: 'auth' });

  // Count this call for the signed-in user (the RPC runs as that user, so a bad token fails here).
  const bump = await fetch(SUPABASE_URL + '/rest/v1/rpc/v2_ai_bump', {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_limit: Number(env.AI_DAILY_LIMIT || DAILY_LIMIT) })
  });
  if (!bump.ok) return json(401, { error: 'auth' });
  if ((await bump.json()) !== true) return json(429, { error: 'limit' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'json' }); }
  const text = String(body.text || '').slice(0, 600).trim();
  const img = body.image && typeof body.image === 'string' && body.image.length < 7000000 ? body.image : null;
  if (!text && !img) return json(400, { error: 'empty' });
  const cats = (body.categories || []).slice(0, 80).map(c => ({ id: String(c.id), name: String(c.name).slice(0, 20), type: c.type === 'income' ? 'income' : 'expense' }));
  const accts = (body.accounts || []).slice(0, 30).map(a => ({ id: String(a.id), name: String(a.name).slice(0, 20), type: String(a.type || '') }));
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' }, time: { type: 'string' },
            type: { type: 'string', enum: ['expense', 'income'] },
            amount: { type: 'integer' },
            description: { type: 'string' }, vendor: { type: 'string' },
            category_id: { type: 'string' }, account_id: { type: 'string' }
          },
          required: ['date', 'time', 'type', 'amount', 'description', 'vendor', 'category_id', 'account_id']
        }
      }
    },
    required: ['items']
  };

  const system = [
    'You turn short Korean money notes into ledger entries for a bookkeeping app. Reply with JSON only: {"items":[...]}.',
    'Each item: date (YYYY-MM-DD), time (HH:MM 24h or ""), type ("expense" or "income"), amount (positive integer won), description (short Korean label of the item), vendor (shop or person, or ""), category_id, account_id.',
    'Today is ' + today + '. Resolve 오늘/어제/그제/요일/월일 against today. Never a future date; a month/day after today means last year.',
    'Time words: 아침 08:00, 점심 12:30, 오후 15:00, 저녁 19:00, 밤 22:00, 새벽 03:00. Otherwise "" unless stated.',
    'Amounts: 2만3천 = 23000, 1.5만 = 15000. Income words: 입금, 받음, 월급, 급여, 환급, 용돈, 이자, 판매, 정산, 캐시백.',
    'category_id must be the id of one of the user categories below with the same type, closest in meaning; "" only if none fits.',
    'account_id must be the id of one of the user accounts below only if the note names it (or 카드/현금 matches its type); else "".',
    'If there is no amount for something, leave it out. If nothing is found, return {"items":[]}.',
    'Images are receipts or bank/card app screenshots. A receipt = one item with the total paid, the shop as vendor, and the receipt date/time. A transaction list = one item per row; use each row\'s sign or in/out column for type. Skip balances, subtotals, cancelled rows and anything unreadable.',
    'User categories: ' + JSON.stringify(cats),
    'User accounts: ' + JSON.stringify(accts)
  ].join('\n');

  const userContent = img
    ? [{ type: 'text', text: text || '이 이미지의 거래를 정리해 주세요.' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + img } }]
    : text;

  let res;
  try {
    res = await env.AI.run(MODEL, {
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
      response_format: { type: 'json_schema', json_schema: schema },
      max_tokens: 2000,
      temperature: 0.1
    });
  } catch (e) {
    return json(502, { error: 'ai', detail: String(e && e.message || e).slice(0, 200) });
  }
  let out = res && res.response;
  if (typeof out === 'string') { const m = out.match(/\{[\s\S]*\}/); try { out = m ? JSON.parse(m[0]) : null; } catch { out = null; } }
  const items = out && Array.isArray(out.items) ? out.items : [];
  return json(200, { items, model: MODEL });
}

export const onRequest = () => json(405, { error: 'method' });
