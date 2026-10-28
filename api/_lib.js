const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY || "";
const PS_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const LIVE_MODE = PS_SECRET.startsWith("sk_live");

const PRICE_KES = 150;
const DAYS = 30;

function serviceHeaders(extra = {}) {
  const h = { apikey: SB_SERVICE, "Content-Type": "application/json", ...extra };
  if (SB_SERVICE.startsWith("eyJ")) h.Authorization = "Bearer " + SB_SERVICE;
  return h;
}

async function getUser(token) {
  const r = await fetch(SB_URL + "/auth/v1/user", {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!r.ok) return null;
  return r.json();
}

async function paystack(path, options = {}) {
  const r = await fetch("https://api.paystack.co" + path, {
    ...options,
    headers: { Authorization: "Bearer " + PS_SECRET, "Content-Type": "application/json" },
  });
  return r.json();
}

async function creditPayment(reference) {
  const result = await paystack("/transaction/verify/" + encodeURIComponent(reference));
  const tx = result && result.data;
  if (!result.status || !tx || tx.status !== "success") return { ok: false, reason: "not_successful" };
  if (LIVE_MODE && tx.domain !== "live") return { ok: false, reason: "test_payment" };
  if (tx.currency !== "KES" || tx.amount < PRICE_KES * 100) return { ok: false, reason: "wrong_amount" };

  const userId = tx.metadata && tx.metadata.user_id;
  if (!userId) return { ok: false, reason: "no_user" };

  // Record this payment once (duplicate reference = already counted)
  const ins = await fetch(SB_URL + "/rest/v1/payments", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ reference, user_id: userId, amount: tx.amount / 100 }),
  });
  if (ins.status === 409) return { ok: true, already: true };
  if (!ins.ok) return { ok: false, reason: "db_error" };

  // Extend from today, or from the current expiry if still active
  const cur = await fetch(
    SB_URL + "/rest/v1/subscriptions?select=expires_at&user_id=eq." + userId,
    { headers: serviceHeaders() }
  );
  const rows = cur.ok ? await cur.json() : [];
  const now = new Date();
  const existing = rows[0] && rows[0].expires_at ? new Date(rows[0].expires_at) : null;
  const base = existing && existing > now ? existing : now;
  const expires = new Date(base.getTime() + DAYS * 24 * 60 * 60 * 1000);

  const up = await fetch(SB_URL + "/rest/v1/subscriptions", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      user_id: userId,
      status: "active",
      expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    }),
  });

  if (!up.ok) {
    // undo the payment record so a retry can credit it
    await fetch(SB_URL + "/rest/v1/payments?reference=eq." + encodeURIComponent(reference), {
      method: "DELETE",
      headers: serviceHeaders(),
    });
    return { ok: false, reason: "db_error" };
  }
  return { ok: true };
}

module.exports = { getUser, paystack, creditPayment, PRICE_KES };