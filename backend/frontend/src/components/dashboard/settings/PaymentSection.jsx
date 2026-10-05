import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
    CircleDollarSign,
} from 'lucide-react';

const MotionDiv = Motion.div;

const PaymentSection = ({
    paymentSettings,
    setPaymentSettings,
    activeSettingsTab,
    currentPlan,
    setUpsellConfig,
}) => (
    <section role="tabpanel" data-settings-tab="finance" className={`${activeSettingsTab === 'finance' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
        <div className="flex justify-between items-center mb-6 border-b border-slate-50 pb-4">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                إعدادات الدفع المسبق (العربون)
            </h3>
        </div>

        <div className="bg-indigo-50/50 p-6 rounded-lg border border-indigo-100">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <label className="block text-sm font-black text-indigo-900">تفعيل الدفع الإلكتروني</label>
                    <p className="text-xs font-bold text-indigo-700/70 mt-1 max-w-sm">
                        اطلب من عملائك دفع عربون لتأكيد الحجز. الربط يتم بحساب ميسر الخاص بالصالون.
                    </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={paymentSettings?.isOnlinePaymentEnabled || false}
                        onChange={(e) => {
                            if (currentPlan === 'Free') {
                                setUpsellConfig({ isOpen: true, featureName: 'بوابة الدفع والعربون', requiredPlan: 'Pro' });
                                return;
                            }
                            setPaymentSettings({ ...paymentSettings, isOnlinePaymentEnabled: e.target.checked });
                        }}
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
            </div>

            <AnimatePresence>
                {paymentSettings?.isOnlinePaymentEnabled && (
                    <MotionDiv
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-4 border-t border-indigo-100/50 space-y-5">

                            {/* قيمة العربون */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2">مبلغ العربون المطلوب لتأكيد الحجز</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="1"
                                            value={paymentSettings?.depositAmount || ''}
                                            onChange={(e) => setPaymentSettings({ ...paymentSettings, depositAmount: Number(e.target.value) })}
                                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm"
                                            dir="ltr"
                                        />
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">ر.س</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2">مزود الدفع</label>
                                    <div className="w-full p-3 bg-white border border-slate-200 rounded-lg font-black text-slate-800 text-sm">
                                        ميسر (Moyasar)
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">المفتاح السري لميسر (Secret Key)</label>
                                <input
                                    type="password"
                                    autoComplete="off"
                                    value={paymentSettings?.moyasarSecretKey || ''}
                                    onChange={(e) => setPaymentSettings({ ...paymentSettings, moyasarSecretKey: e.target.value })}
                                    className="w-full p-3 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                                    placeholder={paymentSettings?.hasSecretKey ? "محفوظ بأمان (اكتب لتغييره)" : "sk_live_..."}
                                    dir="ltr"
                                />
                                <p className="text-[10px] text-slate-400 mt-1 font-bold">
                                    {paymentSettings?.hasSecretKey ? "تم حفظ المفتاح مسبقاً." : "سيتم تشفير المفتاح تلقائياً بمجرد الحفظ."} لا حاجة لإعداد Webhook يدوياً، النظام يرسله مع كل رابط دفع.
                                </p>
                            </div>

                            <div className="bg-white p-4 rounded-lg flex items-center justify-between border border-indigo-50">
                                <div className="flex items-center gap-3">
                                    <CircleDollarSign size={20} className="text-indigo-600" />
                                    <div>
                                        <p className="text-xs font-black text-slate-800">الربط مع حساب ميسر</p>
                                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">كل صالون يستخدم حساب ميسر الخاص به، والمبالغ تذهب لحسابه مباشرة.</p>
                                    </div>
                                </div>
                                <a href="https://dashboard.moyasar.com" target="_blank" rel="noopener noreferrer" className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-lg text-xs font-black transition-colors">
                                    لوحة ميسر
                                </a>
                            </div>

                        </div>
                    </MotionDiv>
                )}
            </AnimatePresence>
        </div>
    </section>
);

export default PaymentSection;
