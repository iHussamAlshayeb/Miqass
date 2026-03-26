import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CancelAppointmentModal = ({ isOpen, onClose, onConfirm, isCanceling }) => {
    // 💡 الحالات الافتراضية للنافذة
    const [selectedReason, setSelectedReason] = useState('العميل لم يحضر');
    const [customReason, setCustomReason] = useState('');

    // 💡 قائمة الأسباب المجهزة مسبقاً للصالونات
    const reasonsList = [
        'العميل لم يحضر',
        'تأخير العميل عن الموعد',
        'بناءً على طلب العميل',
        'ظرف طارئ في الصالون',
        'أخرى'
    ];

    // 💡 دالة الاعتماد وإرسال السبب
    const handleConfirm = () => {
        // تحديد السبب النهائي (سواء من القائمة أو المخصص)
        const finalReason = selectedReason === 'أخرى' ? customReason : selectedReason;

        // التحقق من أن الكاشير كتب سبباً إذا اختار "أخرى"
        if (selectedReason === 'أخرى' && !customReason.trim()) {
            return alert('الرجاء كتابة سبب الإلغاء لكي يظهر للعميل.');
        }

        // إرسال السبب للدالة الأب (التي ستتصل بالباك إند)
        onConfirm(finalReason);
    };

    // إذا كانت النافذة مغلقة، لا تعرض شيئاً
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-[2rem] p-6 md:p-8 w-full max-w-md shadow-2xl relative overflow-hidden"
                    dir="rtl"
                >
                    {/* 💡 خلفية جمالية خفيفة */}
                    <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>

                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-3xl mb-6 mx-auto shadow-inner border border-red-100">
                        ⚠️
                    </div>

                    <h3 className="text-xl font-black text-slate-800 text-center mb-2">إلغاء الموعد</h3>
                    <p className="text-sm font-bold text-slate-500 text-center mb-6 leading-relaxed">
                        سيتم إلغاء هذا الموعد وتفريغ الكرسي.<br />
                        <span className="text-emerald-600 text-xs">سيتم إرسال رسالة واتساب للعميل لإبلاغه بالسبب.</span>
                    </p>

                    <div className="space-y-4 mb-8">
                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-2">اختر سبب الإلغاء:</label>
                            <select
                                value={selectedReason}
                                onChange={(e) => setSelectedReason(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 cursor-pointer transition-all appearance-none"
                            >
                                {reasonsList.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>

                        {/* 💡 حقل النص يظهر فقط إذا تم اختيار "أخرى" مع حركة لطيفة */}
                        {selectedReason === 'أخرى' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                            >
                                <label className="block text-xs font-black text-slate-700 mb-2">اكتب السبب (سيُرسل للعميل):</label>
                                <input
                                    type="text"
                                    value={customReason}
                                    onChange={(e) => setCustomReason(e.target.value)}
                                    placeholder="مثال: الكرسي تعطل، الموظف استأذن..."
                                    className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 transition-all"
                                />
                            </motion.div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleConfirm}
                            disabled={isCanceling}
                            className="flex-1 bg-red-500 text-white font-black py-4 rounded-xl hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50 flex justify-center items-center shadow-lg shadow-red-500/30"
                        >
                            {isCanceling ? (
                                <span className="animate-pulse">جاري الإلغاء...</span>
                            ) : (
                                'تأكيد الإلغاء ✖️'
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            disabled={isCanceling}
                            className="flex-1 bg-slate-100 text-slate-600 font-black py-4 rounded-xl hover:bg-slate-200 active:scale-95 transition-all"
                        >
                            تراجع
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default CancelAppointmentModal;