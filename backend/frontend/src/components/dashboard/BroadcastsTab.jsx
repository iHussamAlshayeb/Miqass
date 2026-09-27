import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Eye, Megaphone, RefreshCw, Send, ShieldCheck, UserRoundCheck, Users } from 'lucide-react';
import API from '../../services/api';

const audienceOptions = [
    {
        value: 'all',
        title: 'كل العملاء',
        description: 'إرسال لجميع العملاء المسجلين.',
        icon: Users,
    },
    {
        value: 'inactive_30',
        title: 'المنقطعين',
        description: 'لم يزوروا الصالون منذ أكثر من 30 يوماً.',
        icon: ShieldCheck,
    },
    {
        value: 'vip',
        title: 'العملاء المميزون',
        description: 'زاروا الصالون 3 مرات أو أكثر.',
        icon: UserRoundCheck,
    },
];

const campaignStatusDetails = {
    Pending: { label: 'في الانتظار', className: 'bg-amber-50 text-amber-700 border-amber-100' },
    Processing: { label: 'قيد الإرسال', className: 'bg-blue-50 text-blue-700 border-blue-100' },
    Paused: { label: 'متوقفة مؤقتاً', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    Completed: { label: 'مكتملة', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    Completed_With_Errors: { label: 'اكتملت مع ملاحظات', className: 'bg-orange-50 text-orange-700 border-orange-100' },
    Failed: { label: 'متوقفة', className: 'bg-red-50 text-red-700 border-red-100' },
};

const audienceLabels = {
    all: 'كل العملاء',
    inactive_30: 'المنقطعون',
    vip: 'العملاء المميزون',
};

const BroadcastsTab = ({ tenantId }) => {
    const [message, setMessage] = useState('');
    const [targetAudience, setTargetAudience] = useState('all');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingAudienceCounts, setIsLoadingAudienceCounts] = useState(true);
    const [audienceCounts, setAudienceCounts] = useState({
        all: null,
        inactive_30: null,
        vip: null,
    });
    const [campaigns, setCampaigns] = useState([]);
    const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
    const [campaignRefreshKey, setCampaignRefreshKey] = useState(0);
    const [resumingCampaignId, setResumingCampaignId] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        let isMounted = true;

        const fetchAudienceCounts = async () => {
            setIsLoadingAudienceCounts(true);

            try {
                const res = await API.get('/appointments/broadcast/audience-counts');
                if (isMounted) setAudienceCounts(res.data.counts || {});
            } catch (error) {
                console.error('Error fetching broadcast audience counts:', error);
            } finally {
                if (isMounted) setIsLoadingAudienceCounts(false);
            }
        };

        fetchAudienceCounts();

        return () => {
            isMounted = false;
        };
    }, [tenantId]);

    useEffect(() => {
        let isMounted = true;

        const fetchCampaigns = async (showLoading = false) => {
            if (showLoading) setIsLoadingCampaigns(true);

            try {
                const res = await API.get('/appointments/broadcast/campaigns');
                if (isMounted) setCampaigns(res.data.campaigns || []);
            } catch (error) {
                if (isMounted) console.error('Error fetching campaigns:', error);
            } finally {
                if (isMounted) setIsLoadingCampaigns(false);
            }
        };

        fetchCampaigns(true);
        const intervalId = window.setInterval(() => fetchCampaigns(false), 10000);

        return () => {
            isMounted = false;
            window.clearInterval(intervalId);
        };
    }, [campaignRefreshKey, tenantId]);

    const handleResumeCampaign = async (campaignId) => {
        setResumingCampaignId(campaignId);
        setErrorMsg('');

        try {
            const res = await API.post(`/appointments/broadcast/campaigns/${campaignId}/resume`);
            setSuccessMsg(res.data.message);
            setCampaignRefreshKey((value) => value + 1);
        } catch (error) {
            setErrorMsg(error.response?.data?.message || 'تعذر استكمال الحملة.');
        } finally {
            setResumingCampaignId(null);
        }
    };

    const insertVariable = (variable) => {
        setMessage((prev) => `${prev}${variable} `);
    };

    const handleSendBroadcast = async (event) => {
        event.preventDefault();

        if (!message.trim()) {
            setErrorMsg('الرجاء كتابة نص الرسالة.');
            return;
        }

        if (!message.includes('[الاسم]')) {
            const confirmNoName = window.confirm('رسالتك لا تحتوي على متغير [الاسم]. إضافة اسم العميل يقلل فرصة الحظر. هل تريد الإرسال بدون الاسم؟');
            if (!confirmNoName) return;
        }

        setIsSending(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            const res = await API.post('/appointments/broadcast', {
                tenantId,
                message,
                targetAudience,
            });

            setSuccessMsg(`تم إدراج الحملة بنجاح. سيتم إرسالها إلى ${res.data.targetCount} عميل بشكل تدريجي.`);
            setMessage('');
            setCampaignRefreshKey((value) => value + 1);
        } catch (error) {
            setErrorMsg(error.response?.data?.message || 'حدث خطأ أثناء جدولة الحملة.');
        } finally {
            setIsSending(false);
        }
    };

    const hasActiveCampaign = campaigns.some((campaign) => ['Pending', 'Processing'].includes(campaign.status));

    return (
        <div className="space-y-6">
            <section className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-5 gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2 text-slate-500 mb-2">
                            <Megaphone size={18} />
                            <span className="text-xs font-black">حملات العملاء</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-800">منشئ حملات الواتساب</h2>
                        <p className="text-slate-500 font-bold text-sm mt-1">
                            أرسل عروضك للعملاء مع جدولة تدريجية تقلل مخاطر الحظر.
                        </p>
                    </div>
                    <span className="bg-purple-50 text-purple-700 px-3 py-2 rounded-lg font-black text-xs border border-purple-100">
                        Premium
                    </span>
                </div>

                <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg mb-6 flex gap-3 items-start">
                    <ShieldCheck size={20} className="text-amber-700 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-black text-amber-900 text-sm mb-1">حماية رقم الواتساب</h4>
                        <p className="text-xs font-bold text-amber-800/80 leading-relaxed">
                            يتم إرسال الرسائل تدريجياً. يمكنك تخصيص الرسالة بمتغيري [الاسم] و[رقم الجوال]، ولا ترسل أكثر من حملة واحدة أسبوعياً.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSendBroadcast} className="space-y-6">
                    <div>
                        <label className="block text-sm font-black text-slate-700 mb-3">الجمهور المستهدف</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {audienceOptions.map((option) => {
                                const Icon = option.icon;
                                const isActive = targetAudience === option.value;

                                return (
                                    <label
                                        key={option.value}
                                        className={`cursor-pointer p-4 rounded-lg border transition-all ${isActive ? 'border-purple-300 bg-purple-50 shadow-sm' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
                                    >
                                        <input
                                            type="radio"
                                            name="audience"
                                            value={option.value}
                                            checked={isActive}
                                            onChange={() => setTargetAudience(option.value)}
                                            className="hidden"
                                        />
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                            <div className="flex items-center gap-2 font-black text-slate-800">
                                                <Icon size={17} className={isActive ? 'text-purple-700' : 'text-slate-500'} />
                                                {option.title}
                                            </div>
                                            <span className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-black ${isActive ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                {isLoadingAudienceCounts
                                                    ? '...'
                                                    : `${Number(audienceCounts[option.value] || 0).toLocaleString('ar-SA')} عميل`}
                                            </span>
                                        </div>
                                        <div className="text-xs font-bold text-slate-500 leading-relaxed">{option.description}</div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-2 gap-3">
                            <label className="block text-sm font-black text-slate-700">نص الرسالة</label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => insertVariable('[الاسم]')}
                                    className="text-xs bg-purple-50 hover:bg-purple-100 border border-purple-100 text-purple-700 font-black px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                >
                                    + إدراج [الاسم]
                                </button>
                                <button
                                    type="button"
                                    onClick={() => insertVariable('[رقم الجوال]')}
                                    className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 font-black px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                >
                                    + إدراج [رقم الجوال]
                                </button>
                            </div>
                        </div>
                        <textarea
                            required
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            rows="6"
                            placeholder="مثال: أهلاً [الاسم]، رقمك المسجل لدينا هو [رقم الجوال]..."
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white transition-all text-sm font-bold text-slate-700 resize-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                        />

                        {message && (
                            <div className="mt-3 bg-emerald-50/50 border border-emerald-100 p-4 rounded-lg text-xs font-bold text-slate-600 shadow-sm">
                                <span className="text-emerald-700 font-black mb-2 flex items-center gap-1">
                                    <Eye size={14} />
                                    معاينة للعميل محمد
                                </span>
                                <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
                                    {message
                                        .replace(/\[الاسم\]/g, 'محمد')
                                        .replace(/\[رقم الجوال\]/g, '0501234567')}
                                </p>
                            </div>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs font-bold text-center border border-red-100">
                            {errorMsg}
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg text-sm font-black text-center leading-relaxed border border-emerald-100">
                            {successMsg}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSending || hasActiveCampaign}
                        className="w-full bg-purple-600 text-white font-black py-4 rounded-lg hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <Send size={17} />
                        {isSending
                            ? 'جاري تجهيز الحملة...'
                            : hasActiveCampaign
                                ? 'توجد حملة قيد الإرسال'
                                : 'إطلاق الحملة التسويقية'}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <h3 className="text-base font-black text-slate-800">الحملات الأخيرة</h3>
                            <p className="text-xs font-bold text-slate-500 mt-1">متابعة الإرسال والاستكمال</p>
                        </div>
                        <RefreshCw size={18} className={`text-slate-400 ${isLoadingCampaigns ? 'animate-spin' : ''}`} />
                    </div>

                    {isLoadingCampaigns && campaigns.length === 0 ? (
                        <div className="py-8 text-center text-sm font-bold text-slate-400">جاري تحميل الحملات...</div>
                    ) : campaigns.length === 0 ? (
                        <div className="py-8 text-center text-sm font-bold text-slate-400 border-t border-dashed border-slate-200">
                            لم يتم إطلاق حملات حتى الآن.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 border-t border-slate-100">
                            {campaigns.map((campaign) => {
                                const statusDetails = campaignStatusDetails[campaign.status] || campaignStatusDetails.Pending;
                                const canResume = campaign.failedCount > 0 || ['Paused', 'Failed'].includes(campaign.status);

                                return (
                                    <div key={campaign._id} className="py-5 space-y-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                                                    {campaign.status === 'Completed' ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-black text-sm text-slate-800">{audienceLabels[campaign.targetAudience] || 'حملة عملاء'}</div>
                                                    <div className="text-[11px] font-bold text-slate-400 mt-1">
                                                        {new Date(campaign.createdAt).toLocaleString('ar-SA')}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={`self-start sm:self-auto px-3 py-1.5 rounded-lg border text-xs font-black ${statusDetails.className}`}>
                                                {statusDetails.label}
                                            </span>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between text-[11px] font-black text-slate-500 mb-1.5">
                                                <span>{Number(campaign.progressPercent || 0).toLocaleString('ar-SA')}٪</span>
                                                <span>{Number(campaign.totalCount || 0).toLocaleString('ar-SA')} مستلم</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                                    style={{ width: `${Math.min(Number(campaign.progressPercent || 0), 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                                            <span className="text-emerald-700">تم: {Number(campaign.sentCount || 0).toLocaleString('ar-SA')}</span>
                                            <span className="text-blue-700">متبقي: {Number(campaign.pendingCount || 0).toLocaleString('ar-SA')}</span>
                                            <span className="text-red-600">فشل: {Number(campaign.failedCount || 0).toLocaleString('ar-SA')}</span>
                                            <span className="text-orange-600">غير مؤكد: {Number(campaign.uncertainCount || 0).toLocaleString('ar-SA')}</span>
                                        </div>

                                        {campaign.uncertainCount > 0 && (
                                            <div className="flex items-start gap-2 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-100 p-3 rounded-lg">
                                                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                                توجد رسائل انقطع الاتصال أثناء إرسالها؛ لم تُكرر تلقائياً لحماية العملاء من الاستلام المزدوج.
                                            </div>
                                        )}

                                        {canResume && (
                                            <button
                                                type="button"
                                                onClick={() => handleResumeCampaign(campaign._id)}
                                                disabled={resumingCampaignId === campaign._id || hasActiveCampaign}
                                                className="inline-flex items-center gap-2 text-xs font-black text-blue-700 hover:text-blue-800 disabled:opacity-50"
                                            >
                                                <RefreshCw size={14} className={resumingCampaignId === campaign._id ? 'animate-spin' : ''} />
                                                استكمال الرسائل الفاشلة
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default BroadcastsTab;
