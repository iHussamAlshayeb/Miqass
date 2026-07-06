const crypto = require("crypto");

const axios = require("axios");

const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const { decrypt } = require("../utils/encryption");

const STC_BANK_PROVIDER = "stc_bank";
const SUPPORTED_PAYMENT_PROVIDERS = [STC_BANK_PROVIDER, "moyasar"];

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getEnabledProvider = (paymentSettings = {}) => {
  const provider = paymentSettings.provider || STC_BANK_PROVIDER;
  return SUPPORTED_PAYMENT_PROVIDERS.includes(provider)
    ? provider
    : STC_BANK_PROVIDER;
};

const isOnlinePaymentConfigured = (paymentSettings = {}) => {
  if (!paymentSettings.isOnlinePaymentEnabled) return false;
  if (toMoney(paymentSettings.depositAmount) <= 0) return false;

  const provider = getEnabledProvider(paymentSettings);
  if (provider !== STC_BANK_PROVIDER) return false;

  const stcBank = paymentSettings.stcBank || {};
  return Boolean(
    stcBank.merchantId &&
      stcBank.clientId &&
      stcBank.clientSecret &&
      stcBank.createPaymentUrl,
  );
};

const normalizeUrl = (url) => String(url || "").trim();

const buildAbsoluteUrl = (req, path) => {
  const configuredBaseUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  const baseUrl =
    configuredBaseUrl || `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
  return `${baseUrl}${path}`;
};

const buildPublicBookingUrl = (req, path) => {
  const configuredBaseUrl =
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    req.get("origin") ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL;
  const baseUrl =
    configuredBaseUrl || `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
  return `${baseUrl.replace(/\/$/, "")}${path}`;
};

const extractPaymentUrl = (data = {}) =>
  data.paymentUrl ||
  data.checkoutUrl ||
  data.redirectUrl ||
  data.redirect_url ||
  data.url ||
  data?.links?.payment ||
  data?.links?.checkout ||
  data?.data?.paymentUrl ||
  data?.data?.checkoutUrl ||
  data?.data?.redirectUrl;

const extractProviderPaymentId = (data = {}) =>
  data.paymentId ||
  data.transactionId ||
  data.referenceId ||
  data.id ||
  data?.data?.paymentId ||
  data?.data?.transactionId ||
  data?.data?.id ||
  "";

const buildStcBankPaymentPayload = ({
  tenant,
  appointment,
  amount,
  req,
}) => {
  const stcBank = tenant.paymentSettings?.stcBank || {};
  const reference = `booking_${appointment._id}`;
  const callbackUrl = buildPublicBookingUrl(
    req,
    `/${tenant.slug}?payment=return&appointmentId=${appointment._id}&tenantId=${tenant._id}`,
  );
  const webhookUrl = buildAbsoluteUrl(req, "/api/appointments/webhook/stc-bank");

  return {
    merchantId: stcBank.merchantId,
    terminalId: stcBank.terminalId || undefined,
    amount: toMoney(amount),
    currency: "SAR",
    reference,
    merchantReference: reference,
    description: `عربون حجز موعد - ${tenant.salonName}`,
    customer: {
      name: appointment.childName || "عميل",
      phone: appointment.customerId?.phone || "",
    },
    callbackUrl,
    returnUrl: callbackUrl,
    webhookUrl,
    metadata: {
      provider: STC_BANK_PROVIDER,
      tenantId: String(tenant._id),
      appointmentId: String(appointment._id),
    },
  };
};

const createStcBankPaymentSession = async ({ tenant, appointment, amount, req }) => {
  const stcBank = tenant.paymentSettings?.stcBank || {};
  const createPaymentUrl = normalizeUrl(stcBank.createPaymentUrl);
  const clientSecret = decrypt(stcBank.clientSecret);

  if (!createPaymentUrl || !stcBank.clientId || !clientSecret) {
    const error = new Error("إعدادات STC Bank غير مكتملة لهذا الصالون.");
    error.statusCode = 400;
    throw error;
  }

  const payload = buildStcBankPaymentPayload({
    tenant,
    appointment,
    amount,
    req,
  });

  const response = await axios.post(createPaymentUrl, payload, {
    timeout: 20000,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": stcBank.clientId,
      Authorization: `Bearer ${clientSecret}`,
    },
  });

  const paymentUrl = extractPaymentUrl(response.data);
  if (!paymentUrl) {
    const error = new Error("لم يرجع STC Bank رابط دفع صالح.");
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: STC_BANK_PROVIDER,
    amount: toMoney(amount),
    paymentUrl,
    providerPaymentId: extractProviderPaymentId(response.data),
    reference: payload.reference,
  };
};

