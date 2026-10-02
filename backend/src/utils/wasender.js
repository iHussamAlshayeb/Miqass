const WASENDER_WEBHOOK_EVENTS = Object.freeze([
  "session.status",
  "message.sent",
  "messages.update",
]);

const STATUS_NAMES = Object.freeze({
  0: "failed",
  1: "pending",
  2: "sent",
  3: "delivered",
  4: "read",
  5: "played",
});

const STATUS_CODES = Object.freeze({
  error: 0,
  failed: 0,
  pending: 1,
  queued: 1,
  in_progress: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  played: 5,
});

const toIdentifier = (value) => {
  if (value === undefined || value === null) return null;
  const identifier = String(value).trim();
  return identifier || null;
};

const uniqueIdentifiers = (values) => [
  ...new Set(values.map(toIdentifier).filter(Boolean)),
];

const normalizeWasenderMessageStatus = (value, fallback = null) => {
  const candidate = value ?? fallback;
  const numericCode = Number(candidate);
  if (Number.isInteger(numericCode) && STATUS_NAMES[numericCode]) {
    return { code: numericCode, status: STATUS_NAMES[numericCode] };
  }

  const normalized = String(candidate ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!Object.prototype.hasOwnProperty.call(STATUS_CODES, normalized)) {
    return null;
  }

  const code = STATUS_CODES[normalized];
  return { code, status: STATUS_NAMES[code] };
};

const extractWasenderSessionIdentifiers = (payload = {}) => {
  const values = [
    payload.sessionId,
    payload.session_id,
    payload.data?.sessionId,
    payload.data?.session_id,
  ];

  if (payload.event === "session.status") {
    values.push(payload.data?.id);
  }

  return uniqueIdentifiers(values);
};

const extractWasenderMessageIdentifiers = (payload = {}) =>
  uniqueIdentifiers([
    payload.data?.msgId,
    payload.data?.msg_id,
    payload.data?.messageId,
    payload.data?.message_id,
    payload.data?.id,
    payload.data?.key?.id,
    payload.data?.update?.key?.id,
    payload.data?.message?.key?.id,
  ]);

const extractWasenderWhatsappMessageId = (payload = {}) =>
  toIdentifier(
    payload.data?.key?.id ??
      payload.data?.update?.key?.id ??
      payload.data?.message?.key?.id,
  );

const extractWasenderWebhookStatus = (payload = {}) => {
  if (payload.event === "message.sent" && payload.data?.success === false) {
    return normalizeWasenderMessageStatus(0);
  }

  const rawStatus =
    payload.event === "messages.update"
      ? payload.data?.update?.status ?? payload.data?.status
      : payload.data?.status;
  const fallback =
    payload.event === "message.sent" && payload.data?.success !== false
      ? 2
      : null;

  return normalizeWasenderMessageStatus(rawStatus, fallback);
};

const extractWasenderEventDate = (payload = {}) => {
  const numericTimestamp = Number(payload.timestamp);
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
    return new Date();
  }

  const milliseconds =
    numericTimestamp < 1_000_000_000_000
      ? numericTimestamp * 1000
      : numericTimestamp;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

module.exports = {
  WASENDER_WEBHOOK_EVENTS,
  extractWasenderEventDate,
  extractWasenderMessageIdentifiers,
  extractWasenderSessionIdentifiers,
  extractWasenderWebhookStatus,
  extractWasenderWhatsappMessageId,
  normalizeWasenderMessageStatus,
};
