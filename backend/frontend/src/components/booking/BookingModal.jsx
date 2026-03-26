import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTime12Hour, getTimePeriod } from '../../utils/helpers';
import LoyaltyCard from './LoyaltyCard';

const BookingModal = ({
    isOpen,
    onClose,
    tenantData,
    selectedTime,
    selectedChair,
    phone,
    setPhone,
    childrenNames,
    setChildrenNames,
    maxConsecutiveSlots,
    selectedServicesIds,
    totals,
    isCheckingLoyalty,
    loyaltyVisits,
    savedChildren, // 💡 استلام مصفوفة الأسماء
    handleBookingSubmit,
    isLoading
}) => {

    // 💡 دالة التعامل مع الأزرار السريعة
    const handleQuickSelect = (childName) => {
        // منع إضافة الاسم مرتين
        if (childrenNames.includes(childName)) return;

        // البحث عن أول حقل فارغ
        const emptyIndex = childrenNames.findIndex(n => n.trim() === '');

        if (emptyIndex !== -1) {
            // تعبئة الحقل الفارغ
            const newNames = [...childrenNames];
            newNames[emptyIndex] = childName;
            setChildrenNames(newNames);
        } else if (childrenNames.length < maxConsecutiveSlots) {
            // إضافة حقل جديد معبأ بالاسم (إذا كان الوقت يسمح)
            setChildrenNames([...childrenNames, childName]);
        } else {
            alert('عذراً، الوقت المتاح لا يتسع لإضافة المزيد من الأشخاص المتتاليين.');
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* الخلفية المعتمة */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40"
                        onClick={onClose}
                    />

                    {/* النافذة المنبثقة */}
                    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="bg-white w-full max-w-md rounded-t-[40px] p-6 pt-8 shadow-2xl pointer-events-auto relative max-h-[90vh] overflow-y-auto hide-scrollbar"
                        >
                            {/* المؤشر العلوي */}
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto absolute top-3 left-1/2 transform -translate-x-1/2"></div>

                            {/* هيدر النافذة */}
                            <div className="flex justify-between items-start mb-6 mt-2">
                                <div>
                                    <h3 className="text-2xl font-black text-gray-800">تأكيد الموعد ✨</h3>
                                    <p className="text-gray-400 font-bold text-sm mt-1">
                                        <span dir="ltr">{formatTime12Hour(selectedTime)}</span> {getTimePeriod(selectedTime)} • {selectedChair} ✂️
                                    </p>
                                </div>
                                <button onClick={onClose} className="bg-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-200 w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors">✕</button>
                            </div>

                            {/* نموذج الحجز */}
                            <form onSubmit={handleBookingSubmit} className="space-y-4">

                                {/* رقم الجوال */}
                                <div>
                                    <input
                                        type="tel" required pattern="^05[0-9]{8}$" maxLength="10" placeholder="رقم الجوال (05XXXXXXXX)"
                                        value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                        className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white outline-none text-right font-black text-gray-800 placeholder-gray-400 transition-all text-lg tracking-wider focus:ring-4" dir="ltr"
                                        style={{ '--tw-ring-color': `${tenantData.branding.primaryColor}30`, borderColor: phone.length === 10 ? tenantData.branding.primaryColor : undefined }}
                                    />
                                </div>

                                {/* بطاقة الولاء */}
                                <AnimatePresence>
                                    {tenantData?.settings?.isLoyaltyEnabled && isCheckingLoyalty && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-center text-xs text-gray-400 font-bold py-2">
                                            جاري التحقق من الولاء... ⏳
                                        </motion.div>
                                    )}
                                    {tenantData?.settings?.isLoyaltyEnabled && loyaltyVisits !== null && !isCheckingLoyalty && (
                                        <LoyaltyCard visits={loyaltyVisits} primaryColor={tenantData.branding.primaryColor} requiredVisits={tenantData.settings.loyaltyVisitsRequired || 5} />
                                    )}
                                </AnimatePresence>

                                {/* أسماء الأشخاص */}
                                <div className="space-y-3 bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
                                    <div className="flex justify-between items-center px-1 mb-2">
                                        <label className="text-sm font-black text-slate-700 flex items-center gap-2">👥 أسماء الأشخاص</label>
                                        <div className="flex items-center gap-2">
                                            {childrenNames.length < maxConsecutiveSlots && (
                                                <button type="button" onClick={() => setChildrenNames([...childrenNames, ''])} className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors shadow-sm">+ شخص إضافي</button>
                                            )}
                                            {childrenNames.length === maxConsecutiveSlots && maxConsecutiveSlots < 4 && (
                                                <span className="text-[10px] text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded-lg">لا توجد أوقات متتالية إضافية ⚠️</span>
                                            )}
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {childrenNames.map((name, index) => (
                                            <motion.div key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="flex gap-2 relative">
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-black">{index + 1}</div>
                                                <input
                                                    type="text" required placeholder={index === 0 ? "الاسم الكريم (مثال: محمد)" : "اسم المرافق (مثال: علي)"} value={name}
                                                    onChange={(e) => { const newNames = [...childrenNames]; newNames[index] = e.target.value; setChildrenNames(newNames); }}
                                                    className="w-full p-4 pr-10 bg-white border border-slate-200 rounded-2xl focus:bg-slate-50 outline-none font-black text-slate-800 placeholder-slate-400 transition-all text-sm focus:ring-2 focus:border-transparent shadow-sm"
                                                    style={{ '--tw-ring-color': `${tenantData.branding.primaryColor}40` }}
                                                />
                                                {index > 0 && <button type="button" onClick={() => setChildrenNames(childrenNames.filter((_, i) => i !== index))} className="w-14 shrink-0 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-lg hover:bg-red-100 transition-colors shadow-sm">🗑️</button>}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>

                                    {/* 💡 أزرار الاستكمال السريع (تظهر فقط إذا كان هناك أسماء محفوظة) */}
                                    <AnimatePresence>
                                        {savedChildren && savedChildren.length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-4 pt-4 border-t border-slate-200/60"
                                            >
                                                <p className="text-[11px] font-bold text-slate-400 mb-3">اختر من الأسماء المسجلة مسبقاً (لحجز أسرع):</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {savedChildren.map((childName, idx) => {
                                                        const isSelected = childrenNames.includes(childName);
                                                        return (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => handleQuickSelect(childName)}
                                                                disabled={isSelected}
                                                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm border
                                                                    ${isSelected
                                                                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70'
                                                                        : 'bg-white hover:bg-slate-50 active:scale-95'}`}
                                                                style={!isSelected ? { color: tenantData.branding.primaryColor, borderColor: `${tenantData.branding.primaryColor}40` } : {}}
                                                            >
                                                                {isSelected ? `✓ ${childName}` : `+ ${childName}`}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* ملخص الفاتورة */}
                                    {selectedServicesIds.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-slate-200/60 flex justify-between items-center">
                                            <div>
                                                <p className="text-slate-400 text-[10px] font-bold mb-0.5">الإجمالي التقريبي ({childrenNames.filter(n => n.trim() !== '').length} شخص):</p>
                                                <h4 className="font-black text-lg text-slate-800">{totals.price * childrenNames.filter(n => n.trim() !== '').length} <span className="text-xs text-slate-500">ر.س</span></h4>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-slate-400 text-[10px] font-bold mb-0.5">المدة المحجوزة:</p>
                                                <h4 className="font-black text-sm text-slate-700 bg-white px-2 py-1 rounded-md border border-slate-100">⏱️ {totals.duration * childrenNames.filter(n => n.trim() !== '').length} دقيقة</h4>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* زر التأكيد */}
                                <div className="pt-2 pb-safe">
                                    <motion.button
                                        whileTap={{ scale: 0.95 }} type="submit" disabled={isLoading}
                                        className="w-full py-4 text-white rounded-2xl font-black text-lg transition-all disabled:opacity-70 disabled:scale-100 flex justify-center items-center gap-2"
                                        style={{ backgroundColor: tenantData.branding.primaryColor, boxShadow: `0 8px 20px ${tenantData.branding.primaryColor}40` }}
                                    >
                                        {isLoading ? (
                                            <span className="animate-pulse">جاري المعالجة...</span>
                                        ) : (
                                            <>
                                                {/* 💡 تغيير نص الزر بذكاء إذا كان الصالون يفعل الدفع الإلكتروني */}
                                                {tenantData?.paymentSettings?.isOnlinePaymentEnabled && tenantData?.paymentSettings?.depositAmount > 0
                                                    ? `دفع عربون (${tenantData.paymentSettings.depositAmount} ر.س) 💳`
                                                    : `تأكيد الحجز ✨`}
                                            </>
                                        )}
                                    </motion.button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

export default BookingModal;