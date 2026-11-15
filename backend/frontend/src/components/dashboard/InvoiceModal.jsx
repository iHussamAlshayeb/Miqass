import React, { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Settings, AlertTriangle } from 'lucide-react';

// ==========================================
// ⚙️ أحجام الورق الحراري: mm للطباعة، px للمعاينة، وحجم الخط الأساسي
// ==========================================
const PAPER_SIZES = {
    '58mm': { mm: 58, px: 219, font: 10, label: '58mm (صغير)' },
    '72mm': { mm: 72, px: 272, font: 11, label: '72mm (متوسط)' },
    '80mm': { mm: 80, px: 302, font: 12, label: '80mm (قياسي)' },
    '104mm': { mm: 104, px: 393, font: 13, label: '104mm (عريض)' },
};
const PAPER_KEY = 'thermal_paper_size';

const readSavedPaper = (fallback) => {
    try {
        const saved = localStorage.getItem(PAPER_KEY);
        return saved && PAPER_SIZES[saved] ? saved : fallback;
    } catch {
        return fallback;
    }
};

// ==========================================
// 🎨 تنسيق الإيصال: نفس الـ CSS للمعاينة وللطباعة حتى يطابق المطبوع ما يراه الكاشير
// ==========================================
const RECEIPT_CSS = `
.rc{direction:rtl;color:#000;background:#fff;font-family:Tahoma,'Segoe UI','Arial Unicode MS',Arial,sans-serif;line-height:1.35;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rc *{box-sizing:border-box}
.rc .num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc .center{text-align:center}
.rc .logo{display:block;margin:0 auto 6px;max-height:56px;max-width:70%;object-fit:contain;filter:grayscale(100%) contrast(1.2)}
.rc .trade{font-size:1.45em;font-weight:900;margin-bottom:1px}
.rc .legal{font-size:.9em;font-weight:bold}
.rc .muted{font-size:.85em}
.rc .vat{font-size:.95em;font-weight:bold;margin-top:2px}
.rc .rule{border-top:1.5px solid #000;margin:6px 0}
.rc .dash{border-top:1px dashed #000;margin:5px 0}
.rc .title{border:1.5px solid #000;border-radius:4px;padding:3px 4px;margin:6px 0;text-align:center}
.rc .title b{display:block;font-size:1.1em;font-weight:900}
.rc .title span{display:block;font-size:.8em;letter-spacing:.3px}
.rc .row{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.rc .meta .row{padding:1px 0}
.rc .meta .k{font-size:.9em;white-space:nowrap}
.rc .meta .v{font-weight:bold;text-align:left;min-width:0;overflow-wrap:anywhere}
.rc .items-head{font-size:.85em;font-weight:bold;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:2px}
.rc .item{padding:3px 0;border-bottom:1px dotted #777}
.rc .item:last-child{border-bottom:0}
.rc .item .name{font-weight:bold;min-width:0;overflow-wrap:anywhere}
.rc .item .sub{font-size:.85em}
.rc .totals .row{padding:1.5px 0}
.rc .grand{background:#000;color:#fff;padding:5px 6px;margin-top:4px;border-radius:3px}
.rc .grand .k{font-weight:900;font-size:.95em}
.rc .grand .v{font-weight:900;font-size:1.3em}
.rc .pay{font-size:.95em}
.rc .qr{display:flex;flex-direction:column;align-items:center;margin:8px 0 4px}
.rc .qr .box{padding:5px;border:1.5px solid #000;border-radius:4px;background:#fff;line-height:0}
.rc .qr .cap{font-size:.8em;margin-top:3px}
.rc .badge{display:inline-block;border:1px solid #000;border-radius:3px;padding:0 5px;font-size:.75em;font-weight:bold;margin-top:3px}
.rc .foot{text-align:center;margin-top:6px}
.rc .powered{font-size:.7em;color:#555;margin-top:4px}
`;

const PAGE_CSS = (paper) => `
@page{margin:0}
html,body{margin:0;padding:0;background:#fff}
body{width:${paper.mm}mm}
`;

