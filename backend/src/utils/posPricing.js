// حساب الخصومات في نقطة البيع.
// الأسعار شاملة الضريبة. خصم الفاتورة يُوزّع على البنود بالتناسب، حتى يبقى كل بند
// محققاً لمعادلة فاتورة Zakaty: الكمية × سعر الوحدة − الخصم = إجمالي البند.

const toCents = (value) => Math.round((Number(value) || 0) * 100);
const fromCents = (cents) => cents / 100;

const discountError = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * يحوّل الخصم المرسل من الواجهة إلى مبلغ بالهللات.
 * discount: { type: "amount" | "percent", value } أو لا شيء.
 */
const discountToCents = (grossCents, discount) => {
  if (discount === undefined || discount === null || discount === "") return 0;
  const type = discount?.type;
  const value = Number(discount?.value);
  if (!["amount", "percent"].includes(type) || !Number.isFinite(value) || value < 0) {
    throw discountError("قيمة الخصم غير صالحة.");
  }
  if (type === "percent") {
    if (value > 100) throw discountError("نسبة الخصم لا تتجاوز 100%.");
    return Math.round((grossCents * value) / 100);
  }
  const cents = toCents(value);
  if (cents > grossCents) throw discountError("الخصم أكبر من المبلغ.");
  return cents;
};

/**
 * يوزع مبلغاً (بالهللات) على البنود بنسبة صافي كل بند، بطريقة الباقي الأكبر
 * حتى يساوي المجموع المبلغ بالضبط. يُرجع قائمة بنفس ترتيب البنود.
 */
const allocateCents = (netCentsList, amountCents) => {
  const total = netCentsList.reduce((sum, cents) => sum + cents, 0);
  if (amountCents <= 0 || total <= 0) return netCentsList.map(() => 0);
  if (amountCents > total) throw discountError("خصم الفاتورة أكبر من إجماليها.");

  const shares = netCentsList.map((cents, index) => {
    const exact = (cents * amountCents) / total;
    return { index, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = amountCents - shares.reduce((sum, share) => sum + share.floor, 0);
  const allocation = shares.map((share) => share.floor);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (left <= 0) break;
    allocation[share.index] += 1;
    left -= 1;
  }
  return allocation;
};

/**
 * lines: [{ quantity, unitPrice, discount }]
 * يُرجع لكل بند: grossAmount و discountAmount و totalAmount (بالريال)، ومجموع خصم الفاتورة.
 */
const priceLines = (lines, saleDiscount) => {
  const grossList = lines.map((line) => Math.round(Number(line.quantity) * toCents(line.unitPrice)));
  const lineDiscounts = lines.map((line, i) => discountToCents(grossList[i], line.discount));
  const netList = grossList.map((gross, i) => gross - lineDiscounts[i]);
  const netTotal = netList.reduce((sum, cents) => sum + cents, 0);
  const saleDiscountCents = discountToCents(netTotal, saleDiscount);
  const allocated = allocateCents(netList, saleDiscountCents);

  return {
    saleDiscountAmount: fromCents(saleDiscountCents),
    lines: lines.map((line, i) => ({
      grossAmount: fromCents(grossList[i]),
      discountAmount: fromCents(lineDiscounts[i] + allocated[i]),
      totalAmount: fromCents(netList[i] - allocated[i]),
    })),
  };
};

module.exports = { discountToCents, allocateCents, priceLines };
