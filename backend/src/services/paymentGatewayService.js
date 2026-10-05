const axios = require("axios");

const { decrypt } = require("../utils/encryption");

// بوابة الدفع الوحيدة المدعومة لعربون الحجز: ميسر (عبر فواتير Moyasar Invoices)
const MOYASAR_PROVIDER = "moyasar";
const MOYASAR_API_BASE = "https://api.moyasar.com/v1";
// يطابق مهلة إلغاء المواعيد غير المدفوعة في cleanupPendingPayments (15 دقيقة)
const PAYMENT_LINK_TTL_MINUTES = 15;
const MOYASAR_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toHalalas = (value) => Math.round(toMoney(value) * 100);

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// نُبقي التوقيع (paymentSettings) للتوافق مع الاستدعاءات الحالية
const getEnabledProvider = () => MOYASAR_PROVIDER;

const isOnlinePaymentConfigured = (paymentSettings = {}) => {
  if (!paymentSettings.isOnlinePaymentEnabled) return false;
  if (toMoney(paymentSettings.depositAmount) <= 0) return false;
  return Boolean(paymentSettings.moyasarSecretKey);
};

const buildAbsoluteUrl = (req, path) => {
  const configuredBaseUrl =
    process.env.PUBLIC_APP_URL || process.env.APP_URL || process.env.BACKEND_URL;
  const baseUrl =
    configuredBaseUrl || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
};

const buildPublicBookingUrl = (req, path) => {
  const configuredBaseUrl =
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    req.get("origin") ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL;
  const baseUrl =
    configuredBaseUrl || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
};

const getTenantMoyasarSecret = (tenant) => {
  const secretKey = decrypt(tenant?.paymentSettings?.moyasarSecretKey);
  if (!secretKey) {
    throw createHttpError("إعدادات ميسر غير مكتملة لهذا الصالون.", 400);
  }
  return secretKey;
};

const moyasarRequest = (method, path, secretKey, data) =>
  axios.request({
    method,
    url: `${MOYASAR_API_BASE}${path}`,
    data,
    timeout: 20000,
    auth: { username: secretKey, password: "" },
    headers: { Accept: "application/json" },
  });

// إنشاء فاتورة ميسر للعربون وإرجاع رابط صفحة الدفع
const createBookingPaymentSession = async ({ tenant, appointment, amount, req }) => {
  const secretKey = getTenantMoyasarSecret(tenant);
  const reference = `booking_${appointment._id}`;
  const returnUrl = buildPublicBookingUrl(
    req,
    `/${tenant.slug}?payment=return&appointmentId=${appointment._id}`,
  );
  const callbackUrl = buildAbsoluteUrl(
    req,
    `/api/appointments/webhook/moyasar?tenantId=${tenant._id}`,
  );

  let response;
  try {
    response = await moyasarRequest("post", "/invoices", secretKey, {
      amount: toHalalas(amount),
      currency: "SAR",
      description: `عربون حجز موعد - ${tenant.salonName}`,
      callback_url: callbackUrl,
      success_url: returnUrl,
      back_url: returnUrl,
      expired_at: new Date(
        Date.now() + PAYMENT_LINK_TTL_MINUTES * 60 * 1000,
      ).toISOString(),
      metadata: {
        provider: MOYASAR_PROVIDER,
        reference,
        tenantId: String(tenant._id),
        appointmentId: String(appointment._id),
      },
    });
  } catch (error) {
    console.error(
      "Moyasar invoice error:",
      error.response?.data || error.message,
    );
    throw createHttpError("تعذر إنشاء رابط الدفع عبر ميسر.", 502);
  }

  if (!response.data?.url) {
    throw createHttpError("لم يرجع ميسر رابط دفع صالح.", 502);
  }

  return {
    provider: MOYASAR_PROVIDER,
    amount: toMoney(amount),
    paymentUrl: response.data.url,
    providerPaymentId: response.data.id || "",
    reference,
  };
};

const assertMoyasarId = (id) => {
  const value = String(id || "");
  if (!MOYASAR_ID_PATTERN.test(value)) {
    throw createHttpError("معرّف عملية ميسر غير صالح.", 400);
  }
  return value;
};

/**
 * لا نثق بمحتوى الـ webhook: نأخذ منه المعرّف فقط، ثم نجلب الفاتورة أو
 * الدفعة من API ميسر مباشرة بمفتاح الصالون السري.
 * يدعم: إشعار الفاتورة (callback_url)، وكائن دفعة، وصيغة {type, data}.
 */
const getVerifiedMoyasarPayment = async ({ payload = {}, secretKey }) => {
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : payload;

  const looksLikeInvoice =
    Array.isArray(data.payments) || /invoice/i.test(String(data.url || ""));
  const invoiceId = data.invoice_id || (looksLikeInvoice ? data.id : null);

  if (invoiceId) {
    const { data: invoice } = await moyasarRequest(
      "get",
      `/invoices/${assertMoyasarId(invoiceId)}`,
      secretKey,
    );
    const paidPayment = (invoice.payments || []).find(
      (payment) => payment.status === "paid",
    );
    return {
      status: invoice.status,
      amount: Number(invoice.amount) || 0,
      metadata: invoice.metadata || {},
      providerPaymentId: paidPayment?.id || invoice.id,
      method: paidPayment?.source?.type || "online",
    };
  }

  if (!data.id) throw createHttpError("بيانات webhook ناقصة.", 400);

  const { data: payment } = await moyasarRequest(
    "get",
    `/payments/${assertMoyasarId(data.id)}`,
    secretKey,
  );
  return {
    status: payment.status,
    amount: Number(payment.amount) || 0,
    metadata: payment.metadata || {},
    providerPaymentId: payment.id,
    method: payment.source?.type || "online",
  };
};

module.exports = {
  MOYASAR_PROVIDER,
  createBookingPaymentSession,
  getEnabledProvider,
  getTenantMoyasarSecret,
  getVerifiedMoyasarPayment,
  isOnlinePaymentConfigured,
  toMoney,
};
