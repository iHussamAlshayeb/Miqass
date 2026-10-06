import { useEffect, useState } from 'react';
import { motion as Motion, MotionConfig } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ExternalLink } from 'lucide-react';
import API from '../services/api';

// ألوان الصفحة: أخضر بترولي رسمي مع لمسة نحاسية، على خلفية فاتحة باردة
const C = {
    paper: '#F6F7F5',
    ink: '#14211F',
    muted: '#56635F',
    petrol: '#0F4C47',
    petrolSoft: '#E3EDEA',
    brass: '#A8772E',
    line: '#D8DFDB',
};

const HEADING_FONT = "'Noto Kufi Arabic', 'IBM Plex Sans Arabic', sans-serif";
const BODY_FONT = "'IBM Plex Sans Arabic', 'Tajawal', sans-serif";

const toSafeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const formatNumber = (value) => toSafeNumber(value).toLocaleString('en-US');

const STEPS = [
    { title: 'أنشئ حساب الصالون', text: 'أضف الحلاقين والخدمات وأسعارها وساعات العمل. يستغرق الإعداد دقائق.' },
    { title: 'شارك رابط الحجز', text: 'رابط باسم صالونك تضعه في حسابات التواصل وفي صفحة الصالون على خرائط Google.' },
    { title: 'فعّل ما تحتاجه من الخدمات المرتبطة', text: 'واتساب والدفع الإلكتروني والفوترة اختيارية، ويمكنك البدء بدونها.' },
];

const INTERNAL_GROUPS = [
    {
        title: 'لعملائك',
        items: [
            ['صفحة حجز باسم صالونك', 'يختار العميل الحلاق والخدمات والوقت المتاح، بدون تحميل تطبيق أو إنشاء حساب.'],
            ['إدارة الموعد ذاتياً', 'يعدّل العميل موعده أو يلغيه بعد التحقق من رقم جواله.'],
            ['بطاقة الولاء', 'يرى العميل عدد زياراته وكم بقي على مكافأته.'],
            ['الكشك عند المدخل', 'شاشة لمس يسجّل بها العميل حضوره أو يحجز دوراً بدون موعد مسبق.'],
        ],
    },
    {
        title: 'لإدارة الصالون',
        items: [
            ['المواعيد وسجل الحجوزات', 'جدول اليوم، والبحث والتصفية بالحلاق والخدمة والتاريخ، والتصدير.'],
            ['نقطة البيع', 'بيع الخدمات والمنتجات نقداً أو بالشبكة أو التحويل، مع الدفع الجزئي وإصدار الفاتورة.'],
            ['المخزون والمصروفات', 'كميات المنتجات وتنبيه نقص المخزون، وتسجيل مصاريف التشغيل.'],
            ['قاعدة العملاء', 'تصنيف العملاء وعدد زياراتهم، مع الاستيراد والتصدير عبر Excel.'],
            ['لوحة الأداء', 'الإيرادات، والخدمات المكتملة، وأداء كل حلاق، وأسباب الإلغاء.'],
        ],
    },
    {
        title: 'لفريق العمل',
        items: [
            ['بوابة الحلاق', 'كل حلاق يدخل برمز سري ويرى مواعيده فقط، ويسجّل إنهاء الخدمة أو عدم الحضور.'],
            ['شاشة الطابور', 'تعرض حالة كل كرسي والدور القادم على تلفزيون الصالون، دون إظهار أرقام العملاء.'],
        ],
    },
];

