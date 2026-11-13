import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ExternalLink, KeyRound, MonitorSmartphone, Smartphone, Sparkles, UserPlus, X } from 'lucide-react';
import API from '../../services/api';

const LATER_KEY = 'pos_setup_guide_later';
const readLater = () => { try { return sessionStorage.getItem(LATER_KEY) === '1'; } catch { return false; } };

/**
 * دليل الانتقال لنقطة البيع الجديدة للصالونات الحالية: الكاشير يعمل من نقطة البيع برمزه
 * واللوحة تبقى للمالك. كل خطوة تكتمل تلقائياً من البيانات الفعلية.
 */
const PosSetupGuide = ({ onOpenCashierSettings }) => {
    const [status, setStatus] = useState(null);
    const [hidden, setHidden] = useState(readLater);
    const [openStep, setOpenStep] = useState('');

    const load = useCallback(() => {
        API.get('/pos/setup-status').then((res) => setStatus(res.data)).catch(() => setStatus(null));
    }, []);

    useEffect(() => {
        if (hidden) return undefined;
        load();
        // يتحدث تلقائياً عند الرجوع للصفحة بعد إكمال خطوة على جهاز الصالون
        const onFocus = () => load();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [hidden, load]);

    if (hidden || !status || status.dismissed) return null;
    const { steps } = status;
    const allDone = steps.cashier && steps.device && steps.installed && steps.signedIn;
    if (allDone) return null;

    const later = () => { try { sessionStorage.setItem(LATER_KEY, '1'); } catch { /* تجاهل */ } setHidden(true); };
    const dismiss = () => {
        if (!window.confirm('إخفاء دليل إعداد نقطة البيع نهائياً؟ تقدر تكمل الإعداد لاحقاً من الإعدادات ← الكاشير.')) return;
        setHidden(true);
        API.post('/pos/setup-status/dismiss').catch(() => {});
    };

    const STEPS = [
        {
            id: 'cashier',
            done: steps.cashier,
            icon: UserPlus,
            title: 'أضف حساب كاشير',
            text: 'لكل كاشير اسم ورمز دخول خاص (يُفضّل 6 أرقام). الكاشير يرى نقطة البيع فقط، ولا يصل للوحة التحكم ولا للتقارير.',
            action: { label: 'إضافة كاشير', onClick: onOpenCashierSettings },
        },
        {
            id: 'installed',
            done: steps.installed,
            icon: Smartphone,
            title: 'ثبّت نقطة البيع على جهاز الصالون',
            text: 'من جهاز الكاونتر (تابلت أو جوال أو كمبيوتر) افتح الرابط التالي في المتصفح ثم أضفه للشاشة الرئيسية، فيفتح على نقطة البيع مباشرة وليس على لوحة التحكم.',
            details: (
                <ul className="mt-2 space-y-1.5 text-xs font-bold leading-6 text-slate-600">
                    <li><b className="text-slate-800">آيباد / آيفون (سفاري):</b> زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</li>
                    <li><b className="text-slate-800">أندرويد (كروم):</b> القائمة ⋮ ← «تثبيت التطبيق» أو «إضافة للشاشة الرئيسية».</li>
                    <li><b className="text-slate-800">كمبيوتر (كروم أو إيدج):</b> أيقونة التثبيت في شريط العنوان.</li>
                    <li className="text-amber-700">إذا كانت أيقونة مقص القديمة مثبّتة على جهاز الكاونتر احذفها أولاً.</li>
                </ul>
            ),
            link: 'https://www.miqass.app/pos',
        },
        {
            id: 'device',
            done: steps.device,
            icon: MonitorSmartphone,
            title: 'فعّل الجهاز',
            text: 'لحماية حسابك، رمز الكاشير لا يعمل إلا من جهاز فعّلته أنت. افتح تطبيق نقطة البيع المثبّت على الجهاز، ثم اطلب من هنا «رمز تفعيل جهاز» واكتبه هناك مع رابط الصالون. الرمز صالح 10 دقائق ولمرة واحدة.',
            action: { label: 'رمز تفعيل جهاز', onClick: onOpenCashierSettings },
        },
        {
            id: 'signedIn',
            done: steps.signedIn,
            icon: KeyRound,
            title: 'أول دخول للكاشير',
            text: 'الكاشير يكتب رمزه في نقطة البيع ويفتح الوردية. من هناك يتابع حجوزات اليوم، يحصّل، يطبع الإيصالات، ويسجل المصروفات من الصندوق ثم يغلق الوردية.',
        },
    ];
    const doneCount = STEPS.filter((step) => step.done).length;
    const current = openStep || STEPS.find((step) => !step.done)?.id;

    return (
        <section className="mb-5 overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm" aria-label="إعداد نقطة البيع">
            <div className="flex items-start gap-3 bg-gradient-to-l from-emerald-50 to-white p-4 sm:p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white"><Sparkles size={20} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-emerald-700">جديد في مِقَص</p>
                    <h2 className="text-lg font-black text-slate-900">تمت إضافة ميزة جديدة لنقطة البيع</h2>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                        دخول برمز لنقطة البيع من جهاز الصالون، مع حجوزات اليوم والتحصيل والوردية ومصروفات الصندوق. أكمل الخطوات التالية لتفعيلها.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
                        </div>
                        <span className="shrink-0 text-xs font-black text-slate-500">{doneCount} من {STEPS.length}</span>
                    </div>
                </div>
                <button type="button" onClick={later} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="لاحقاً"><X size={18} /></button>
            </div>

            <ol className="divide-y divide-slate-100">
                {STEPS.map((step, index) => {
                    const open = current === step.id;
                    const Icon = step.icon;
                    return (
                        <li key={step.id}>
                            <button type="button" onClick={() => setOpenStep(open ? 'none' : step.id)} className="flex w-full items-center gap-3 px-4 py-3 text-right sm:px-5">
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${step.done ? 'bg-emerald-600 text-white' : open ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {step.done ? <Check size={15} /> : index + 1}
                                </span>
                                <Icon size={17} className={step.done ? 'text-emerald-600' : 'text-slate-400'} />
                                <span className={`flex-1 text-sm font-black ${step.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{step.title}</span>
                                <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                            </button>
                            {open && (
                                <div className="px-4 pb-4 pr-14 sm:px-5 sm:pr-16">
                                    <p className="text-sm font-bold leading-7 text-slate-600">{step.text}</p>
                                    {step.details}
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        {step.link && (
                                            <>
                                                <span className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm font-bold text-slate-800" dir="ltr">{step.link.replace('https://', '')}</span>
                                                <button type="button" onClick={() => navigator.clipboard?.writeText(step.link).catch(() => {})} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">نسخ الرابط</button>
                                                <a href="/pos" target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><ExternalLink size={14} /> فتح</a>
                                            </>
                                        )}
                                        {step.action && !step.done && (
                                            <button type="button" onClick={step.action.onClick} className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-black text-white">{step.action.label}</button>
                                        )}
                                        {step.done && <span className="text-xs font-black text-emerald-700">تمت هذه الخطوة ✓</span>}
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>

            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 sm:px-5">
                <button type="button" onClick={later} className="text-xs font-black text-slate-500 hover:text-slate-700">لاحقاً</button>
                <button type="button" onClick={dismiss} className="text-xs font-bold text-slate-400 hover:text-slate-600">لا تظهر مرة أخرى</button>
            </div>
        </section>
    );
};

export default PosSetupGuide;
