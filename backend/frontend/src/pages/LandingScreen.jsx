import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import TrustedClients from '../components/TrustedClients'; // 💡 الاستيراد الجديد

const LandingPage = () => {
    const navigate = useNavigate();

    const [isAnnual, setIsAnnual] = useState(false);

    const [stats, setStats] = useState({
        salons: 0,
        appointments: 0,
        customers: 0
    });

    // ==========================================
    // 💡 [NEW] حالة الأسعار والتخفيضات (لجلبها من السيرفر)
    // ==========================================
    const [pricing, setPricing] = useState({ pro: 99, premium: 199 });
    const [discount, setDiscount] = useState({ isActive: false, percentage: 0, name: '' });

    useEffect(() => {
        const fetchPublicData = async () => {
            try {
                // 1. جلب الإحصائيات
                const statsRes = await API.get('/public/stats');
                setStats({
                    salons: statsRes.data.salons,
                    appointments: statsRes.data.appointments,
                    customers: statsRes.data.customers
                });

                // 2. جلب الأسعار الحية
                const pricingRes = await API.get('/public/pricing');
                if (pricingRes.data) {
                    setPricing(pricingRes.data.pricing || { pro: 99, premium: 199 });
                    setDiscount(pricingRes.data.discount || { isActive: false, percentage: 0, name: '' });
                }
            } catch (error) {
                console.error("خطأ في جلب البيانات العامة:", error);
            }
        };
        fetchPublicData();
    }, []);

    const fadeUp = {
        hidden: { opacity: 0, y: 40 },
        show: { opacity: 1, y: 0, transition: { duration: .6 } }
    };

    // ==========================================
    // 💡 [NEW] حساب الأسعار النهائية بعد الخصم السنوي والتخفيضات
    // ==========================================
    // 1. السعر الأساسي بناءً على المدة (السنوي يحسب 10 أشهر فقط)
    const baseProPrice = isAnnual ? pricing.pro * 10 : pricing.pro;
    const basePremiumPrice = isAnnual ? pricing.premium * 10 : pricing.premium;

    // 2. السعر النهائي بعد تطبيق نسبة الخصم (إذا كان العرض مفعلاً)
    const finalProPrice = discount.isActive ? baseProPrice * (1 - discount.percentage / 100) : baseProPrice;
    const finalPremiumPrice = discount.isActive ? basePremiumPrice * (1 - discount.percentage / 100) : basePremiumPrice;

    return (
        <div dir="rtl" className="bg-slate-50 text-right font-arabic min-h-screen selection:bg-blue-200">

            {/* ================= NAVBAR ================= */}
            <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
                <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                        <img
                            src="/logo.png"
                            alt="شعار مقص"
                            className="h-16 md:h-20 w-auto object-contain cursor-pointer hover:scale-105 transition-transform drop-shadow-sm"
                            onClick={() => navigate("/")}
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                        />
                        <span className="text-3xl hidden drop-shadow-sm cursor-pointer" onClick={() => navigate("/")}>✂️</span>
                        <h1 className="font-black text-xl text-slate-800 cursor-pointer hidden sm:block" onClick={() => navigate("/")}>
                            نظام مِقَص السحابي
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate("/login")} className="font-bold text-slate-600 hover:text-blue-600 transition-colors">
                            دخول الصالونات
                        </button>
                        <button onClick={() => navigate("/register")} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">
                            سجل مجاناً
                        </button>
                    </div>
                </div>
            </nav>

            {/* ================= HERO ================= */}
            <section className="pt-40 pb-20 max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-14 items-center">
                <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: .15 } } }} className="space-y-8">
                    {/* لافتة العرض الترويجي إذا كان مفعلاً */}
                    <motion.div variants={fadeUp} className={`font-bold text-sm px-4 py-2 rounded-full inline-block border shadow-sm ${discount.isActive ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                        {discount.isActive ? `🔥 ${discount.name} - خصم ${discount.percentage}%` : '✨ التسجيل مجاني لفترة محدودة'}
                    </motion.div>
                    <motion.h1 variants={fadeUp} className="text-5xl lg:text-6xl font-black leading-tight text-slate-900">
                        نظام إدارة ذكي<br />يحوّل صالونك إلى <span className="text-transparent bg-clip-text bg-gradient-to-l from-blue-600 to-purple-600">منصة رقمية</span>
                    </motion.h1>
                    <motion.p variants={fadeUp} className="text-lg text-slate-600 max-w-lg leading-relaxed font-bold">
                        أوقف فوضى المواعيد! مع "مِقَص"، ستحصل على رابط حجز لعملائك، سكرتير آلي عبر الواتساب، شاشة انتظار تلفزيونية، ونظام تسويق يعيد لك عملائك المنقطعين.
                    </motion.p>

                    <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <button onClick={() => navigate("/register")} className="bg-gradient-to-l from-blue-600 to-blue-500 text-white px-8 py-4 rounded-2xl font-black hover:opacity-90 shadow-xl shadow-blue-500/30 transition-all hover:-translate-y-1 flex items-center gap-2">
                            <span>ابدأ باستخدام النظام مجاناً</span>
                            <span className="text-xl">🚀</span>
                        </button>
                        <span className="text-slate-400 text-sm font-bold bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">لا يتطلب بطاقة ائتمانية</span>
                    </motion.div>
                </motion.div>

                <div className="relative">
                    <div className="absolute -z-10 w-96 h-96 bg-blue-400/20 blur-3xl rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                    <div className="absolute -z-10 w-64 h-64 bg-purple-400/20 blur-3xl rounded-full bottom-0 right-0"></div>
                    <img src="https://images.unsplash.com/photo-1600091106707-2b3315b6b90d?q=80&w=1172&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" className="rounded-[40px] shadow-2xl border-4 border-white object-cover h-[500px] w-fill" alt="صالون حلاقة" />
                </div>
            </section>

            {/* ================= STATS (إحصائيات المنصة) ================= */}
            <section className="border-y border-slate-200 bg-white py-10 relative z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-100">
                        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} className="text-center py-2">
                            <h3 className="text-4xl lg:text-5xl font-black text-blue-600 mb-2">+{stats.salons.toLocaleString()}</h3>
                            <p className="text-slate-500 font-bold text-base lg:text-lg">صالون يثق بنا </p>
                        </motion.div>
                        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} className="text-center py-2">
                            <h3 className="text-4xl lg:text-5xl font-black text-purple-600 mb-2">+{stats.appointments.toLocaleString()}</h3>
                            <p className="text-slate-500 font-bold text-base lg:text-lg">موعد تم إدارته</p>
                        </motion.div>
                        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} className="text-center py-2">
                            <h3 className="text-4xl lg:text-5xl font-black text-emerald-500 mb-2">+{stats.customers.toLocaleString()}</h3>
                            <p className="text-slate-500 font-bold text-base lg:text-lg">عميل سعيد تمت خدمته</p>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ================= FEATURES ================= */}
            <section className="py-24 max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <h2 className="text-4xl font-black mb-4 text-slate-800">كل ما تحتاجه للارتقاء بصالونك 🚀</h2>
                    <p className="text-slate-500 text-lg font-bold">ميزات حصرية لن تجدها في أي نظام آخر</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                        { icon: "📅", title: "رابط حجز مخصص", desc: "رابط باسم صالونك يُمكّن العملاء من الحجز في ثوانٍ بدون تحميل تطبيقات." },
                        { icon: "💬", title: "سكرتير الواتساب الآلي", desc: "النظام يرسل رسائل تأكيد، وتذكير قبل الموعد، ورسائل إلغاء آلياً للعميل." },
                        { icon: "📺", title: "شاشة التلفزيون المباشرة", desc: "اعرض طابور الانتظار (Live Queue) على شاشة الصالون لتنظيم الدور باحترافية." },
                        { icon: "📢", title: "حملات تسويقية ذكية", desc: "أرسل عروض العيد وخصومات للعملاء المنقطعين بضغطة زر لزيادة مبيعاتك." },
                        { icon: "⭐", title: "فلترة تقييمات جوجل", desc: "نطلب التقييم من العميل، ونوجه التقييمات الإيجابية (5 نجوم) لخرائط جوجل فقط." },
                        { icon: "👨‍💈", title: "بوابة خاصة للطاقم", desc: "رابط خاص لكل حلاق ليرى مواعيده القادمة ويقوم بإنهاء الموعد من جواله." },
                    ].map((feat, i) => (
                        <div key={i} className="bg-white p-8 rounded-[35px] border border-slate-100 hover:shadow-xl hover:shadow-blue-900/5 transition-all hover:-translate-y-2 group">
                            <div className="text-4xl mb-6 bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center group-hover:bg-blue-50 group-hover:scale-110 transition-all">{feat.icon}</div>
                            <h3 className="font-black text-xl mb-3 text-slate-800">{feat.title}</h3>
                            <p className="text-slate-500 text-sm leading-relaxed font-bold">{feat.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ================= TRUSTED CLIENTS (شركاء النجاح) ================= */}
            <TrustedClients />

            {/* ================= PRICING ================= */}
            <section className="py-24 bg-slate-900 text-white border-y border-slate-800">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-10">
                        <h2 className="text-4xl font-black mb-4">باقات تناسب حجم طموحك 💼</h2>
                        <p className="text-slate-400 text-lg font-bold">ابدأ مجاناً ورقي باقتك عندما تكبر أعمالك.</p>
                    </div>

                    {/* 💡 أزرار التبديل (شهري / سنوي) */}
                    <div className="flex justify-center mb-16">
                        <div className="bg-slate-800 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-700 relative">
                            <button
                                onClick={() => setIsAnnual(false)}
                                className={`px-6 py-3 rounded-xl font-black text-sm transition-all z-10 ${!isAnnual ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white'}`}
                            >
                                اشتراك شهري
                            </button>
                            <button
                                onClick={() => setIsAnnual(true)}
                                className={`px-6 py-3 rounded-xl font-black text-sm transition-all flex items-center gap-2 z-10 ${isAnnual ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white'}`}
                            >
                                اشتراك سنوي <span className={`text-[10px] px-2 py-1 rounded-full ${isAnnual ? 'bg-emerald-400 text-emerald-950' : 'bg-emerald-500/20 text-emerald-400'} animate-pulse`}>شهرين مجاناً 🎁</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* 1. الباقة المجانية */}
                        <div className="bg-slate-800/50 rounded-[40px] p-8 border border-slate-700 hover:border-slate-600 transition-colors flex flex-col">
                            <div className="mb-8">
                                <span className="bg-slate-700 text-slate-300 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase">الأساسية</span>
                                <h3 className="text-3xl font-black mt-4 mb-2">مجانية</h3>
                                <p className="text-slate-400 text-sm font-bold">لفترة محدودة، للصالونات الناشئة.</p>
                            </div>
                            <ul className="space-y-4 mb-8 flex-1 text-sm font-bold text-slate-300">
                                <li className="flex items-center gap-3"><span className="text-emerald-400">✔</span> رابط حجز مخصص للصالون</li>
                                <li className="flex items-center gap-3"><span className="text-emerald-400">✔</span> استقبال لغاية 150 حجز شهرياً</li>
                                <li className="flex items-center gap-3"><span className="text-emerald-400">✔</span> إضافة طاقم العمل (لا محدود)</li>
                                <li className="flex items-center gap-3"><span className="text-emerald-400">✔</span> لوحة تحكم أساسية للمواعيد</li>
                                <li className="flex items-center gap-3 opacity-50"><span className="text-slate-600">✖</span> أتمتة الواتساب غير مشمولة</li>
                            </ul>
                            <button onClick={() => navigate("/register")} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-4 rounded-2xl transition-all">
                                ابدأ مجاناً الآن
                            </button>
                        </div>

                        {/* 2. باقة Pro (الشائعة) */}
                        <div className="bg-gradient-to-b from-blue-600 to-blue-800 rounded-[40px] p-8 border border-blue-500 shadow-2xl shadow-blue-900/50 transform md:-translate-y-4 flex flex-col relative transition-all duration-300">
                            <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-amber-400 text-amber-950 font-black px-4 py-1 rounded-full text-xs shadow-lg whitespace-nowrap">
                                الأكثر شيوعاً 🔥
                            </div>
                            <div className="mb-6 mt-2">
                                <span className="bg-blue-500/50 text-blue-100 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase">الاحترافية (Pro)</span>

                                {/* 💡 تصميم السعر المحدث */}
                                <h3 className="text-4xl font-black mt-4 mb-1 flex items-center gap-3">
                                    {discount.isActive && (
                                        <span className="text-2xl text-blue-300/50 line-through decoration-red-500 decoration-2">{baseProPrice}</span>
                                    )}
                                    <span>{finalProPrice.toFixed(0)}</span>
                                    <span className="text-lg text-blue-200">{isAnnual ? 'ريال/سنة' : 'ريال/شهر'}</span>
                                </h3>

                                {isAnnual && !discount.isActive && <div className="text-emerald-300 text-xs font-bold bg-blue-900/50 px-3 py-1 rounded-lg inline-block mb-2">وفر {pricing.pro * 2} ريال! (تدفع قيمة 10 أشهر)</div>}
                                {discount.isActive && <div className="text-amber-300 text-xs font-black bg-white/10 px-3 py-1 rounded-lg inline-block mb-2">🔥 عرض {discount.name}</div>}
                                <p className="text-blue-200 text-sm font-bold mt-2">أتمتة كاملة لتوفير وقتك وجهدك.</p>
                            </div>
                            <ul className="space-y-4 mb-8 flex-1 text-sm font-bold text-blue-50">
                                <li className="flex items-center gap-3"><span className="text-amber-300">✔</span> حجوزات لا محدودة (Unlimited)</li>
                                <li className="flex items-center gap-3"><span className="text-amber-300">✔</span> <strong>أتمتة الواتساب كاملة</strong> (تأكيد، تذكير، إلغاء)</li>
                                <li className="flex items-center gap-3"><span className="text-amber-300">✔</span> نظام طلب التقييمات الآلي</li>
                                <li className="flex items-center gap-3"><span className="text-amber-300">✔</span> فلترة التقييمات وربط جوجل ماب</li>
                                <li className="flex items-center gap-3"><span className="text-amber-300">✔</span> تصدير الإحصائيات وقاعدة العملاء</li>
                            </ul>
                            <button onClick={() => navigate("/register")} className="w-full bg-white text-blue-700 hover:bg-blue-50 font-black py-4 rounded-2xl transition-all shadow-lg active:scale-95">
                                اشترك في Pro {isAnnual && '(سنوي)'}
                            </button>
                        </div>

                        {/* 3. باقة VIP المميزة */}
                        <div className="bg-slate-800/50 rounded-[40px] p-8 border border-purple-500/30 hover:border-purple-500/50 transition-all duration-300 flex flex-col relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                            <div className="mb-6">
                                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase">المميزة (VIP)</span>

                                {/* 💡 تصميم السعر المحدث */}
                                <h3 className="text-4xl font-black mt-4 mb-1 flex items-center gap-3 relative z-10">
                                    {discount.isActive && (
                                        <span className="text-2xl text-slate-500 line-through decoration-red-500 decoration-2">{basePremiumPrice}</span>
                                    )}
                                    <span>{finalPremiumPrice.toFixed(0)}</span>
                                    <span className="text-lg text-slate-400">{isAnnual ? 'ريال/سنة' : 'ريال/شهر'}</span>
                                </h3>

                                {isAnnual && !discount.isActive && <div className="text-emerald-400 text-xs font-bold bg-slate-800 px-3 py-1 rounded-lg inline-block mb-2 relative z-10">وفر {pricing.premium * 2} ريال! (تدفع قيمة 10 أشهر)</div>}
                                {discount.isActive && <div className="text-amber-300 text-xs font-black bg-white/10 px-3 py-1 rounded-lg inline-block mb-2 relative z-10">🔥 عرض {discount.name}</div>}
                                <p className="text-slate-400 text-sm font-bold mt-2 relative z-10">المنظومة التسويقية والتشغيلية الكاملة.</p>
                            </div>
                            <ul className="space-y-4 mb-8 flex-1 text-sm font-bold text-slate-300 relative z-10">
                                <li className="flex items-center gap-3"><span className="text-purple-400">✔</span> كل ما سبق في باقة Pro</li>
                                <li className="flex items-center gap-3"><span className="text-purple-400">✔</span> <strong>منشئ حملات الواتساب التسويقية</strong> 📢</li>
                                <li className="flex items-center gap-3"><span className="text-purple-400">✔</span> <strong>شاشة الانتظار التلفزيونية (TV)</strong> 📺</li>
                                <li className="flex items-center gap-3"><span className="text-purple-400">✔</span> <strong>بوابة إدارة الطاقم للحلاقين</strong> 📱</li>
                                <li className="flex items-center gap-3"><span className="text-purple-400">✔</span> وضع الكشك (Kiosk) لاستقبال الصالون</li>
                            </ul>
                            <button onClick={() => navigate("/register")} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-purple-900/50 relative z-10">
                                احصل على التميز {isAnnual && '(سنوي)'}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* ================= CTA ================= */}
            <section className="py-24 text-center bg-blue-50 m-6 rounded-[40px] relative overflow-hidden border border-blue-100 shadow-sm">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/50 rounded-full blur-3xl -mr-20 -mt-20"></div>

                <h2 className="text-4xl font-black mb-6 text-slate-800 relative z-10">هل أنت مستعد لنقل صالونك للمستوى التالي؟</h2>
                <p className="text-slate-500 mb-8 text-lg font-bold relative z-10">التسجيل يأخذ أقل من دقيقة، ولا نطلب منك أي تفاصيل بنكية لتجربة النظام.</p>

                <button onClick={() => navigate("/register")} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all hover:scale-105 relative z-10 flex items-center gap-2 mx-auto">
                    <span>أنشئ حسابك مجاناً الآن</span>
                    <span>✨</span>
                </button>
            </section>

            {/* ================= FOOTER ================= */}
            <footer className="py-10 text-center text-sm text-slate-400 font-bold border-t border-slate-200 bg-white">
                <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 mb-4">
                    <img src="/logo.png" alt="شعار مقص" className="h-10 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity" onError={(e) => { e.target.style.display = 'none'; }} />
                    <span className="text-slate-600 font-black text-lg">نظام مِقَص السحابي</span>
                </div>
                <p>© {new Date().getFullYear()} جميع الحقوق محفوظة لـ نظام مقص.</p>
            </footer>

        </div>
    );
};

export default LandingPage;