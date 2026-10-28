const { getUser, paystack, PRICE_KES } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const user = token ? await getUser(token) : null;
  if (!user || !user.id) return res.status(401).json({ error: "Please log in again." });

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const result = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      amount: PRICE_KES * 100,
      currency: "KES",
      callback_url: "https://" + host + "/",
      metadata: { user_id: user.id, plan: "monthly" },
    }),
  });

  if (!result.status) return res.status(400).json({ error: result.message || "Could not start payment" });
  res.status(200).json({ url: result.data.authorization_url });
};