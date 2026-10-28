const { creditPayment } = require("./_lib");

module.exports = async (req, res) => {
  const body = req.body || {};
  if (body.event === "charge.success" && body.data && body.data.reference) {
    await creditPayment(body.data.reference);
  }
  res.status(200).send("ok");
};