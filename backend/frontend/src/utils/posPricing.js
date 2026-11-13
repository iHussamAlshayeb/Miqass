// نفس حساب الخادم (backend/src/utils/posPricing.js) بالهللات، لعرض السلة قبل الإرسال
const toCents = (value) => Math.round((Number(value) || 0) * 100);

export const VAT_RATE = 0.15;

export const discountToCents = (grossCents, discount) => {
    if (!discount || !Number(discount.value)) return 0;
    const value = Number(discount.value);
    if (!Number.isFinite(value) || value < 0) return 0;
    const cents = discount.type === 'percent'
        ? Math.round((grossCents * Math.min(value, 100)) / 100)
        : toCents(value);
    return Math.min(cents, grossCents);
};

export const allocateCents = (netCentsList, amountCents) => {
    const total = netCentsList.reduce((sum, cents) => sum + cents, 0);
    if (!amountCents || !total) return netCentsList.map(() => 0);
    const amount = Math.min(amountCents, total);
    const shares = netCentsList.map((cents, index) => {
        const exact = (cents * amount) / total;
        return { index, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let left = amount - shares.reduce((sum, share) => sum + share.floor, 0);
    [...shares]
        .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
        .forEach((share) => { if (left > 0) { share.floor += 1; left -= 1; } });
    return shares.map((share) => share.floor);
};

/** يرجع إجماليات السلة: قبل الخصم، الخصومات، الصافي (شامل الضريبة)، والضريبة المضمنة */
export const priceCart = (lines, saleDiscount) => {
    const gross = lines.map((line) => Math.round(toCents(line.unitPrice) * Number(line.quantity || 0)));
    const lineDiscounts = lines.map((line, index) => discountToCents(gross[index], line.discount));
    const net = gross.map((cents, index) => cents - lineDiscounts[index]);
    const netTotal = net.reduce((sum, cents) => sum + cents, 0);
    const saleDiscountCents = discountToCents(netTotal, saleDiscount);
    const allocation = allocateCents(net, saleDiscountCents);
    const totals = net.map((cents, index) => cents - allocation[index]);
    const totalCents = totals.reduce((sum, cents) => sum + cents, 0);
    const vatCents = totalCents - Math.round(totalCents / (1 + VAT_RATE));
    return {
        lines: lines.map((line, index) => ({
            ...line,
            grossAmount: gross[index] / 100,
            discountAmount: lineDiscounts[index] / 100,
            netAmount: net[index] / 100,
        })),
        grossTotal: gross.reduce((sum, cents) => sum + cents, 0) / 100,
        lineDiscountTotal: lineDiscounts.reduce((sum, cents) => sum + cents, 0) / 100,
        saleDiscount: saleDiscountCents / 100,
        discountTotal: (lineDiscounts.reduce((sum, cents) => sum + cents, 0) + saleDiscountCents) / 100,
        total: totalCents / 100,
        vat: vatCents / 100,
    };
};

export const money = (value) => (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