const INTEGRATIONS = [
    {
        name: 'واتساب',
        provider: 'عبر WaSender أو Whatsi',
        adds: 'رسائل تأكيد الحجز والتذكير قبل الموعد والإلغاء وطلب التقييم، ورسائل الحملات التسويقية. تُرسل جميعها من رقم واتساب الصالون.',
        needs: 'رقم واتساب للصالون. مع WaSender تمسح رمز QR من إعدادات مقص، ومع Whatsi تنشئ حساباً لديهم وتلصق مفتاح الربط.',
        plan: 'الاحترافية، والحملات في المميزة',
    },
    {
        name: 'الدفع الإلكتروني',
        provider: 'عبر ميسر (Moyasar)',
        adds: 'تحصيل عربون عند الحجز بالبطاقة. يُحجز الوقت للعميل 15 دقيقة حتى يكتمل الدفع، ثم يُلغى تلقائياً إن لم يدفع.',
        needs: 'حساب تاجر في ميسر ومفاتيح الربط الخاصة به. المبالغ تودع في حساب ميسر الخاص بالصالون مباشرة.',
        plan: 'الاحترافية',
    },
    {
        name: 'الفوترة الإلكترونية',
        provider: 'عبر Zakaty، المرتبط بهيئة الزكاة والضريبة والجمارك',
        adds: 'إرسال فواتير المبيعات وفق المرحلة الثانية من الفوترة الإلكترونية، ومتابعة حالة قبول كل فاتورة.',
        needs: 'رقم ضريبي وسجل تجاري، ورمز OTP من منصة فاتورة لإتمام التسجيل من إعدادات مقص.',
        plan: 'جميع الباقات',
    },
    {
        name: 'تقييمات Google',
        provider: 'عبر خرائط Google',
        adds: 'بعد الزيارة يُطلب من العميل تقييم الخدمة، ويُوجَّه من يقيّم بأربع نجوم فأكثر إلى صفحة الصالون في خرائط Google.',
        needs: 'رابط كتابة التقييم لصفحة الصالون في Google، وربط واتساب لإرسال الطلب.',
        plan: 'الاحترافية',
    },
];

const PLANS = [
    {
        id: 'free',
        name: 'المجانية',
        summary: 'لبدء استقبال الحجوزات وإدارة الصالون.',
        features: [
            'صفحة حجز باسم الصالون ولوحة التحكم',
            'حتى 150 حجزاً في الشهر',
            'حتى كرسيين (حلاقين)',
            'نقطة البيع والمخزون والمصروفات',
        ],
        cta: 'إنشاء حساب مجاني',
    },
    {
        id: 'pro',
        name: 'الاحترافية',
        summary: 'للصالون الذي يريد أتمتة التواصل مع عملائه.',
        features: [
            'كل ما في الباقة المجانية',
            'حجوزات وكراسي بلا حد',
            'رسائل واتساب التلقائية',
            'العربون الإلكتروني عبر ميسر',
            'طلب التقييمات وربطها بخرائط Google',
            'نظام الولاء والمكافآت',
        ],
        cta: 'الاشتراك في الاحترافية',
        featured: true,
    },
    {
        id: 'premium',
        name: 'المميزة',
        summary: 'للتسويق وإدارة فريق أكبر.',
        features: [
            'كل ما في الباقة الاحترافية',
            'حملات واتساب التسويقية',
            'رسائل استعادة العملاء الغائبين',
            'بوابة الحلاقين برمز سري',
            'الكشك عند المدخل وشاشة الطابور',
        ],
        cta: 'الاشتراك في المميزة',
    },
];

const FAQS = [
    ['هل يحتاج العميل إلى تحميل تطبيق؟', 'لا. يحجز العميل من رابط الصالون في المتصفح مباشرة، ولا يحتاج إلى إنشاء حساب.'],
    ['هل يمكنني البدء بدون ربط واتساب أو الدفع؟', 'نعم. الحجز ولوحة التحكم ونقطة البيع تعمل داخل مقص مباشرة. الخدمات المرتبطة تفعّلها متى احتجت إليها.'],
    ['هل أحتاج إلى واتساب للأعمال؟', 'لا يشترط ذلك. يعمل الربط مع رقم واتساب الصالون، سواء كان واتساب العادي أو واتساب للأعمال.'],
    ['أين تذهب مبالغ العربون؟', 'إلى حساب ميسر الخاص بالصالون مباشرة. مقص لا يستلم أي مبالغ نيابة عنك.'],
    ['هل يُحسب الاشتراك السنوي بسعر مختلف؟', 'نعم. الاشتراك السنوي بسعر عشرة أشهر.'],
];

