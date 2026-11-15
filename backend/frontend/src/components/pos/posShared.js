// أدوات مشتركة لشاشة نقطة البيع (ليست مكونات، لذلك في ملف مستقل)
import { money } from '../../utils/posPricing';

export const METHODS = [
    { id: 'cash', label: 'نقدي' },
    { id: 'card', label: 'شبكة' },
    { id: 'transfer', label: 'تحويل' },
    { id: 'online', label: 'أونلاين' },
];
/** موعد اليوم الذي لم يُحصّل حسابه بعد */
export const isAwaitingPayment = (item) => item.status === 'Booked' || (item.status === 'Completed' && !item.isPaid);

export const methodLabel = (id) => METHODS.find((method) => method.id === id)?.label || id;

/** إدخال لوحة الأرقام. القيمة نص حتى لا تضيع الأصفار والفاصلة أثناء الكتابة */
export const applyKey = (current, key) => {
    if (key === 'back') return current.slice(0, -1);
    if (key === '.') return current.includes('.') ? current : `${current || '0'}.`;
    const [, decimals = null] = current.split('.');
    if (decimals !== null && decimals.length >= 2) return current;
    if (current === '0') return key;
    if (current.replace('.', '').length >= 8) return current;
    return current + key;
};


/** إيصال الاسترجاع بنفس قالب الفاتورة الحرارية (InvoiceModal) */
export const refundReceiptToInvoice = (receipt) => ({
    invoiceNumber: receipt.refundNumber,
    documentType: 'credit_note',
    referenceInvoiceNumber: receipt.originalInvoiceNumber,
    referenceInvoiceDate: receipt.originalIssueDate,
    refundReason: receipt.reason,
    salonName: receipt.salonName,
    legalName: receipt.legalName,
    sellerAddress: receipt.sellerAddress,
    crNumber: receipt.crNumber,
    logoUrl: receipt.logoUrl,
    phone: receipt.phone,
    taxNumber: receipt.taxNumber,
    date: receipt.date,
    time: receipt.time,
    cashierName: receipt.refundedBy,
    customerName: receipt.customerName,
    services: receipt.items.map((item) => ({
        name: item.name,
        qty: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        price: item.totalAmount,
    })),
    discountAmount: '0.00',
    baseAmount: receipt.baseAmount,
    vatAmount: receipt.vatAmount,
    totalAmount: receipt.totalAmount,
    paymentMethod: methodLabel(receipt.method),
    qrCode: receipt.qrCode,
});

export const formatDateTime = (value) => value
    ? new Date(value).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' })
    : '—';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** يطبع تقرير الوردية على ورق حراري 80mm عبر إطار مخفي حتى لا تتأثر الصفحة */
export const printShiftReport = (shift, salonName) => {
    const s = shift.summary || {};
    const row = (label, value, strong = false) => `<tr${strong ? ' class="strong"' : ''}><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`;
    const methods = ['cash', 'card', 'transfer', 'online']
        .filter((method) => s.payments?.[method]?.count)
        .map((method) => row(`${methodLabel(method)} (${s.payments[method].count})`, money(s.payments[method].amount)))
        .join('');
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الوردية</title><style>
        @page { size: 80mm auto; margin: 0; }
        body { width: 80mm; margin: 0; padding: 4mm; box-sizing: border-box; font-family: Tahoma, Arial, sans-serif; font-size: 11px; color: #000; }
        h1 { font-size: 15px; text-align: center; margin: 0 0 2px; } h2 { font-size: 12px; margin: 8px 0 3px; border-bottom: 1px solid #000; }
        .center { text-align: center; } table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; }
        .num { text-align: left; direction: ltr; font-family: monospace; font-size: 12px; } .strong td { font-weight: bold; border-top: 1px dashed #000; }
    </style></head><body>
        <h1>${escapeHtml(salonName || '')}</h1>
        <div class="center">تقرير إغلاق الوردية</div>
        <h2>الوردية</h2><table>
            ${row('الفتح', formatDateTime(shift.openedAt))}
            ${row('الإغلاق', formatDateTime(shift.closedAt))}
            ${shift.openedBy ? row('فتحها', shift.openedBy) : ''}
            ${shift.closedBy ? row('أغلقها', shift.closedBy) : ''}
        </table>
        <h2>المبيعات</h2><table>
            ${row('عدد الفواتير', s.salesCount ?? 0)}
            ${row('الخصومات', money(s.discountTotal))}
            ${row('الضريبة المضمنة', money(s.vatTotal))}
            ${row('إجمالي المبيعات', money(s.salesTotal), true)}
            ${s.cancelledCount ? row('فواتير ملغاة', s.cancelledCount) : ''}
        </table>
        ${s.refundsTotal ? `<h2>المرتجعات</h2><table>${row(`عدد الإشعارات`, s.refundsCount)}${row('إجمالي المسترجع', `-${money(s.refundsTotal)}`, true)}</table>` : ''}
        <h2>المقبوضات</h2><table>${methods || row('لا توجد مقبوضات', '0.00')}${row('الإجمالي', money(s.collected), true)}</table>
        <h2>الصندوق</h2><table>
            ${row('النقد الافتتاحي', money(shift.openingCash))}
            ${row('المقبوض نقداً', money(s.payments?.cash?.amount))}
            ${s.cashExpenses ? row('مصروفات من الصندوق', `-${money(s.cashExpenses)}`) : ''}
            ${s.cashRefunds ? row(`مسترجع نقداً (${s.refundsByMethod?.cash?.count || 0})`, `-${money(s.cashRefunds)}`) : ''}
            ${row('المتوقع في الدرج', money(shift.expectedCash ?? s.expectedCash), true)}
            ${shift.countedCash != null ? row('المعدود', money(shift.countedCash)) : ''}
            ${shift.cashDifference != null ? row(shift.cashDifference < 0 ? 'عجز' : shift.cashDifference > 0 ? 'زيادة' : 'الفرق', money(Math.abs(shift.cashDifference)), true) : ''}
        </table>
        ${shift.closingNote ? `<h2>ملاحظة</h2><div>${escapeHtml(shift.closingNote)}</div>` : ''}
        <div class="center" style="margin-top:10px">التوقيع: ....................</div>
    </body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    frame.srcdoc = html;
    frame.onload = () => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1000);
    };
    document.body.appendChild(frame);
};

