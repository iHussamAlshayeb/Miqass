// مفتاح إيقاف الربط مع Zakaty: متوقف ما لم يُضبط ZAKATY_ENABLED=true صراحةً
const ZAKATY_DISABLED_MESSAGE = "الربط مع Zakaty متوقف حالياً.";

const isZakatyEnabled = () => String(process.env.ZAKATY_ENABLED || "").trim().toLowerCase() === "true";

const zakatyDisabledError = () => {
  const error = new Error(ZAKATY_DISABLED_MESSAGE);
  error.statusCode = 503;
  error.zakatyDisabled = true;
  return error;
};

const requireZakatyEnabled = (req, res, next) => {
  if (isZakatyEnabled()) return next();
  return res.status(503).json({ message: ZAKATY_DISABLED_MESSAGE, zakatyDisabled: true });
};

module.exports = { isZakatyEnabled, zakatyDisabledError, requireZakatyEnabled, ZAKATY_DISABLED_MESSAGE };
