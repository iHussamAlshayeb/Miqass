import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, KeyRound, TriangleAlert, Unplug } from 'lucide-react';

const WHATSI_APP_URL = 'https://whatsi.ihussam.dev/app';

const inputClass = 'mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600';

// ربط Whatsi بمفتاح API من تطبيق Whatsi (linked=false)، أو إدارة الربط الحالي (linked=true)
const WhatsiSettings = ({ linked, info, onSave, onDisconnect, isBusy }) => {
    const [apiKey, setApiKey] = useState('');
    const [fromNumber, setFromNumber] = useState(info?.from || '');
    const [webhookSecret, setWebhookSecret] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [copied, setCopied] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setFeedback(null);
        const payload = { fromNumber };
        if (apiKey.trim()) payload.apiKey = apiKey.trim();
        if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
        const result = await onSave(payload);
        setFeedback(result);
        if (result?.ok) { setApiKey(''); setWebhookSecret(''); }
    };

    const copyWebhookUrl = async () => {
        try {
            await navigator.clipboard.writeText(info?.webhookUrl || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { setCopied(false); }
    };

    const isConnected = info?.status === 'CONNECTED';

    return (
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-right md:p-6">
            {linked ? (
                <div className={`mb-5 flex items-start gap-3 rounded-lg border p-4 ${isConnected ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    {isConnected ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" /> : <TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber-600" />}
                    <div>
                        <p className={`font-black ${isConnected ? 'text-emerald-800' : 'text-amber-800'}`}>
                            {isConnected ? 'الواتساب مربوط عبر Whatsi' : 'رقم الواتساب غير متصل في Whatsi'}
                        </p>
                        <p className={`mt-1 text-xs font-bold ${isConnected ? 'text-emerald-700/80' : 'text-amber-700'}`}>
                            {isConnected
                                ? `النظام يرسل التنبيهات لعملائك${info?.from ? ` من الرقم ${info.from}` : ' من الرقم الافتراضي في حسابك'}.`
                                : 'افتح تطبيق Whatsi وأعد ربط الرقم من صفحة «أرقامي». ستُستأنف الرسائل تلقائياً بعد الاتصال.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="mb-5">
                    <h4 className="font-black text-slate-800">ربط الواتساب عبر Whatsi</h4>
                    <ol className="mt-2 list-decimal space-y-1 pr-5 text-xs font-bold leading-6 text-slate-500">
                        <li>سجّل في تطبيق Whatsi واربط رقم الصالون من صفحة «أرقامي».</li>
                        <li>من صفحة «الربط و API» أنشئ مفتاحاً وانسخه (يظهر مرة واحدة).</li>
                        <li>الصق المفتاح هنا واضغط «ربط».</li>
                    </ol>
                    <a href={WHATSI_APP_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 underline underline-offset-4">
                        فتح تطبيق Whatsi <ExternalLink size={13} />
                    </a>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-bold text-slate-700 md:col-span-2">
                    {linked ? 'تغيير مفتاح API (اختياري)' : 'مفتاح API'}
                    <div className="relative">
                        <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-slate-400" />
                        <input
                            type="password" autoComplete="off" dir="ltr" value={apiKey}
                            onChange={(event) => setApiKey(event.target.value)}
                            placeholder={linked ? 'المفتاح الحالي محفوظ' : 'wg_live_...'}
                            required={!linked} className={`${inputClass} pl-9 text-left`}
                        />
                    </div>
                </label>
                <label className="block text-sm font-bold text-slate-700">
                    رقم الإرسال (اختياري)
                    <input
                        type="tel" inputMode="numeric" dir="ltr" value={fromNumber}
                        onChange={(event) => setFromNumber(event.target.value.replace(/[^\d+]/g, ''))}
                        placeholder="966500000001" className={`${inputClass} text-left`}
                    />
                    <span className="mt-1 block text-[11px] font-bold text-slate-400">اتركه فارغاً لاستخدام الرقم الافتراضي في حساب Whatsi.</span>
                </label>
                {linked && (
                    <label className="block text-sm font-bold text-slate-700">
                        سر توقيع الـ Webhook
                        <input
                            type="password" autoComplete="off" dir="ltr" value={webhookSecret}
                            onChange={(event) => setWebhookSecret(event.target.value)}
                            placeholder={info?.hasWebhookSecret ? 'محفوظ — اكتب سراً جديداً لتغييره' : 'يظهر عند إنشاء الـ Webhook في Whatsi'}
                            className={`${inputClass} text-left`}
                        />
                    </label>
                )}
            </div>

            {linked && info?.webhookUrl && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-black text-slate-600">رابط الـ Webhook (لمتابعة حالة الرقم ووصول رسائل الحملات)</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-slate-400">أضفه من صفحة Webhooks في Whatsi مع كل الأحداث، ثم الصق «سر التوقيع» في الحقل أعلاه.</p>
                    <div className="mt-2 flex items-center gap-2">
                        <code dir="ltr" className="min-w-0 flex-1 truncate rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-700">{info.webhookUrl}</code>
                        <button type="button" onClick={copyWebhookUrl} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                            <Copy size={13} /> {copied ? 'تم النسخ' : 'نسخ'}
                        </button>
                    </div>
                    {!info.hasWebhookSecret && <p className="mt-2 text-[11px] font-bold text-amber-700">لم يُضف سر التوقيع بعد، لذلك لن تُحدَّث حالة الرقم تلقائياً.</p>}
                </div>
            )}

            {feedback?.message && (
                <p role={feedback.ok ? 'status' : 'alert'} className={`mt-4 rounded-lg border px-3 py-2 text-sm font-bold ${feedback.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                    {feedback.message}
                </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={isBusy} className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-8 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                    {isBusy ? 'جاري التحقق...' : linked ? 'حفظ' : 'ربط'}
                </button>
                {linked && (
                    <button type="button" onClick={onDisconnect} disabled={isBusy} className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-100 bg-white px-5 text-sm font-black text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-60">
                        <Unplug size={15} /> إلغاء الربط
                    </button>
                )}
            </div>
        </form>
    );
};

export default WhatsiSettings;