// معاينة المنتج في أعلى الصفحة: جدول اليوم ورسالة التأكيد المرسلة للعميل
const HeroPreview = () => {
    const rows = [
        { time: '4:00 م', name: 'عبدالله', service: 'قص وتحديد', chair: 'محمد', state: 'مكتمل', done: true },
        { time: '4:30 م', name: 'فيصل', service: 'قص شعر أطفال', chair: 'سالم', state: 'محجوز' },
        { time: '5:00 م', name: 'تركي', service: 'حلاقة ذقن', chair: 'محمد', state: 'محجوز' },
        { time: '5:30 م', name: 'نواف', service: 'قص وتحديد', chair: 'سالم', state: 'محجوز' },
    ];
    return (
        <div className="relative mx-auto w-full max-w-[520px] lg:mx-0">
            <Motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="overflow-hidden rounded-xl border bg-white"
                style={{ borderColor: C.line, boxShadow: '0 24px 48px -28px rgba(15,76,71,0.35)' }}
            >
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: C.line }}>
                    <div>
                        <p className="text-sm font-semibold" style={{ color: C.ink }}>مواعيد اليوم</p>
                        <p className="text-xs" style={{ color: C.muted }}>الثلاثاء، 6 أكتوبر</p>
                    </div>
                    <span className="rounded-md px-2.5 py-1 text-xs font-semibold" style={{ background: C.petrolSoft, color: C.petrol }}>4 مواعيد</span>
                </div>
                <ul>
                    {rows.map((row) => (
                        <li key={row.time} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b px-5 py-3 last:border-b-0" style={{ borderColor: C.line }}>
                            <span className="text-sm font-semibold tabular-nums" style={{ color: C.ink }}>{row.time}</span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold" style={{ color: C.ink }}>{row.name}</span>
                                <span className="block truncate text-xs" style={{ color: C.muted }}>{row.service}، عند {row.chair}</span>
                            </span>
                            <span
                                className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                                style={row.done ? { background: C.petrol, color: '#fff' } : { border: `1px solid ${C.line}`, color: C.muted }}
                            >
                                {row.state}
                            </span>
                        </li>
                    ))}
                </ul>
                <div aria-hidden="true" className="h-8" />
            </Motion.div>

            <Motion.figure
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.55, ease: 'easeOut' }}
                className="relative -mt-6 mr-auto w-[86%] sm:w-[74%]"
            >
                <div className="rounded-xl rounded-tl-sm border bg-[#E7F3EC] px-4 py-3 text-sm leading-7" style={{ borderColor: '#CFE3D7', color: C.ink, boxShadow: '0 16px 32px -24px rgba(20,33,31,0.45)' }}>
                    تم تأكيد حجز فيصل يوم الثلاثاء الساعة 4:30 مساءً لدى صالون النخبة، عند الحلاق سالم.
                </div>
                <figcaption className="mt-2 text-xs" style={{ color: C.muted }}>
                    رسالة تأكيد تُرسل تلقائياً من رقم واتساب الصالون
                </figcaption>
            </Motion.figure>
        </div>
    );
};

const SectionHeading = ({ id, title, lead }) => (
    <div className="max-w-2xl">
        <h2 id={id} className="text-2xl font-bold leading-[1.5] md:text-[2rem]" style={{ fontFamily: HEADING_FONT, color: C.ink }}>{title}</h2>
        {lead && <p className="mt-4 text-base leading-8 md:text-lg" style={{ color: C.muted }}>{lead}</p>}
    </div>
);

