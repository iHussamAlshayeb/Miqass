import { useState } from 'react';
import { ChevronDown, MessageCircle, RotateCcw } from 'lucide-react';
import { LockedNotice, PlanBadge } from './PlanBadge';
import { isPlanAtLeast } from '../../../utils/plan';

// كل رسالة تلقائية في سطر واحد: تشغيلها، وإعدادها الخاص، ونصها
const MESSAGES = [
    {
        key: 'confirmation', title: 'تأكيد الحجز', description: 'تُرسل فور الحجز أو فور اكتمال دفع العربون.',
        variables: ['اسم_الصالون', 'اسم_العميل', 'التاريخ', 'الوقت', 'الحلاق', 'الموقع', 'رقم_التواصل'],
    },
    {
        key: 'reminder', title: 'تذكير الموعد', description: 'تُرسل قبل الموعد بساعتين ونصف تقريباً.',
        variables: ['اسم_الصالون', 'اسم_العميل', 'الوقت', 'الحلاق', 'الموقع', 'رقم_التواصل'],
    },
    {
        key: 'cancellation', title: 'إلغاء الحجز', description: 'تُرسل عند إلغاء الموعد من الصالون أو من العميل.',
        variables: ['اسم_الصالون', 'اسم_العميل', 'الحلاق', 'سبب_الإلغاء', 'رابط_الحجز'],
    },
    {
        key: 'review', title: 'طلب التقييم', description: 'تُرسل بعد إنهاء الخدمة، ومن يقيّم بأربع نجوم فأكثر يُوجَّه لصفحة الصالون في خرائط Google.',
        variables: ['اسم_الصالون', 'اسم_العميل', 'رابط_التقييم'],
        toggle: 'enableGoogleReviews', plan: 'Pro', upsell: 'طلب التقييمات',
    },
    {
        key: 'loyalty', title: 'مكافأة الولاء', description: 'تُرسل عندما يصل العميل لعدد الزيارات المحدد.',
        variables: ['اسم_الصالون', 'اسم_العميل', 'رابط_الحجز'],
        toggle: 'isLoyaltyEnabled', plan: 'Pro', upsell: 'نظام الولاء',
    },
    {
        key: 'retention', title: 'استعادة العملاء', description: 'تُرسل للعميل الذي لم يزر الصالون منذ المدة المحددة.',
        variables: ['اسم_الصالون', 'اسم_العميل', 'رابط_الحجز'],
        toggle: 'isRetentionEnabled', plan: 'Premium', upsell: 'رسائل استعادة العملاء',
    },
];

const inputClass = 'rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-bold text-slate-800 outline-none focus:border-slate-400';

const Switch = ({ checked, onChange, label, disabled }) => (
    <button
        type="button" role="switch" aria-checked={Boolean(checked)} aria-label={label} disabled={disabled}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}
    >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-0.5' : 'left-[22px]'}`} />
    </button>
);

