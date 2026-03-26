import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../../services/api';

const BroadcastsTab = ({ tenantId }) => {
    const [message, setMessage] = useState('');
    const [targetAudience, setTargetAudience] = useState('all');
    const [isSending, setIsSending] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // إضافة متغير للرسالة
    const insertVariable = (variable) => {
        setMessage(prev => prev + `${variable} `);
    };

    const handleSendBroadcast = async (e) => {
        e.preventDefault();

        if (!message.trim()) return setErrorMsg('الرجاء كتابة نص الرسالة.');
        if (!message.includes('[الاسم]')) {
            const confirmNoName = window.confirm('رسالتك لا تحتوي على متغير [الاسم]. إضافة اسم العميل يقلل جداً من فرصة حظر رقمك. هل أنت متأكد من الإرسال بدون الاسم؟');
            if (!confirmNoName) return;
        }

        setIsSending(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            const res = await API.post('/appointments/broadcast', {
                tenantId,
                message,
                targetAudience
            });

            setSuccessMsg(`تم إدراج حملتك بنجاح! 🎉 سيتم إرسالها لـ ${res.data.targetCount} عميل بشكل تدريجي (بفاصل زمني آمن) لتجنب الحظر.`);
            setMessage('');
        } catch (error) {
            setErrorMsg(error.response?.data?.message || 'حدث خطأ أثناء جدولة الحملة.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-[35px] shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 border-b border-slate-50 pb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            📢 منشئ حملات الواتساب
                        </h2>
                        <p className="text-slate-500 font-bold text-sm mt-1">
                            أرسل عروضك لعملائك بضغطة زر (مع حماية ذكية ضد الحظر).
                        </p>
                    </div>
                    <span className="bg-purple-50 text-purple-600 px-4 py-2 rounded-xl font-black text-xs border border-purple-100 shadow-sm">
                        ميزة VIP 👑
                    </span>
                </div>

                {/* 🛡️ إرشادات الحماية من الحظر */}
                <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl mb-8 flex gap-4 items-start shadow-sm">
                    <span className="text-3xl hidden md:block">🛡️</span>
                    <div>
                        <h4 className="font-black text-amber-800 text-sm mb-1">كيف نتجنب حظر الواتساب؟</h4>
                        <ul className="text-xs font-bold text-amber-700/80 space-y-1.5 list-disc list-inside px-1">
                            <li>النظام يقوم بإرسال الرسائل <strong>ببطء شديد</strong> (رسالة كل 15-30 ثانية) لمحاكاة الإرسال البشري.</li>
                            <li>احرص دائماً على إدراج زر <strong>[الاسم]</strong> لتكون كل رسالة مختلفة عن الأخرى.</li>
                            <li>لا ترسل أكثر من حملة واحدة في الأسبوع لكي لا ينزعج العملاء ويبلغوا عن رقمك (Spam).</li>
                        </ul>
                    </div>
                </div>

                <form onSubmit={handleSendBroadcast} className="space-y-6">
                    {/* 1. الاستهداف */}
                    <div>
                        <label className="block text-sm font-black text-slate-700 mb-3">🎯 لمن تريد إرسال الحملة؟</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <label className={`cursor-pointer p-4 rounded-2xl border-2 transition-all ${targetAudience === 'all' ? 'border-purple-500 bg-purple-50 shadow-sm scale-[1.02]' : 'border-slate-100 hover:border-slate-200 bg-white'}`}>
                                <input type="radio" name="audience" value="all" checked={targetAudience === 'all'} onChange={() => setTargetAudience('all')} className="hidden" />
                                <div className="font-black text-slate-800 mb-1">الجميع 🌍</div>
                                <div className="text-[10px] font-bold text-slate-500 leading-relaxed">إرسال لجميع العملاء المسجلين في قاعدة بياناتك.</div>
                            </label>
                            <label className={`cursor-pointer p-4 rounded-2xl border-2 transition-all ${targetAudience === 'inactive_30' ? 'border-purple-500 bg-purple-50 shadow-sm scale-[1.02]' : 'border-slate-100 hover:border-slate-200 bg-white'}`}>
                                <input type="radio" name="audience" value="inactive_30" checked={targetAudience === 'inactive_30'} onChange={() => setTargetAudience('inactive_30')} className="hidden" />
                                <div className="font-black text-slate-800 mb-1">المنقطعين 😴</div>
                                <div className="text-[10px] font-bold text-slate-500 leading-relaxed">لم يزوروا الصالون منذ أكثر من 30 يوماً.</div>
                            </label>
                            <label className={`cursor-pointer p-4 rounded-2xl border-2 transition-all ${targetAudience === 'vip' ? 'border-purple-500 bg-purple-50 shadow-sm scale-[1.02]' : 'border-slate-100 hover:border-slate-200 bg-white'}`}>
                                <input type="radio" name="audience" value="vip" checked={targetAudience === 'vip'} onChange={() => setTargetAudience('vip')} className="hidden" />
                                <div className="font-black text-slate-800 mb-1">العملاء المميزين 👑</div>
                                <div className="text-[10px] font-bold text-slate-500 leading-relaxed">زاروا الصالون 3 مرات أو أكثر.</div>
                            </label>
                        </div>
                    </div>

                    {/* 2. كتابة الرسالة */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-sm font-black text-slate-700">💬 نص الرسالة</label>
                            <button
                                type="button"
                                onClick={() => insertVariable('[الاسم]')}
                                className="text-xs bg-purple-50 hover:bg-purple-100 border border-purple-100 text-purple-700 font-black px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                            >
                                <span>+ إدراج</span> <span>[الاسم]</span>
                            </button>
                        </div>
                        <div className="relative">
                            <textarea
                                required
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows="6"
                                placeholder="مثال: أهلاً [الاسم]، بمناسبة العيد نقدم لك خصم 20% على حلاقتك القادمة..."
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white transition-all text-sm font-bold text-slate-700 resize-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                            ></textarea>
                        </div>

                        {/* 💡 المعاينة الحية (تم فصلها لتكون أسفل النص ولا تغطيه) */}
                        <AnimatePresence>
                            {message && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-3 bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl text-xs font-bold text-slate-600 shadow-sm"
                                >
                                    <span className="text-emerald-600 font-black mb-2 flex items-center gap-1"><span>👀</span> معاينة للعميل (محمد):</span>
                                    <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
                                        {message.replace(/\[الاسم\]/g, 'محمد')}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* التنبيهات والأزرار */}
                    <AnimatePresence>
                        {errorMsg && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-red-50 text-red-500 p-3 rounded-xl text-xs font-bold text-center border border-red-100">
                                {errorMsg}
                            </motion.div>
                        )}
                        {successMsg && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-emerald-50 text-emerald-600 p-4 rounded-xl text-sm font-black text-center leading-relaxed border border-emerald-100">
                                {successMsg}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        disabled={isSending}
                        className="w-full bg-gradient-to-l from-purple-600 to-purple-500 text-white font-black py-4 rounded-2xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2"
                    >
                        {isSending ? (
                            <span className="animate-pulse">جاري تجهيز الحملة... ⏳</span>
                        ) : (
                            <>
                                <span>إطلاق الحملة التسويقية الآن</span>
                                <span className="text-xl">🚀</span>
                            </>
                        )}
                    </button>
                </form>
            </div>
        </motion.div>
    );
};

export default BroadcastsTab;