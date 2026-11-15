// استرجاع فاتورة مدفوعة (كاملة أو جزئية) كإشعار دائن مستقل:
// يُرجع المنتجات للمخزون، ويُحسب في الوردية (النقد المسترجع يُخصم من المتوقع في الدرج)،
// ويُرسل لاحقاً إلى Zakaty كإشعار دائن مرتبط بالفاتورة الأصلية.
const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const SaleItem = require("../models/SaleItem");
const SaleRefund = require("../models/SaleRefund");
const Tenant = require("../models/Tenant");
const { getOpenShift } = require("./cashShiftService");

const REFUND_METHODS = ["cash", "card", "transfer"];
const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** الكميات المسترجعة سابقاً لكل بند */
const refundedQuantities = (refunds = []) => {
  const map = new Map();
  for (const refund of refunds) {
    for (const item of refund.items || []) {
      const key = String(item.saleItemId);
      map.set(key, toMoney((map.get(key) || 0) + Number(item.quantity || 0)));
    }
  }
  return map;
};

/** ما يمكن استرجاعه من كل بند */
const refundableLines = (saleItems, refunds) => {
  const done = refundedQuantities(refunds);
  return saleItems.map((item) => {
    const refunded = done.get(String(item._id)) || 0;
    return {
      saleItemId: String(item._id),
      itemType: item.itemType,
      name: item.name,
      barberName: item.barberName || "",
      quantity: Number(item.quantity),
      refundedQuantity: refunded,
      refundableQuantity: toMoney(Math.max(Number(item.quantity) - refunded, 0)),
      unitPrice: toMoney(item.unitPrice),
      totalAmount: toMoney(item.totalAmount),
      unitNet: toMoney(Number(item.totalAmount) / Number(item.quantity)),
    };
  });
};

/**
 * بنود الإشعار: لكل بند مطلوب، كمية ≤ المتبقي، والخصم والضريبة بالتناسب.
 * آخر كمية متبقية من البند تأخذ الباقي بالضبط حتى يطابق مجموع الاسترجاعات الفاتورة.
 */
const buildRefundLines = (saleItems, refunds, requested) => {
  const done = refundedQuantities(refunds);
  const byId = new Map(saleItems.map((item) => [String(item._id), item]));
  const previous = new Map();
  for (const refund of refunds) {
    for (const item of refund.items || []) {
      const key = String(item.saleItemId);
      const sums = previous.get(key) || { discount: 0, total: 0, vat: 0 };
      previous.set(key, { discount: sums.discount + Number(item.discountAmount || 0), total: sums.total + Number(item.totalAmount || 0), vat: sums.vat + Number(item.vatAmount || 0) });
    }
  }

  const lines = [];
  const seen = new Set();
  for (const entry of requested) {
    const key = String(entry?.saleItemId || "");
    const quantity = Number(entry?.quantity);
    if (!byId.has(key) || seen.has(key)) throw httpError("بنود الاسترجاع غير صالحة.");
    seen.add(key);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const item = byId.get(key);
    const remaining = toMoney(Number(item.quantity) - (done.get(key) || 0));
    if (quantity > remaining + 1e-9) throw httpError(`الكمية المطلوب استرجاعها من "${item.name}" أكبر من المتبقي (${remaining}).`);

    const isLast = Math.abs(quantity - remaining) < 1e-9;
    const sums = previous.get(key) || { discount: 0, total: 0, vat: 0 };
    const ratio = quantity / Number(item.quantity);
    const unitPrice = toMoney(item.unitPrice);
    const discountAmount = isLast ? toMoney(Number(item.discountAmount || 0) - sums.discount) : toMoney(Number(item.discountAmount || 0) * ratio);
    const totalAmount = isLast ? toMoney(Number(item.totalAmount) - sums.total) : toMoney(unitPrice * quantity - discountAmount);
    const vatRate = Number(item.vatRate ?? 0.15);
    const vatAmount = isLast
      ? toMoney(Number(item.vatAmount || 0) - sums.vat)
      : toMoney(totalAmount - totalAmount / (1 + vatRate));
    if (totalAmount <= 0) continue;
    lines.push({
      saleItemId: item._id,
      itemType: item.itemType,
      productId: item.productId || null,
      serviceId: item.serviceId || null,
      barberName: item.barberName || "",
      name: item.name,
      quantity,
      unitPrice,
      unitCost: Number(item.unitCost || 0),
      discountAmount,
      vatRate,
      vatAmount,
      totalAmount,
    });
  }
  if (lines.length === 0) throw httpError("اختر بنداً واحداً على الأقل للاسترجاع.");
  return lines;
};