const AutomationsSection = ({
    settings, setSettings,
    whatsappTemplates, setWhatsappTemplates, whatsappTemplateDefaults,
    templateError, currentPlan, setUpsellConfig,
    isWhatsappConnected, onOpenWhatsapp,
}) => {
    const [openKey, setOpenKey] = useState('');
    const openUpsell = (featureName, requiredPlan) => setUpsellConfig({ isOpen: true, featureName, requiredPlan });

    if (!isPlanAtLeast(currentPlan, 'Pro')) {
        return (
            <LockedNotice
                plan="Pro"
                text="الرسائل التلقائية عبر واتساب (التأكيد والتذكير والإلغاء وغيرها) متاحة في باقة Pro."
                onUpgrade={() => openUpsell('الرسائل التلقائية عبر واتساب', 'Pro')}
            />
        );
    }

    const textFor = (key) => whatsappTemplates?.[key] ?? whatsappTemplateDefaults?.[key] ?? '';
    const setText = (key, value) => setWhatsappTemplates((current) => ({ ...current, [key]: value }));

    const renderSetting = (key) => {
        if (key === 'review') {
            return (
                <label className="block text-xs font-black text-slate-600">
                    رابط كتابة التقييم في خرائط Google
                    <input
                        type="text" inputMode="url" dir="ltr" placeholder="https://g.page/r/.../review"
                        value={settings.googleReviewLink || ''}
                        onChange={(event) => setSettings({ ...settings, googleReviewLink: event.target.value })}
                        className={`${inputClass} mt-1.5 w-full text-left`}
                    />
                </label>
            );
        }
        if (key === 'loyalty') {
            return (
                <label className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-600">
                    المكافأة بعد
                    <input type="number" min="2" max="20" value={settings.loyaltyVisitsRequired || 5}
                        onChange={(event) => setSettings({ ...settings, loyaltyVisitsRequired: parseInt(event.target.value, 10) || 5 })}
                        className={`${inputClass} w-20 text-center`} />
                    زيارات
                </label>
            );
        }
        if (key === 'retention') {
            return (
                <label className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-600">
                    تُرسل بعد غياب
                    <input type="number" min="10" max="90" value={settings.retentionDays || 30}
                        onChange={(event) => setSettings({ ...settings, retentionDays: parseInt(event.target.value, 10) || 30 })}
                        className={`${inputClass} w-20 text-center`} />
                    يوماً
                </label>
            );
        }
        return null;
    };

    return (
        <div className="space-y-4">
            {!isWhatsappConnected && (
                <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold text-amber-900">واتساب غير مربوط، لذلك لن تُرسل هذه الرسائل حتى تربطه.</p>
                    <button type="button" onClick={onOpenWhatsapp} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">ربط واتساب</button>
                </div>
            )}

            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white shadow-sm">
                {MESSAGES.map((message) => {
                    const locked = message.plan && !isPlanAtLeast(currentPlan, message.plan);
                    const enabled = message.toggle ? Boolean(settings[message.toggle]) : true;
                    const isOpen = openKey === message.key;
                    const setting = message.toggle && enabled && !locked ? renderSetting(message.key) : null;
                    return (
                        <article key={message.key} className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 items-start gap-3">
                                    <MessageCircle size={18} className={`mt-0.5 shrink-0 ${enabled && !locked ? 'text-emerald-600' : 'text-slate-300'}`} aria-hidden="true" />
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="font-black text-slate-800">{message.title}</h4>
                                            {locked && <PlanBadge plan={message.plan} onClick={() => openUpsell(message.upsell, message.plan)} />}
                                            {!message.toggle && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">تُرسل دائماً</span>}
                                        </div>
                                        <p className="mt-1 text-xs font-bold leading-6 text-slate-500">{message.description}</p>
                                    </div>
                                </div>
                                {message.toggle && (
                                    <Switch
                                        checked={enabled && !locked}
                                        label={message.title}
                                        onChange={() => (locked
                                            ? openUpsell(message.upsell, message.plan)
                                            : setSettings({ ...settings, [message.toggle]: !enabled }))}
                                    />
                                )}
                            </div>

                            {setting && <div className="mt-4 pr-7">{setting}</div>}

                            {!locked && (
                                <div className="mt-3 pr-7">
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        onClick={() => setOpenKey(isOpen ? '' : message.key)}
                                        className="inline-flex items-center gap-1 text-xs font-black text-slate-600 hover:text-slate-900"
                                    >
                                        تعديل نص الرسالة
                                        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                                    </button>
                                    {isOpen && (
                                        <div className="mt-3 space-y-2">
                                            <textarea
                                                aria-label={`نص رسالة ${message.title}`}
                                                dir="rtl" rows={7} maxLength={4000}
                                                value={textFor(message.key)}
                                                onChange={(event) => setText(message.key, event.target.value)}
                                                className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm leading-7 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[11px] font-bold text-slate-400">إضافة متغير:</span>
                                                {message.variables.map((variable) => (
                                                    <button key={variable} type="button" onClick={() => setText(message.key, `${textFor(message.key)}{${variable}}`)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
                                                        {`{${variable}}`}
                                                    </button>
                                                ))}
                                            </div>
                                            <button type="button" onClick={() => setText(message.key, whatsappTemplateDefaults?.[message.key] ?? '')} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-700">
                                                <RotateCcw size={12} aria-hidden="true" /> استعادة النص الافتراضي
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
            {templateError && <p role="alert" className="text-sm font-bold text-red-600">{templateError}</p>}
        </div>
    );
};

export default AutomationsSection;
