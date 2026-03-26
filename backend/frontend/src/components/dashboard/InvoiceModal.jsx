import React, { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Settings } from 'lucide-react';

// ==========================================
// ⚙️ إعدادات أحجام الورق الحرارية
// ==========================================
const PAPER_SIZES = {
    '58mm': { width: '58mm', px: 219, label: '58mm (صغير)' },
    '72mm': { width: '72mm', px: 272, label: '72mm (متوسط)' },
    '80mm': { width: '80mm', px: 302, label: '80mm (كبير)' },
    '104mm': { width: '104mm', px: 393, label: '104mm (A4 حراري)' },
};

// ==========================================
// 🖨️ CSS الطباعة المُحسَّن للطابعات الحرارية
// ==========================================
const buildPrintStyles = (paperWidth) => `
    @charset "UTF-8";

    @font-face {
        font-family: 'ThermalArabic';
        src: local('Tahoma'), local('Arial Unicode MS'), local('Amiri'), local('Cairo');
        unicode-range: U+0600-06FF;
    }

    @media print {
        @page {
            size: ${paperWidth} auto;
            margin: 0 !important;
            padding: 0 !important;
        }

        html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }

        body > *:not(#thermal-print-root) {
            display: none !important;
            visibility: hidden !important;
        }

        #thermal-print-root {
            display: block !important;
            visibility: visible !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: ${paperWidth} !important;
            max-width: ${paperWidth} !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            font-family: 'Tahoma', 'Arial Unicode MS', 'Arial', sans-serif !important;
        }

        #thermal-print-root * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            box-sizing: border-box !important;
        }

        .thermal-total-row {
            background-color: #000 !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        table { page-break-inside: avoid !important; }
        tr    { page-break-inside: avoid !important; }

        html { height: auto !important; }
        body { height: auto !important; overflow: visible !important; }
    }
`;