const LandingScreen = () => {
    const [isAnnual, setIsAnnual] = useState(false);
    const [stats, setStats] = useState({ salons: 0, appointments: 0, customers: 0 });
    const [pricing, setPricing] = useState({ pro: 99, premium: 199 });
    const [discount, setDiscount] = useState({ isActive: false, percentage: 0, name: '' });
    const [clients, setClients] = useState([]);

    useEffect(() => {
        API.get('/public/stats')
            .then((res) => setStats({
                salons: toSafeNumber(res.data?.salons),
                appointments: toSafeNumber(res.data?.appointments),
                customers: toSafeNumber(res.data?.customers),
            }))
            .catch(() => {});
        API.get('/public/pricing')
            .then((res) => {
                if (res.data?.pricing) setPricing(res.data.pricing);
                if (res.data?.discount) setDiscount(res.data.discount);
            })
            .catch(() => {});
        API.get('/public/top-clients')
            .then((res) => setClients(Array.isArray(res.data) ? res.data.slice(0, 8) : []))
            .catch(() => {});
    }, []);

    const priceFor = (planId) => {
        if (planId === 'free') return { final: 0, base: 0 };
        const monthly = toSafeNumber(pricing?.[planId]);
        const base = isAnnual ? monthly * 10 : monthly;
        const final = discount?.isActive ? base * (1 - toSafeNumber(discount.percentage) / 100) : base;
        return { final: Math.round(final), base };
    };

    const hasStats = stats.salons > 0 || stats.appointments > 0;

    return (
        <MotionConfig reducedMotion="user">
            <div dir="rtl" className="min-h-screen text-right antialiased" style={{ background: C.paper, color: C.ink, fontFamily: BODY_FONT }}>
                <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2">تخطي إلى المحتوى</a>

                <header className="sticky top-0 z-50 border-b backdrop-blur" style={{ borderColor: C.line, background: 'rgba(246,247,245,0.92)' }}>
                    <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6" aria-label="القائمة الرئيسية">
                        <Link to="/" className="flex items-center gap-2.5 rounded-md">
                            <img src="/logo.png" alt="" className="h-10 w-auto object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                            <span className="text-lg font-bold" style={{ fontFamily: HEADING_FONT }}>مِقَص</span>
                        </Link>
                        <div className="hidden items-center gap-7 text-sm font-medium md:flex" style={{ color: C.muted }}>
                            <a href="#features" className="hover:text-[#14211F]">المميزات</a>
                            <a href="#integrations" className="hover:text-[#14211F]">الخدمات المرتبطة</a>
                            <a href="#pricing" className="hover:text-[#14211F]">الباقات</a>
                            <a href="#faq" className="hover:text-[#14211F]">الأسئلة الشائعة</a>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link to="/login" className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-white">دخول</Link>
                            <Link to="/register" className="rounded-md px-4 py-2 text-sm font-semibold text-white hover:opacity-90" style={{ background: C.petrol }}>إنشاء حساب</Link>
                        </div>
                    </nav>
                </header>

                <main id="main">
                    <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 md:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
                        <div>
                            {discount?.isActive && (
                                <p className="mb-6 inline-block rounded-md border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: C.brass, color: C.brass }}>
                                    {discount.name ? `${discount.name}: ` : ''}خصم {toSafeNumber(discount.percentage)}% على الباقات المدفوعة
                                </p>
                            )}
                            <h1 className="text-[2rem] font-extrabold leading-[1.45] sm:text-[2.6rem] lg:text-[3.1rem]" style={{ fontFamily: HEADING_FONT }}>
                                نظام حجز وإدارة متكامل لصالونات الحلاقة
                            </h1>
                            <p className="mt-6 max-w-xl text-lg leading-9" style={{ color: C.muted }}>
                                رابط حجز باسم صالونك، ولوحة تحكم للمواعيد والمبيعات والعملاء، مع ربط اختياري بواتساب والدفع الإلكتروني والفوترة الإلكترونية.
                            </p>
                            <div className="mt-9 flex flex-wrap items-center gap-3">
                                <Link to="/register" className="rounded-md px-6 py-3.5 text-base font-semibold text-white hover:opacity-90" style={{ background: C.petrol }}>
                                    إنشاء حساب مجاني
                                </Link>
                                <Link to="/login" className="rounded-md border bg-white px-6 py-3.5 text-base font-semibold hover:bg-[#EEF2F0]" style={{ borderColor: C.line }}>
                                    دخول الصالونات
                                </Link>
                            </div>
                            <p className="mt-4 text-sm" style={{ color: C.muted }}>الباقة المجانية لا تتطلب بطاقة ائتمانية.</p>
                        </div>
                        <HeroPreview />
                    </section>

                    {(hasStats || clients.length > 0) && (
                        <section aria-label="مقص بالأرقام" className="border-y bg-white" style={{ borderColor: C.line }}>
                            <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
                                {hasStats && (
                                    <dl className="grid gap-6 sm:grid-cols-3">
                                        {[
                                            [stats.salons, 'صالون يستخدم مقص'],
                                            [stats.appointments, 'موعد أُدير عبر النظام'],
                                            [stats.customers, 'عميل مسجل لدى الصالونات'],
                                        ].map(([value, label]) => (
                                            <div key={label} className="border-r-2 pr-4" style={{ borderColor: C.brass }}>
                                                <dt className="text-sm" style={{ color: C.muted }}>{label}</dt>
                                                <dd className="mt-1 text-3xl font-bold tabular-nums" style={{ fontFamily: HEADING_FONT }}>{formatNumber(value)}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                                {clients.length > 0 && (
                                    <div className={hasStats ? 'mt-10 border-t pt-8' : ''} style={{ borderColor: C.line }}>
                                        <p className="text-sm font-semibold" style={{ color: C.muted }}>صالونات تستقبل حجوزاتها عبر مقص</p>
                                        <ul className="mt-4 flex flex-wrap gap-3">
                                            {clients.map((client) => (
                                                <li key={client.id || client.slug}>
                                                    <a href={`/${client.slug}`} className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-[#F6F7F5]" style={{ borderColor: C.line }}>
                                                        {client.logo && <img src={client.logo} alt="" className="h-7 w-7 rounded object-cover" loading="lazy" />}
                                                        {client.name}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6" aria-labelledby="how">
                        <SectionHeading id="how" title="ثلاث خطوات لتشغيل الحجز" />
                        <ol className="mt-10 grid gap-8 md:grid-cols-3">
                            {STEPS.map((step, index) => (
                                <li key={step.title} className="border-t-2 pt-5" style={{ borderColor: index === 0 ? C.petrol : C.line }}>
                                    <span className="text-sm font-semibold tabular-nums" style={{ color: C.brass }}>الخطوة {index + 1}</span>
                                    <h3 className="mt-2 text-lg font-bold" style={{ fontFamily: HEADING_FONT }}>{step.title}</h3>
                                    <p className="mt-2 leading-8" style={{ color: C.muted }}>{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </section>

                    <section id="features" className="border-t bg-white" style={{ borderColor: C.line }} aria-labelledby="features-title">
                        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
                            <SectionHeading
                                id="features-title"
                                title="ما يعمل داخل مقص"
                                lead="هذه الميزات جزء من النظام نفسه، ولا تحتاج إلى حسابات أو اشتراكات لدى جهات أخرى. توفر بعضها يختلف حسب الباقة."
                            />
                            <div className="mt-12 grid gap-12 lg:grid-cols-3">
                                {INTERNAL_GROUPS.map((group) => (
                                    <div key={group.title}>
                                        <h3 className="border-b pb-3 text-base font-bold" style={{ borderColor: C.ink, fontFamily: HEADING_FONT }}>{group.title}</h3>
                                        <dl className="divide-y" style={{ borderColor: C.line }}>
                                            {group.items.map(([title, text]) => (
                                                <div key={title} className="py-4" style={{ borderColor: C.line }}>
                                                    <dt className="font-semibold">{title}</dt>
                                                    <dd className="mt-1 text-[15px] leading-7" style={{ color: C.muted }}>{text}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section id="integrations" className="text-white" style={{ background: C.petrol }} aria-labelledby="integrations-title">
                        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
                            <div className="max-w-2xl">
                                <h2 id="integrations-title" className="text-2xl font-bold leading-[1.5] md:text-[2rem]" style={{ fontFamily: HEADING_FONT }}>خدمات خارجية يرتبط بها مقص</h2>
                                <p className="mt-4 text-base leading-8 text-white/80 md:text-lg">
                                    هذه الميزات تقدمها جهات مستقلة، ومقص يتصل بها نيابة عنك. بعضها يتطلب حساباً لدى مزود الخدمة، وجميعها اختيارية.
                                </p>
                            </div>
                            <div className="mt-12 divide-y divide-white/15 border-y border-white/15">
                                {INTEGRATIONS.map((item) => (
                                    <article key={item.name} className="grid gap-5 py-8 lg:grid-cols-[220px_1fr_1fr]">
                                        <div>
                                            <h3 className="text-xl font-bold" style={{ fontFamily: HEADING_FONT }}>{item.name}</h3>
                                            <p className="mt-1 text-sm text-white/70">{item.provider}</p>
                                            <p className="mt-3 inline-block rounded border border-[#D9B676]/60 px-2 py-0.5 text-xs font-semibold text-[#E9CF9C]">{item.plan}</p>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-white/60">ماذا يضيف</h4>
                                            <p className="mt-1.5 leading-8">{item.adds}</p>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-white/60">ما تحتاجه للتفعيل</h4>
                                            <p className="mt-1.5 leading-8 text-white/90">{item.needs}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 md:px-6" aria-labelledby="pricing-title">
                        <div className="flex flex-wrap items-end justify-between gap-6">
                            <SectionHeading id="pricing-title" title="الباقات" lead="ابدأ بالباقة المجانية، وانتقل إلى باقة مدفوعة عندما تحتاج الأتمتة والتسويق." />
                            <div role="group" aria-label="مدة الاشتراك" className="inline-flex rounded-md border bg-white p-1" style={{ borderColor: C.line }}>
                                {[[false, 'شهري'], [true, 'سنوي، بسعر 10 أشهر']].map(([annual, label]) => (
                                    <button
                                        key={label}
                                        type="button"
                                        aria-pressed={isAnnual === annual}
                                        onClick={() => setIsAnnual(annual)}
                                        className="rounded px-4 py-2 text-sm font-semibold transition-colors"
                                        style={isAnnual === annual ? { background: C.ink, color: '#fff' } : { color: C.muted }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-12 grid gap-6 lg:grid-cols-3">
                            {PLANS.map((plan) => {
                                const price = priceFor(plan.id);
                                return (
                                    <article
                                        key={plan.id}
                                        className="flex flex-col rounded-xl border bg-white p-7"
                                        style={plan.featured ? { borderColor: C.petrol, boxShadow: `inset 0 3px 0 ${C.petrol}` } : { borderColor: C.line }}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="text-xl font-bold" style={{ fontFamily: HEADING_FONT }}>{plan.name}</h3>
                                            {plan.featured && <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ background: C.petrolSoft, color: C.petrol }}>الأكثر اختياراً</span>}
                                        </div>
                                        <p className="mt-2 text-sm leading-7" style={{ color: C.muted }}>{plan.summary}</p>
                                        <p className="mt-6 flex items-baseline gap-2">
                                            {plan.id !== 'free' && discount?.isActive && price.base !== price.final && (
                                                <span className="text-lg line-through" style={{ color: C.muted }}>{formatNumber(price.base)}</span>
                                            )}
                                            <span className="text-4xl font-bold tabular-nums" style={{ fontFamily: HEADING_FONT }}>{formatNumber(price.final)}</span>
                                            <span className="text-sm" style={{ color: C.muted }}>
                                                {plan.id === 'free' ? 'ريال' : isAnnual ? 'ريال سنوياً' : 'ريال شهرياً'}
                                            </span>
                                        </p>
                                        <ul className="mt-6 flex-1 space-y-3 border-t pt-6 text-[15px]" style={{ borderColor: C.line }}>
                                            {plan.features.map((feature) => (
                                                <li key={feature} className="flex gap-2.5 leading-7">
                                                    <Check size={18} aria-hidden="true" className="mt-1 shrink-0" style={{ color: C.petrol }} />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <Link
                                            to="/register"
                                            className="mt-8 rounded-md px-5 py-3 text-center font-semibold hover:opacity-90"
                                            style={plan.featured ? { background: C.petrol, color: '#fff' } : { border: `1px solid ${C.ink}`, color: C.ink }}
                                        >
                                            {plan.cta}
                                        </Link>
                                    </article>
                                );
                            })}
                        </div>
                        <p className="mt-6 text-sm leading-7" style={{ color: C.muted }}>
                            الأسعار بالريال السعودي. رسوم الخدمات المرتبطة مثل ميسر وZakaty وWhatsi تُدفع لمزود الخدمة مباشرة ولا تشملها باقات مقص.
                        </p>
                    </section>

                    <section id="faq" className="border-t bg-white" style={{ borderColor: C.line }} aria-labelledby="faq-title">
                        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:px-6 lg:grid-cols-[1fr_1.4fr]">
                            <SectionHeading id="faq-title" title="الأسئلة الشائعة" />
                            <div className="divide-y border-y" style={{ borderColor: C.line }}>
                                {FAQS.map(([question, answer]) => (
                                    <details key={question} className="group py-5" style={{ borderColor: C.line }}>
                                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                                            {question}
                                            <ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" style={{ color: C.muted }} />
                                        </summary>
                                        <p className="mt-3 leading-8" style={{ color: C.muted }}>{answer}</p>
                                    </details>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
                        <div className="flex flex-col items-start justify-between gap-6 rounded-xl px-6 py-10 md:flex-row md:items-center md:px-10" style={{ background: C.ink }}>
                            <div>
                                <h2 className="text-2xl font-bold text-white" style={{ fontFamily: HEADING_FONT }}>ابدأ استقبال الحجوزات اليوم</h2>
                                <p className="mt-2 text-white/70">إنشاء الحساب يستغرق أقل من دقيقة.</p>
                            </div>
                            <Link to="/register" className="rounded-md bg-white px-6 py-3.5 font-semibold hover:bg-[#EEF2F0]" style={{ color: C.ink }}>
                                إنشاء حساب مجاني
                            </Link>
                        </div>
                    </section>
                </main>

                <footer className="border-t" style={{ borderColor: C.line }}>
                    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-6" style={{ color: C.muted }}>
                        <p>© {new Date().getFullYear()} مِقَص. جميع الحقوق محفوظة.</p>
                        <div className="flex flex-wrap gap-5">
                            <Link to="/login" className="hover:text-[#14211F]">دخول الصالونات</Link>
                            <Link to="/register" className="hover:text-[#14211F]">إنشاء حساب</Link>
                            <a href="https://whatsi.ihussam.dev" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[#14211F]">
                                Whatsi <ExternalLink size={13} aria-hidden="true" />
                            </a>
                        </div>
                    </div>
                </footer>
            </div>
        </MotionConfig>
    );
};

export default LandingScreen;