const money = (value) => (Number(value) || 0).toFixed(2);
const Num = ({ children }) => <bdi className="num" dir="ltr">{children}</bdi>;
const MetaRow = ({ label, children }) => (
    <div className="row"><span className="k">{label}</span><span className="v">{children}</span></div>
);

// ==========================================
// 🧾 محتوى الإيصال (فاتورة ضريبية مبسطة / إشعار دائن)
// ==========================================
const ReceiptContent = ({ invoice, paper }) => {
    const isCredit = invoice.documentType === 'credit_note' || Boolean(invoice.referenceInvoiceNumber);
    const hasVat = Boolean(invoice.taxNumber);
    const logo = invoice.logoUrl || invoice.branding?.logoUrl;
    const title = !hasVat
        ? { ar: isCredit ? 'إيصال استرجاع' : 'إيصال بيع', en: isCredit ? 'Refund Receipt' : 'Sales Receipt' }
        : isCredit
            ? { ar: 'إشعار دائن مبسط', en: 'Simplified Credit Note' }
            : { ar: 'فاتورة ضريبية مبسطة', en: 'Simplified Tax Invoice' };
    const qrSize = Math.round(paper.px * (paper.mm <= 58 ? 0.5 : 0.45));
    const paymentLines = Array.isArray(invoice.paymentLines) && invoice.paymentLines.length > 1 ? invoice.paymentLines : null;

    return (
        <div className="rc" style={{ width: `${paper.mm}mm`, fontSize: `${paper.font}px`, padding: paper.mm <= 58 ? '6px 5px 10px' : '8px 9px 12px' }}>
            {/* ─── البائع ─── */}
            <div className="center">
                {logo && <img className="logo" src={logo} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                <div className="trade">{invoice.salonName || 'الصالون'}</div>
                {invoice.legalName && <div className="legal">{invoice.legalName}</div>}
                {invoice.sellerAddress && <div className="muted">{invoice.sellerAddress}</div>}
                {invoice.phone && <div className="muted">هاتف: <Num>{invoice.phone}</Num></div>}
                {hasVat && <div className="vat">الرقم الضريبي: <Num>{invoice.taxNumber}</Num></div>}
                {invoice.crNumber && <div className="muted">السجل التجاري: <Num>{invoice.crNumber}</Num></div>}
            </div>

            <div className="title"><b>{title.ar}</b><span>{title.en}</span></div>

            {/* ─── بيانات المستند ─── */}
            <div className="meta">
                <MetaRow label={isCredit ? 'رقم الإشعار' : 'رقم الفاتورة'}><Num>{invoice.invoiceNumber}</Num></MetaRow>
                <MetaRow label="التاريخ"><Num>{invoice.date}</Num></MetaRow>
                {invoice.time && <MetaRow label="الوقت"><Num>{invoice.time}</Num></MetaRow>}
                {isCredit && invoice.referenceInvoiceNumber && (
                    <MetaRow label="الفاتورة الأصلية">
                        <Num>{invoice.referenceInvoiceNumber}</Num>
                        {invoice.referenceInvoiceDate && <> · <Num>{invoice.referenceInvoiceDate}</Num></>}
                    </MetaRow>
                )}
                {isCredit && invoice.refundReason && <MetaRow label="سبب الإرجاع">{invoice.refundReason}</MetaRow>}
                {invoice.cashierName && <MetaRow label="الكاشير">{invoice.cashierName}</MetaRow>}
                {invoice.appointmentTime && <MetaRow label="وقت الموعد">{invoice.appointmentTime}</MetaRow>}
                {invoice.customerName && <MetaRow label="العميل">{invoice.customerName}</MetaRow>}
                {invoice.customerPhone && <MetaRow label="الجوال"><Num>{invoice.customerPhone}</Num></MetaRow>}
            </div>

            <div className="rule" />

            {/* ─── البنود ─── */}
            <div className="row items-head"><span>البيان</span><span>الإجمالي</span></div>
            {(invoice.services || []).map((line, index) => {
                const qty = Number(line.qty || line.quantity || 1);
                const unit = Number(line.unitPrice);
                const discount = Number(line.discountAmount) || 0;
                return (
                    <div className="item" key={index}>
                        <div className="row">
                            <span className="name">{line.name}</span>
                            <Num>{money(line.price)}</Num>
                        </div>
                        {(unit > 0 || line.barberName) && (
                            <div className="sub">
                                {unit > 0 && <Num>{`${qty} × ${money(unit)}`}</Num>}
                                {unit > 0 && line.barberName && ' · '}
                                {line.barberName && <>الحلاق: {line.barberName}</>}
                            </div>
                        )}
                        {discount > 0 && <div className="sub">خصم <Num>{money(discount)}</Num></div>}
                    </div>
                );
            })}

            <div className="rule" />

            {/* ─── الإجماليات ─── */}
            <div className="totals">
                {Number(invoice.discountAmount) > 0 && (
                    <div className="row"><span>إجمالي الخصم</span><Num>-{money(invoice.discountAmount)}</Num></div>
                )}
                {hasVat && (
                    <>
                        <div className="row"><span>الإجمالي غير شامل الضريبة</span><Num>{money(invoice.baseAmount)}</Num></div>
                        <div className="row"><span>ضريبة القيمة المضافة 15%</span><Num>{money(invoice.vatAmount)}</Num></div>
                    </>
                )}
                <div className="row grand">
                    <span className="k">{isCredit ? 'المبلغ المسترجع' : 'الإجمالي'}{hasVat ? ' شامل الضريبة' : ''}</span>
                    <span className="v"><Num>{money(invoice.totalAmount)}</Num> <span style={{ fontSize: '.7em' }}>ر.س</span></span>
                </div>
            </div>

            {/* ─── الدفع ─── */}
            {invoice.paymentMethod && (
                <div className="pay" style={{ marginTop: 6 }}>
                    {paymentLines ? (
                        <>
                            <div style={{ fontWeight: 'bold' }}>{isCredit ? 'طريقة الإرجاع' : 'الدفع'}</div>
                            {paymentLines.map((line, index) => (
                                <div className="row" key={index}><span>{line.method}</span><Num>{money(line.amount)}</Num></div>
                            ))}
                        </>
                    ) : (
                        <div className="row"><span>{isCredit ? 'طريقة الإرجاع' : 'طريقة الدفع'}</span><b>{invoice.paymentMethod}</b></div>
                    )}
                </div>
            )}

            {/* ─── رمز QR (هيئة الزكاة والضريبة والجمارك) ─── */}
            {hasVat && invoice.qrCode && (
                <div className="qr">
                    <div className="box">
                        <QRCodeSVG value={invoice.qrCode} size={qrSize} level="M" marginSize={0} bgColor="#ffffff" fgColor="#000000" />
                    </div>
                    <div className="cap">امسح الرمز للتحقق عبر تطبيق هيئة الزكاة والضريبة</div>
                    {invoice.isZatcaPhase2 && <span className="badge">ZATCA · المرحلة الثانية</span>}
                </div>
            )}

            <div className="dash" />
            <div className="foot">
                {hasVat && <div className="muted">الأسعار شاملة ضريبة القيمة المضافة</div>}
                <div style={{ fontWeight: 'bold', marginTop: 2 }}>{invoice.thankYouMsg || 'شكراً لزيارتكم'}</div>
                {invoice.website && <div className="muted"><Num>{invoice.website}</Num></div>}
                <div className="powered">Powered by Miqass.app</div>
            </div>
        </div>
    );
};

// ==========================================
// 🖨️ الطباعة عبر إطار مستقل: لا تتأثر بتنسيقات الصفحة، وطول الورقة بطول الإيصال
// ==========================================
const printReceiptHtml = (html, paper) => {
    document.getElementById('thermal-print-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'thermal-print-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${paper.px + 20}px;height:10px;border:0;opacity:0`;
    frame.srcdoc = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>&#8203;</title>
<style>${PAGE_CSS(paper)}${RECEIPT_CSS}</style></head><body>${html}</body></html>`;

    let printed = false;
    const doPrint = () => {
        if (printed || !frame.isConnected) return;
        printed = true;
        const win = frame.contentWindow;
        const doc = frame.contentDocument;
        // طول الصفحة = طول المحتوى فعلياً، حتى لا تُقص الفاتورة أو يخرج ورق فارغ
        const heightMm = Math.ceil((doc.body.scrollHeight * 25.4) / 96) + 4;
        const style = doc.createElement('style');
        style.textContent = `@page{size:${paper.mm}mm ${heightMm}mm;margin:0}`;
        doc.head.appendChild(style);
        win.focus();
        win.print();
        setTimeout(() => frame.remove(), 1500);
    };
    // load ينتظر الشعار؛ ومهلة احتياطية لو تعطل تحميله
    frame.onload = () => setTimeout(doPrint, 50);
    setTimeout(doPrint, 3000);
    document.body.appendChild(frame);
};

// ==========================================
// 🧾 نافذة المعاينة والطباعة
// ==========================================
const InvoiceModal = ({ invoice, onClose, autoPrint = false, defaultPaperSize = '80mm' }) => {
    const [paperSize, setPaperSize] = useState(() => readSavedPaper(defaultPaperSize));
    const [showSizeMenu, setShowSizeMenu] = useState(false);
    const previewRef = useRef(null);
    const autoPrintedRef = useRef(false);
    const paper = PAPER_SIZES[paperSize] || PAPER_SIZES['80mm'];

    const handlePrint = useCallback(() => {
        const node = previewRef.current?.querySelector('.rc');
        if (node) printReceiptHtml(node.outerHTML, paper);
    }, [paper]);

    useEffect(() => {
        if (!autoPrint || autoPrintedRef.current || !invoice) return undefined;
        autoPrintedRef.current = true;
        const timer = setTimeout(handlePrint, 150);
        return () => clearTimeout(timer);
    }, [autoPrint, invoice, handlePrint]);

    const handleSizeChange = (size) => {
        setPaperSize(size);
        try { localStorage.setItem(PAPER_KEY, size); } catch { /* المتصفح يمنع التخزين */ }
        setShowSizeMenu(false);
    };

    if (!invoice) return null;

    // تنبيهات للمعاينة فقط (لا تُطبع)
    const warnings = [];
    if (invoice.taxNumber && !invoice.sellerAddress) warnings.push('عنوان المنشأة غير مضبوط، وهو من بيانات الفاتورة الضريبية الإلزامية. أضفه من الإعدادات ← الفوترة الإلكترونية.');
    if (!invoice.taxNumber) warnings.push('لا يوجد رقم ضريبي، لذلك يُطبع المستند كإيصال وليس فاتورة ضريبية.');

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" onClick={onClose}>
            <style>{RECEIPT_CSS}</style>
            <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-slate-50 p-3">
                    <h3 className="whitespace-nowrap text-base font-black text-slate-800">معاينة الفاتورة</h3>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowSizeMenu((value) => !value)}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                                title="حجم ورق الطابعة"
                            >
                                <Settings size={13} /> {paper.label}
                            </button>
                            {showSizeMenu && (
                                <div className="absolute left-0 top-full z-50 mt-1 min-w-[150px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                                    {Object.entries(PAPER_SIZES).map(([key, value]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => handleSizeChange(key)}
                                            className={`block w-full px-3 py-2 text-right text-xs font-bold transition hover:bg-slate-100 ${paperSize === key ? 'bg-slate-900 text-white hover:bg-slate-800' : 'text-slate-700'}`}
                                        >
                                            {value.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-black text-white transition hover:bg-slate-700 active:scale-95">
                            <Printer size={14} /> طباعة
                        </button>
                        <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {warnings.length > 0 && (
                    <div className="space-y-1 border-b border-amber-100 bg-amber-50 px-4 py-2">
                        {warnings.map((text) => (
                            <p key={text} className="flex items-start gap-1.5 text-xs font-bold text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {text}</p>
                        ))}
                    </div>
                )}

                <div className="flex flex-1 justify-center overflow-y-auto rounded-b-2xl bg-slate-200 p-4">
                    <div id="thermal-receipt-preview" ref={previewRef} className="h-fit bg-white shadow">
                        <ReceiptContent invoice={invoice} paper={paper} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceModal;