// ==========================================
// 🧾 مكون محتوى الإيصال – مُحسَّن للحراري
// ==========================================
const ReceiptContent = ({ invoice, invoiceNumber, formatCurrency, baseAmount, vatAmount, totalAmount, paperSize }) => {
    const pw = PAPER_SIZES[paperSize] || PAPER_SIZES['80mm'];
    const isNarrow = pw.px < 272;   // 58mm
    const isMedium = pw.px < 302;   // 72mm

    /* خطوط ديناميكية حسب العرض */
    const fs = {
        title: isNarrow ? '13px' : isMedium ? '15px' : '17px',
        normal: isNarrow ? '8px' : isMedium ? '9px' : '10px',
        small: isNarrow ? '7px' : '8px',
        mono: isNarrow ? '9px' : isMedium ? '10px' : '11px',
        totalLbl: isNarrow ? '10px' : '12px',
        totalVal: isNarrow ? '13px' : '15px',
    };

    // 💡 الاعتماد الكلي على الـ QR القادم من الباك إند
    const zatcaBase64 = invoice?.qrCode;

    return (
        <div
            dir="rtl"
            className="text-black bg-white"
            style={{
                width: pw.width,
                maxWidth: pw.width,
                minHeight: '60mm',
                fontFamily: "'Tahoma', 'Arial Unicode MS', 'Arial', sans-serif",
                padding: isNarrow ? '6px 5px' : '8px 8px',
                boxSizing: 'border-box',
                direction: 'rtl',
                unicodeBidi: 'embed',
            }}
        >
            {/* ─── رأس الفاتورة بالشعار ─── */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '5px' }}>

                {(invoice?.logoUrl || invoice?.branding?.logoUrl) && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
                        <img
                            src={invoice.logoUrl || invoice.branding?.logoUrl}
                            alt="Logo"
                            style={{
                                maxHeight: '50px',
                                maxWidth: '80%',
                                objectFit: 'contain',
                                filter: 'grayscale(100%) contrast(1.2)'
                            }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    </div>
                )}

                <div style={{ fontSize: fs.title, fontWeight: '900', marginBottom: '2px', letterSpacing: '0.5px' }}>
                    {invoice?.salonName || 'صالون الحلاقة'}
                </div>
                {invoice?.address && (
                    <div style={{ fontSize: fs.small, marginBottom: '1px' }}>{invoice.address}</div>
                )}
                {invoice?.phone && (
                    <div style={{ fontSize: fs.small, direction: 'ltr', unicodeBidi: 'embed' }}>{invoice.phone}</div>
                )}
                {invoice?.taxNumber && (
                    <div style={{ fontSize: fs.small, marginTop: '2px', fontWeight: 'bold' }}>
                        الرقم الضريبي: <span style={{ fontFamily: 'monospace' }}>{invoice.taxNumber}</span>
                    </div>
                )}
            </div>

            {/* ─── شارة الفاتورة ─── */}
            <div style={{ textAlign: 'center', marginBottom: '5px' }}>
                <span style={{
                    fontSize: fs.small,
                    fontWeight: 'bold',
                    border: '1px solid #000',
                    padding: '1px 8px',
                    borderRadius: '20px',
                    display: 'inline-block',
                }}>
                    فاتورة ضريبية مبسطة
                </span>
            </div>

            {/* ─── بيانات الفاتورة ─── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px', fontSize: fs.normal }}>
                <tbody>
                    <tr style={{ borderBottom: '1px solid #000' }}>
                        <td style={{ padding: '2px 3px', width: '50%', borderRight: '1px solid #000', verticalAlign: 'top' }}>
                            <div style={{ fontSize: fs.small, color: '#555' }}>رقم الفاتورة</div>
                            <div style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: fs.mono, letterSpacing: '0.5px' }}>{invoiceNumber}</div>
                        </td>
                        <td style={{ padding: '2px 3px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: fs.small, color: '#555' }}>التاريخ</div>
                                    <div style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{invoice?.date}</div>
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: fs.small, color: '#555' }}>الوقت</div>
                                    <div style={{ fontFamily: 'monospace' }}>{invoice?.time}</div>
                                </div>
                            </div>
                        </td>
                    </tr>
                    {(invoice?.customerName || invoice?.customerPhone) && (
                        <tr>
                            <td style={{ padding: '2px 3px', borderRight: '1px solid #000', verticalAlign: 'top' }}>
                                <div style={{ fontSize: fs.small, color: '#555' }}>العميل</div>
                                <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {invoice.customerName || 'عميل نقدي'}
                                </div>
                            </td>
                            <td style={{ padding: '2px 3px', verticalAlign: 'top' }}>
                                <div style={{ fontSize: fs.small, color: '#555' }}>الجوال</div>
                                <div style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'right', unicodeBidi: 'embed' }}>
                                    {invoice.customerPhone || '---'}
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* ─── جدول الخدمات ─── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: fs.normal, border: '1px solid #000' }}>
                <thead>
                    <tr style={{ background: '#f0f0f0', borderBottom: '1px solid #000' }}>
                        <th style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'right', width: '55%' }}>الخدمة</th>
                        {!isNarrow && (
                            <th style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', width: '15%' }}>ك</th>
                        )}
                        <th style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>السعر</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice?.services?.map((srv, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px dashed #ccc' }}>
                            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'right', fontWeight: 'bold', verticalAlign: 'top' }}>
                                {srv.name}
                            </td>
                            {!isNarrow && (
                                <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', fontFamily: 'monospace', verticalAlign: 'top' }}>
                                    {srv.qty || 1}
                                </td>
                            )}
                            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', verticalAlign: 'top' }}>
                                {formatCurrency(srv.price)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ─── الإجماليات ─── */}
            <div style={{ width: '100%', border: '1px solid #000', overflow: 'hidden', fontSize: fs.normal, marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', borderBottom: '1px dashed #000' }}>
                    <span>المبلغ الأساسي</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatCurrency(baseAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', borderBottom: '1px solid #000' }}>
                    <span>ضريبة 15%</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatCurrency(vatAmount)}</span>
                </div>
                <div
                    className="thermal-total-row"
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px',
                        backgroundColor: '#000',
                        color: '#fff',
                    }}
                >
                    <span style={{ fontSize: fs.totalLbl, fontWeight: '900', color: '#fff' }}>الإجمالي</span>
                    <span style={{ fontFamily: 'monospace', fontSize: fs.totalVal, fontWeight: '900', color: '#fff' }}>
                        {formatCurrency(totalAmount)}
                        <span style={{ fontSize: fs.small, fontWeight: 'normal', color: '#fff' }}> ر.س</span>
                    </span>
                </div>
            </div>

            {/* ─── طريقة الدفع ─── */}
            {invoice?.paymentMethod && (
                <div style={{
                    textAlign: 'center',
                    fontSize: fs.normal,
                    border: '1px solid #000',
                    padding: '2px',
                    marginBottom: '10px',
                    fontWeight: 'bold',
                }}>
                    طريقة الدفع: {invoice.paymentMethod}
                </div>
            )}

            {/* 💡 ─── QR الزكاة ─── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '10px' }}>
                {zatcaBase64 ? (
                    <>
                        <div style={{ border: '2px solid #000', padding: '6px', background: '#fff', borderRadius: '4px' }}>
                            <QRCodeSVG
                                value={zatcaBase64}
                                size={isNarrow ? 90 : isMedium ? 110 : 130}
                                level="M"
                                bgColor="#ffffff"
                                fgColor="#000000"
                            />
                        </div>
                        <div style={{ fontSize: fs.normal, marginTop: '4px', fontWeight: '900', textAlign: 'center' }}>QR فاتورة ضريبية</div>

                        {/* 💡 شارة احترافية تظهر أن النظام محدث للمرحلة الثانية */}
                        {invoice?.isZatcaPhase2 && (
                            <div style={{ fontSize: '8px', fontWeight: 'bold', border: '1px solid #000', padding: '2px 4px', borderRadius: '2px', marginTop: '2px' }}>
                                ZATCA Phase 2 ✅
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ width: '80px', height: '80px', border: '1px dashed #999', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#888', textAlign: 'center' }}>لا يوجد ضريبة</span>
                    </div>
                )}
            </div>

            {/* ─── رسالة الختام ─── */}
            <div style={{ textAlign: 'center', borderTop: '2px solid #000', paddingTop: '6px', marginTop: '4px' }}>
                <div style={{ fontSize: fs.normal, fontWeight: 'bold', marginBottom: '2px' }}>
                    {invoice?.thankYouMsg || 'شكراً لزيارتكم! 🌟'}
                </div>
                {invoice?.website && (
                    <div style={{ fontSize: fs.small, direction: 'ltr', unicodeBidi: 'embed' }}>{invoice.website}</div>
                )}
                <div style={{ fontSize: '8px', color: '#aaa', marginTop: '4px' }}>Powered by Miqass.app</div>
            </div>

            <div style={{ height: '8mm' }} />
        </div>
    );
};

