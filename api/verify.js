const { creditPayment } = require("./_lib");

module.exports = async (req, res) => {
  const reference = req.query.reference;
  if (!reference) return res.status(400).json({ ok: false });
  const result = await creditPayment(reference);
  res.status(200).json(result);
};