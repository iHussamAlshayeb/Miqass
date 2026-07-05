import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const reasonsList = [
    'العميل لم يحضر',
    'تأخير العميل عن الموعد',
    'بناءً على طلب العميل',
    'ظرف طارئ في الصالون',
    'أخرى',
];

const CancelAppointmentModal = ({ isOpen, onClose, onConfirm, isCanceling }) => {
    const [selectedReason, setSelectedReason] = useState('العميل لم يحضر');
    const [customReason, setCustomReason] = useState('');

    const handleConfirm = () => {
        const finalReason = selectedReason === 'أخرى' ? customReason : selectedReason;

        if (selectedReason === 'أخرى' && !customReason.trim()) {
            alert('الرجاء كتابة سبب الإلغاء لكي يظهر للعميل.');
            return;
        }

        onConfirm(finalReason);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-lg p-5 md:p-6 w-full max-w-md shadow-2xl border border-slate-100" dir="rtl">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 bg-red-50 text-red-600 rounded-lg flex items-center justify-center border border-red-100 shrink-0">
                            <AlertTriangle size={21} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800">إلغاء الموعد</h3>
                            <p className="text-sm font-bold text-slate-500 mt-1 leading-relaxed">
                                سيتم إلغاء الموعد وتفريغ الكرسي، مع إرسال السبب للعميل إن كان الواتساب مفعلاً.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isCanceling}
                        className="w-9 h-9 rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-50 flex items-center justify-center disabled:opacity-50"
                        aria-label="إغلاق"
                    >
                        <X size={17} />
                    </button>
                </div>

                <div className="space-y-4 my-6">
                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-2">سبب الإلغاء</label>
                        <select
                            value={selectedReason}
                            onChange={(event) => setSelectedReason(event.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 cursor-pointer transition-all appearance-none"
                        >
                            {reasonsList.map((reason) => (
                                <option key={reason} value={reason}>{reason}</option>
                            ))}
                        </select>
                    </div>

                    {selectedReason === 'أخرى' && (
                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-2">اكتب السبب</label>
                            <input
                                type="text"
                                value={customReason}
                                onChange={(event) => setCustomReason(event.target.value)}
                                placeholder="مثال: تعذر توفر الحلاق في هذا الوقت"
                                className="w-full p-4 bg-white border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 transition-all"
                            />
                        </div>
                    )}
                </div>

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isCanceling}
                        className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-lg hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 flex justify-center items-center"
                    >
                        {isCanceling ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isCanceling}
                        className="flex-1 bg-slate-100 text-slate-600 font-black py-3.5 rounded-lg hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50"
                    >
                        تراجع
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CancelAppointmentModal;