// ==========================================
// 🖨️ مكون InvoiceModal الرئيسي
// ==========================================
const InvoiceModal = ({ invoice, onClose, autoPrint = false, defaultPaperSize = '80mm' }) => {
    const [paperSize, setPaperSize] = useState(defaultPaperSize);
    const [showSizeMenu, setShowSizeMenu] = useState(false);
    const autoPrintedRef = useRef(false);
    const paperSizeRef = useRef(paperSize);

    useEffect(() => { paperSizeRef.current = paperSize; }, [paperSize]);

    useEffect(() => {
        const saved = localStorage.getItem('thermal_paper_size');
        if (saved && PAPER_SIZES[saved]) setPaperSize(saved);
    }, []);

    const formatCurrency = (amount) => (Number(amount) || 0).toFixed(2);

    const baseAmount = Number(invoice?.baseAmount) || 0;
    const vatAmount = Number(invoice?.vatAmount) || 0;
    const totalAmount = Number(invoice?.totalAmount) || 0;
    const invoiceNumber = invoice?.invoiceNumber || `INV-000000`;

    const handlePrint = useCallback(() => {
        const source = document.getElementById('thermal-receipt-preview');
        if (!source) return;

        const existingRoot = document.getElementById('thermal-print-root');
        if (existingRoot) document.body.removeChild(existingRoot);

        const printRoot = document.createElement('div');
        printRoot.id = 'thermal-print-root';
        printRoot.innerHTML = source.innerHTML;
        document.body.appendChild(printRoot);

        const existingStyle = document.getElementById('thermal-print-style');
        if (existingStyle) document.head.removeChild(existingStyle);

        const style = document.createElement('style');
        style.id = 'thermal-print-style';
        style.innerHTML = buildPrintStyles(PAPER_SIZES[paperSizeRef.current].width);
        document.head.appendChild(style);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.print();
                setTimeout(() => {
                    if (document.getElementById('thermal-print-root')) {
                        document.body.removeChild(printRoot);
                    }
                    if (document.getElementById('thermal-print-style')) {
                        document.head.removeChild(style);
                    }
                }, 300);
            });
        });
    }, []);

    useEffect(() => {
        if (!autoPrint || autoPrintedRef.current || !invoice) return;
        autoPrintedRef.current = true;

        const waitForImages = () => {
            const container = document.getElementById('thermal-receipt-preview');
            if (!container) return;

            const images = Array.from(container.querySelectorAll('img'));
            if (images.length === 0) {
                handlePrint();
                return;
            }

            let loaded = 0;
            const checkAll = () => {
                loaded++;
                if (loaded >= images.length) handlePrint();
            };

            images.forEach(img => {
                if (img.complete) {
                    checkAll();
                } else {
                    img.addEventListener('load', checkAll, { once: true });
                    img.addEventListener('error', checkAll, { once: true });
                }
            });

            setTimeout(() => { if (!autoPrintedRef.current) return; handlePrint(); }, 2000);
        };

        const timer = setTimeout(waitForImages, 200);
        return () => clearTimeout(timer);
    }, [autoPrint, invoice, handlePrint]);

    const handleSizeChange = (size) => {
        setPaperSize(size);
        localStorage.setItem('thermal_paper_size', size);
        setShowSizeMenu(false);
    };

    if (!invoice) return null; // حماية إضافية إذا لم يتم تمرير الفاتورة بعد

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4"
            style={{ animation: 'fadeIn 0.2s ease' }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

                {/* ─── شريط الأدوات ─── */}
                <div className="flex justify-between items-center p-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl gap-2">
                    <h3 className="font-black text-slate-800 text-base whitespace-nowrap">معاينة الفاتورة 🧾</h3>

                    <div className="flex gap-2 items-center flex-wrap justify-end">

                        <div className="relative">
                            <button
                                onClick={() => setShowSizeMenu(v => !v)}
                                className="flex items-center gap-1 bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-100 transition"
                                title="اختر حجم الورق"
                            >
                                <Settings size={13} />
                                {PAPER_SIZES[paperSize]?.label}
                            </button>
                            {showSizeMenu && (
                                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 min-w-[150px] overflow-hidden">
                                    {Object.entries(PAPER_SIZES).map(([key, val]) => (
                                        <button
                                            key={key}
                                            onClick={() => handleSizeChange(key)}
                                            className={`w-full text-right px-3 py-2 text-xs font-bold hover:bg-slate-100 transition block ${paperSize === key ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
                                        >
                                            {val.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handlePrint}
                            className="bg-slate-900 text-white px-4 py-1.5 rounded-xl flex items-center gap-1.5 hover:bg-slate-700 transition font-black text-sm active:scale-95"
                        >
                            <Printer size={14} /> طباعة
                        </button>

                        <button
                            onClick={onClose}
                            className="bg-white border border-slate-200 text-slate-500 p-1.5 rounded-xl hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* ─── منطقة المعاينة ─── */}
                <div className="overflow-y-auto p-4 bg-slate-200 flex-1 flex justify-center rounded-b-2xl">
                    <div id="thermal-receipt-preview" className="shadow bg-white">
                        <ReceiptContent
                            invoice={invoice}
                            invoiceNumber={invoiceNumber}
                            formatCurrency={formatCurrency}
                            baseAmount={baseAmount}
                            vatAmount={vatAmount}
                            totalAmount={totalAmount}
                            paperSize={paperSize}
                        />
                    </div>
                </div>

            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
};

export default InvoiceModal;