const loadSaleForRefund = async (tenantId, saleId, session = null) => {
  if (!mongoose.Types.ObjectId.isValid(String(saleId))) throw httpError("الفاتورة غير موجودة.", 404);
  const withSession = (query) => (session ? query.session(session) : query);
  const sale = await withSession(Sale.findOne({ _id: saleId, tenantId })).lean();
  if (!sale) throw httpError("الفاتورة غير موجودة.", 404);
  const [items, refunds] = await Promise.all([
    withSession(SaleItem.find({ tenantId, saleId: sale._id })).lean(),
    withSession(SaleRefund.find({ tenantId, saleId: sale._id }).sort({ createdAt: 1 })).lean(),
  ]);
  return { sale, items, refunds };
};

const presentRefund = (refund) => ({
  _id: refund._id,
  refundNumber: refund.refundNumber,
  totalAmount: toMoney(refund.totalAmount),
  method: refund.method,
  reason: refund.reason,
  refundedBy: refund.refundedBy,
  createdAt: refund.createdAt,
  items: (refund.items || []).map((item) => ({ name: item.name, quantity: item.quantity, totalAmount: toMoney(item.totalAmount) })),
  zakatyStatus: refund.zakaty?.status || "NotSubmitted",
});

/** ما يحتاجه شاشة الاسترجاع: البنود والمتبقي منها، والمسترجع سابقاً */
const getRefundable = async (tenantId, saleId) => {
  const { sale, items, refunds } = await loadSaleForRefund(tenantId, saleId);
  const refundedAmount = toMoney(refunds.reduce((sum, refund) => sum + Number(refund.totalAmount || 0), 0));
  return {
    sale: {
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      status: sale.status,
      createdAt: sale.createdAt,
      customerName: sale.customerSnapshot?.name || "",
      totalAmount: toMoney(sale.totalAmount),
      paidAmount: toMoney(sale.paidAmount),
      refundedAmount,
      refundableAmount: toMoney(Math.max(Number(sale.paidAmount || 0) - refundedAmount, 0)),
    },
    lines: refundableLines(items, refunds),
    refunds: refunds.map(presentRefund),
  };
};

/** إنشاء إشعار الاسترجاع في معاملة واحدة */
const createRefund = async ({ tenantId, saleId, items: requested, method, reason, refundedBy }) => {
  if (!REFUND_METHODS.includes(method)) throw httpError("اختر طريقة إرجاع المبلغ.");
  const cleanReason = String(reason || "").trim().slice(0, 200);
  if (!cleanReason) throw httpError("اكتب سبب الاسترجاع.");
  if (!Array.isArray(requested) || requested.length === 0 || requested.length > 100) throw httpError("اختر بنود الاسترجاع.");

  const session = await mongoose.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const { sale, items, refunds } = await loadSaleForRefund(tenantId, saleId, session);
      if (!["Paid", "Partially_Paid"].includes(sale.status) || Number(sale.paidAmount || 0) <= 0) {
        throw httpError("لا يمكن استرجاع فاتورة غير مدفوعة أو ملغاة.", 409);
      }
      const lines = buildRefundLines(items, refunds, requested);
      const totalAmount = toMoney(lines.reduce((sum, line) => sum + line.totalAmount, 0));
      const alreadyRefunded = refunds.reduce((sum, refund) => sum + Number(refund.totalAmount || 0), 0);
      if (totalAmount > toMoney(Number(sale.paidAmount) - alreadyRefunded) + 0.001) {
        throw httpError(`المبلغ أكبر من المدفوع المتبقي في الفاتورة (${toMoney(Number(sale.paidAmount) - alreadyRefunded).toFixed(2)}).`, 409);
      }

      const shift = await getOpenShift(tenantId, session);
      if (method === "cash" && !shift) throw httpError("افتح وردية أولاً؛ الاسترجاع النقدي يُصرف من الدرج.", 409);

      const tenant = await Tenant.findOneAndUpdate(
        { _id: tenantId },
        { $inc: { refundCounter: 1 } },
        { returnDocument: "after", select: "refundCounter", session },
      ).lean();

      // المنتجات المسترجعة تعود للمخزون
      const { applySaleInventoryMovements } = require("../controllers/salesController");
      const products = lines.filter((line) => line.itemType === "product" && line.productId);
      await applySaleInventoryMovements({ tenantId, saleId: sale._id, saleItems: products, type: "return", note: `استرجاع: ${cleanReason}`, session });

      [created] = await SaleRefund.create([{
        tenantId,
        saleId: sale._id,
        shiftId: shift?._id || null,
        refundNumber: `RF-${tenant.refundCounter}`,
        items: lines,
        vatAmount: toMoney(lines.reduce((sum, line) => sum + line.vatAmount, 0)),
        totalAmount,
        method,
        reason: cleanReason,
        refundedBy: String(refundedBy || "").slice(0, 60),
        restocked: products.length > 0,
      }], { session });

      await Sale.updateOne({ _id: sale._id, tenantId }, { $inc: { refundedAmount: totalAmount } }, { session });
    });
    return presentRefund(created.toObject());
  } finally {
    await session.endSession();
  }
};

module.exports = { getRefundable, createRefund, buildRefundLines, refundableLines, presentRefund, loadSaleForRefund, REFUND_METHODS };
