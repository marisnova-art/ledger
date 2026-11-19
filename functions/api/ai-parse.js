// POST /api/ai-parse  — Cloudflare Pages Function.
// Tries Google Gemini first (free tier, key in the GEMINI_API_KEY secret); when it is missing, out of
// quota or failing, falls back to Cloudflare Workers AI (binding "AI", Llama).
// Turns a one-line note ("어제 저녁 쿠팡이츠 덮밥 23000") or a receipt / bank-app screenshot into
// transactions. Signed-in users only; each call is counted against a daily limit in Supabase
// (public.v2_ai_bump). The app falls back to its local rules whenever this returns an error.

const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'; // text + image, JSON mode, multilingual
const SUPABASE_URL = 'https://wpakjtlyfxwnrsuxkyjv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kw1ZI6jTAnvQqKGUUYIZVA_v7jRZjfl'; // public key; RLS protects data
const DAILY_LIMIT = 50;
// Tried in order; a busy (503), missing (404) or rate-limited (429) model moves on to the next one.
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

async function gemini(env, system, text, img) {
  const list = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...GEMINI_MODELS.filter(m => m !== env.GEMINI_MODEL)] : GEMINI_MODELS;
  const errs = [];
  for (const m of list) {
    try { return await geminiOne(env, m, system, text, img); }
    catch (e) { errs.push(String(e && e.message || e)); if (!/http (503|404|429|500)/.test(String(e && e.message))) break; }
  }
  throw new Error(errs.join(' / '));
}
// One Gemini REST call. Returns parsed {items} or throws (so the caller can try the next model).
async function geminiOne(env, model, system, text, img) {
  const parts = [{ text }];
  if (img) parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } });
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2000 }
    })
  });
  if (!r.ok) { let m = ''; try { m = ((await r.json()).error || {}).status || ''; } catch {} throw new Error('http ' + r.status + (m ? ' ' + m : '') + ' · ' + model); }
  const d = await r.json();
  const t = ((d.candidates || [])[0] || {}).content;
  const txt = t && Array.isArray(t.parts) ? t.parts.map(p => p.text || '').join('') : '';
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('gemini empty');
  return { out: JSON.parse(m[0]), model };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.AI && !env.GEMINI_API_KEY) return json(503, { error: 'no_ai' });
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

  const prompt = text || '이 이미지의 거래를 정리해 주세요.';
  let out = null, used = '', why = '';
  if (env.GEMINI_API_KEY) {
    try { const g = await gemini(env, system, prompt, img); out = g.out; used = g.model; } catch (e) { out = null; why = String(e && e.message || e).slice(0, 120); } // quota (429) or error → Llama
  } else why = 'no_key';
  if (!out && env.AI) {
    const userContent = img
      ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + img } }]
      : prompt;
    try {
      const res = await env.AI.run(MODEL, {
        messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
        response_format: { type: 'json_schema', json_schema: schema },
        max_tokens: 2000,
        temperature: 0.1
      });
      out = res && res.response;
      if (typeof out === 'string') { const m = out.match(/\{[\s\S]*\}/); try { out = m ? JSON.parse(m[0]) : null; } catch { out = null; } }
      used = MODEL;
    } catch (e) {
      return json(502, { error: 'ai', detail: String(e && e.message || e).slice(0, 200) });
    }
  }
  const items = out && Array.isArray(out.items) ? out.items : [];
  return json(200, { items, model: used, gemini: why });
}

export const onRequest = () => json(405, { error: 'method' });
