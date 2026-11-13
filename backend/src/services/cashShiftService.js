// الورديات وإغلاق الصندوق
const mongoose = require("mongoose");
const CashShift = require("../models/CashShift");
const Payment = require("../models/Payment");
const Sale = require("../models/Sale");

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const shiftError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const PAYMENT_METHODS = ["cash", "card", "transfer", "online"];

const getOpenShift = (tenantId, session = null) => {
  const query = CashShift.findOne({ tenantId, status: "Open" });
  return (session ? query.session(session) : query).lean();
};

/** ملخص الوردية: المبيعات والخصومات والمقبوضات حسب طريقة الدفع، والنقد المتوقع في الصندوق */
const summarizeShift = async (shift) => {
  const tenantId = new mongoose.Types.ObjectId(String(shift.tenantId));
  const shiftId = new mongoose.Types.ObjectId(String(shift._id));

  const [paymentGroups, salesGroups] = await Promise.all([
    Payment.aggregate([
      { $match: { tenantId, shiftId, status: "Paid" } },
      { $group: { _id: "$method", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { tenantId, shiftId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total: { $sum: "$totalAmount" },
          discount: { $sum: "$discountAmount" },
          vat: { $sum: "$vatAmount" },
        },
      },
    ]),
  ]);

  const payments = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, { amount: 0, count: 0 }]));
  for (const group of paymentGroups) {
    if (payments[group._id]) payments[group._id] = { amount: toMoney(group.amount), count: group.count };
  }

  const active = salesGroups.filter((group) => group._id !== "Cancelled");
  const cancelled = salesGroups.find((group) => group._id === "Cancelled");
  const unpaid = salesGroups.filter((group) => group._id === "Draft" || group._id === "Partially_Paid");

  const collected = toMoney(PAYMENT_METHODS.reduce((sum, method) => sum + payments[method].amount, 0));
  const expectedCash = toMoney(Number(shift.openingCash || 0) + payments.cash.amount);

  return {
    salesCount: active.reduce((sum, group) => sum + group.count, 0),
    salesTotal: toMoney(active.reduce((sum, group) => sum + group.total, 0)),
    discountTotal: toMoney(active.reduce((sum, group) => sum + group.discount, 0)),
    vatTotal: toMoney(active.reduce((sum, group) => sum + group.vat, 0)),
    cancelledCount: cancelled?.count || 0,
    unpaidCount: unpaid.reduce((sum, group) => sum + group.count, 0),
    payments,
    collected,
    openingCash: toMoney(shift.openingCash),
    expectedCash,
  };
};

const presentShift = (shift, summary) => ({
  _id: shift._id,
  status: shift.status,
  openedAt: shift.openedAt,
  openedBy: shift.openedBy,
  openingCash: shift.openingCash,
  closedAt: shift.closedAt,
  closedBy: shift.closedBy,
  countedCash: shift.countedCash,
  expectedCash: shift.expectedCash,
  cashDifference: shift.cashDifference,
  closingNote: shift.closingNote,
  summary,
});

const parseCash = (value, label) => {
  const amount = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
    throw shiftError(`${label} غير صالح.`);
  }
  return toMoney(amount);
};

const cleanName = (value) => String(value || "").trim().slice(0, 80);

const openShift = async (tenantId, { openingCash, openedBy }) => {
  const amount = parseCash(openingCash, "مبلغ بداية الوردية");
  if (await getOpenShift(tenantId)) throw shiftError("توجد وردية مفتوحة. أغلقها أولاً.", 409);
  try {
    return await CashShift.create({ tenantId, openingCash: amount, openedBy: cleanName(openedBy) });
  } catch (error) {
    if (error.code === 11000) throw shiftError("توجد وردية مفتوحة. أغلقها أولاً.", 409);
    throw error;
  }
};

const closeShift = async (tenantId, { countedCash, closedBy, note }) => {
  const counted = parseCash(countedCash, "مبلغ النقد المعدود");
  const shift = await getOpenShift(tenantId);
  if (!shift) throw shiftError("لا توجد وردية مفتوحة.", 404);

  const summary = await summarizeShift(shift);
  const closed = await CashShift.findOneAndUpdate(
    { _id: shift._id, tenantId, status: "Open" },
    {
      $set: {
        status: "Closed",
        closedAt: new Date(),
        closedBy: cleanName(closedBy),
        countedCash: counted,
        expectedCash: summary.expectedCash,
        cashDifference: toMoney(counted - summary.expectedCash),
        closingNote: String(note || "").trim().slice(0, 500),
        summary,
      },
    },
    { returnDocument: "after" },
  );
  if (!closed) throw shiftError("أُغلقت الوردية من جهاز آخر.", 409);
  return { shift: closed, summary };
};

module.exports = { getOpenShift, summarizeShift, presentShift, openShift, closeShift };