const createBookingPaymentSession = async ({ tenant, appointment, amount, req }) => {
  const provider = getEnabledProvider(tenant.paymentSettings);

  if (provider !== STC_BANK_PROVIDER) {
    const error = new Error("مزود الدفع الحالي غير مدعوم لهذا التدفق.");
    error.statusCode = 400;
    throw error;
  }

  return createStcBankPaymentSession({ tenant, appointment, amount, req });
};

const extractWebhookAppointmentId = (payload = {}) => {
  const metadata = payload.metadata || payload.MetaData || payload.data?.metadata || {};
  const reference =
    metadata.appointmentId ||
    payload.appointmentId ||
    payload.appointment_id ||
    payload.reference ||
    payload.merchantReference ||
    payload.orderId ||
    payload.data?.reference ||
    payload.data?.merchantReference;

  const value = String(reference || "");
  return value.startsWith("booking_") ? value.replace("booking_", "") : value;
};

const extractWebhookTenantId = (payload = {}) => {
  const metadata = payload.metadata || payload.MetaData || payload.data?.metadata || {};
  return String(metadata.tenantId || payload.tenantId || payload.data?.tenantId || "");
};

const extractWebhookStatus = (payload = {}) =>
  String(
    payload.status ||
      payload.paymentStatus ||
      payload.result ||
      payload.data?.status ||
      payload.data?.paymentStatus ||
      "",
  ).toLowerCase();

const isPaidWebhookStatus = (status) =>
  ["paid", "success", "succeeded", "captured", "approved", "completed", "00"].includes(
    status,
  );

const extractWebhookAmount = (payload = {}) =>
  toMoney(payload.amount || payload.paidAmount || payload.data?.amount || 0);

const extractWebhookPaymentId = (payload = {}) =>
  String(
    payload.paymentId ||
      payload.transactionId ||
      payload.referenceId ||
      payload.id ||
      payload.data?.paymentId ||
      payload.data?.transactionId ||
      payload.data?.id ||
      "",
  );

const timingSafeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyStcBankWebhookSignature = ({ req, secret }) => {
  if (!secret) return false;

  const signature =
    req.get("x-stc-bank-signature") ||
    req.get("x-stc-signature") ||
    req.get("x-signature") ||
    "";
  if (!signature) return false;

  const body = JSON.stringify(req.body || {});
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return timingSafeEqual(signature, hmac) || timingSafeEqual(signature, `sha256=${hmac}`);
};

const getStcWebhookContext = async (req) => {
  const appointmentId = extractWebhookAppointmentId(req.body);
  if (!appointmentId) {
    const error = new Error("بيانات webhook لا تحتوي على رقم الموعد.");
    error.statusCode = 400;
    throw error;
  }

  const tenantId = extractWebhookTenantId(req.body);
  const appointment = await Appointment.findOne({
    _id: appointmentId,
    ...(tenantId ? { tenantId } : {}),
  }).populate("customerId");

  if (!appointment) {
    const error = new Error("الموعد غير موجود.");
    error.statusCode = 404;
    throw error;
  }

  const tenant = await Tenant.findById(appointment.tenantId).select(
    "salonName slug ownerPhone branding taxSettings whatsappSettings settings paymentSettings",
  );
  if (!tenant) {
    const error = new Error("الصالون غير موجود.");
    error.statusCode = 404;
    throw error;
  }

  const webhookSecret = decrypt(tenant.paymentSettings?.stcBank?.webhookSecret);
  if (!verifyStcBankWebhookSignature({ req, secret: webhookSecret })) {
    const error = new Error("تعذر التحقق من توقيع STC Bank webhook.");
    error.statusCode = 401;
    throw error;
  }

  return {
    appointment,
    tenant,
    providerPaymentId: extractWebhookPaymentId(req.body),
    amount: extractWebhookAmount(req.body),
    status: extractWebhookStatus(req.body),
  };
};

module.exports = {
  STC_BANK_PROVIDER,
  createBookingPaymentSession,
  getEnabledProvider,
  getStcWebhookContext,
  isOnlinePaymentConfigured,
  isPaidWebhookStatus,
  toMoney,
};
