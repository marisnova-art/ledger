// ai-parse: turns one-line entries ("어제 저녁 쿠팡이츠 덮밥 23000") into transactions.
// The Anthropic key lives only here, as the ANTHROPIC_API_KEY secret. The app falls back to its
// local rules whenever this function fails, is over the daily limit, or has no key.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") || "50");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Ref = { id: string; name: string; type: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out(405, { error: "method" });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return out(503, { error: "no_key" });

  // Count the call against the signed-in user's daily limit (runs as the user, so RLS applies).
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: ok, error: bumpErr } = await sb.rpc("v2_ai_bump", { p_limit: DAILY_LIMIT });
  if (bumpErr) return out(401, { error: "auth" });
  if (!ok) return out(429, { error: "limit", limit: DAILY_LIMIT });

  let body: { text?: string; today?: string; now?: string; categories?: Ref[]; accounts?: Ref[] };
  try { body = await req.json(); } catch { return out(400, { error: "json" }); }
  const text = String(body.text || "").slice(0, 600).trim();
  if (!text) return out(400, { error: "empty" });
  const cats = (body.categories || []).slice(0, 80).map((c) => ({ id: String(c.id), name: String(c.name).slice(0, 20), type: c.type === "income" ? "income" : "expense" }));
  const accts = (body.accounts || []).slice(0, 30).map((a) => ({ id: String(a.id), name: String(a.name).slice(0, 20), type: String(a.type || "") }));

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "time", "type", "amount", "description", "vendor", "category_id", "account_id"],
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            time: { type: "string", description: "HH:MM 24h, or empty if not stated" },
            type: { type: "string", enum: ["expense", "income"] },
            amount: { type: "integer", description: "Korean won, positive whole number" },
            description: { type: "string", description: "Short Korean label of what it was, e.g. 소고기덮밥" },
            vendor: { type: "string", description: "Shop or counterparty if stated, else empty" },
            category_id: { type: "string", enum: ["", ...cats.map((c) => c.id)] },
            account_id: { type: "string", enum: ["", ...accts.map((a) => a.id)] },
          },
        },
      },
    },
  };

  const system = [
    "You turn short Korean money notes into ledger entries for a personal bookkeeping app.",
    "Each line or each separate purchase in the note becomes one item. If there is no amount, return no item for it.",
    "Resolve relative dates (오늘, 어제, 그제, 지난 금요일, 11/3) against today's date. Never return a future date; a month/day later than today means last year.",
    "Time: use a stated time; 아침 08:00, 점심 12:30, 오후 15:00, 저녁 19:00, 밤 22:00, 새벽 03:00; otherwise empty.",
    "Amounts: 2만3천 = 23000, 1.5만 = 15000. Income words: 입금, 받음, 월급, 급여, 환급, 용돈, 이자, 판매, 정산.",
    "Pick category_id from the user's own categories with the same type; choose the closest by meaning. Use empty only if none is close.",
    "Pick account_id only when the note names that account, card, or cash; otherwise empty.",
    "description: a short Korean label of the item (not the shop name when the item is clear). vendor: the shop or person if named.",
  ].join("\n");
  const user = JSON.stringify({ today: body.today, now: body.now, categories: cats, accounts: accts, note: text });

  const client = new Anthropic({ apiKey: key });
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    } as any);
    if (res.stop_reason === "refusal") return out(422, { error: "refusal" });
    const txt = res.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(txt);
    return out(200, { items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return out(429, { error: "busy" });
    if (e instanceof Anthropic.APIError) return out(502, { error: "api", status: e.status });
    return out(500, { error: "parse" });
  }
});
