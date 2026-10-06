import {
    CheckCircle2,
    MessageCircle,
    Plug,
    Save,
    Smartphone,
    Unplug,
} from 'lucide-react';
import WhatsiSettings from './WhatsiSettings';
import { LockedNotice } from './PlanBadge';

const PROVIDER_LABELS = { wasender: 'WaSender', whatsi: 'Whatsi' };


const IntegrationsSection = ({
    currentPlan,
    handleConnectWhatsapp,
    handleDisconnectWhatsapp,
    isWaLoading,
    qrCode,
    whatsiInfo,
    handleSaveWhatsi,
    waProvider,
    waProviders = [],
    selectedWaProvider,
    setSelectedWaProvider,
    setUpsellConfig,
    waStatus,
}) => (
    <section className="bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100">
        {currentPlan === 'Free' ? (
            <LockedNotice
                plan="Pro"
                text="ربط واتساب لإرسال التأكيد والتذكير وبقية الرسائل للعملاء تلقائياً متاح في باقة Pro."
                onUpgrade={() => setUpsellConfig({ isOpen: true, featureName: 'الواتساب الآلي (تأكيد وتذكير)', requiredPlan: 'Pro' })}
            />
        ) : (
            (() => {
                const currentStatus = waStatus?.toUpperCase() || 'DISCONNECTED';
                if (waProvider === 'whatsi' && whatsiInfo) {
                    return (
                        <WhatsiSettings
                            key={`linked-${whatsiInfo.from}`}
                            linked
                            info={whatsiInfo}
                            onSave={handleSaveWhatsi}
                            onDisconnect={handleDisconnectWhatsapp}
                            isBusy={isWaLoading}
                        />
                    );
                }
                if (currentStatus === 'WORKING' || currentStatus === 'CONNECTED') {
                    return (
                        <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-lg text-center flex flex-col items-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-4 shadow-inner ring-4 ring-white">
                                <CheckCircle2 size={28} />
                            </div>
                            <h3 className="font-black text-emerald-800 text-xl mb-1">الواتساب متصل ويعمل بنجاح!</h3>
                            <p className="text-xs font-bold text-emerald-600/80 mb-6">النظام الآن يرسل التنبيهات لعملائك آلياً{PROVIDER_LABELS[waProvider] ? ` عبر ${PROVIDER_LABELS[waProvider]}` : ''}.</p>
                            <button onClick={handleDisconnectWhatsapp} disabled={isWaLoading} className="bg-white border border-red-100 text-red-500 hover:bg-red-500 hover:text-white font-black px-8 py-3 rounded-lg transition-all text-sm shadow-sm inline-flex items-center gap-2">
                                <Unplug size={15} />
                                إلغاء الربط مؤقتاً
                            </button>
                        </div>
                    );
                }
                if (['CREATED', 'STARTING', 'NEED_SCAN', 'SCAN_QR_CODE', 'CONNECTING'].includes(currentStatus) || qrCode) {
                    return (
                        <div className="bg-slate-50 border border-slate-200 p-8 rounded-lg text-center flex flex-col items-center">
                            <div className="w-11 h-11 bg-white border border-slate-100 text-slate-600 rounded-lg flex items-center justify-center mb-3">
                                <Smartphone size={20} />
                            </div>
                            <h3 className="font-black text-slate-800 text-lg mb-2">افتح واتساب في جوالك وامسح الكود</h3>
                            <p className="text-xs font-bold text-slate-500 mb-6">اذهب إلى الإعدادات، الأجهزة المرتبطة، ثم ربط جهاز.</p>
                            <div className="bg-white p-4 rounded-lg shadow-md border border-slate-100 mb-6 w-64 h-64 flex items-center justify-center relative">
                                {currentStatus === 'CONNECTING' ? (
                                    <div className="animate-pulse flex flex-col items-center"><div className="border-4 border-slate-200 border-t-emerald-500 rounded-full w-12 h-12 animate-spin mb-3" /><p className="text-sm font-black text-emerald-600">جاري إتمام الاتصال...</p></div>
                                ) : qrCode ? (
                                    <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain rounded-lg" />
                                ) : (
                                    <div className="animate-pulse flex flex-col items-center"><div className="border-4 border-slate-200 border-t-blue-500 rounded-full w-12 h-12 animate-spin mb-3" /><p className="text-sm font-black text-slate-500">جاري توليد الكود...</p></div>
                                )}
                            </div>
                            <button onClick={handleDisconnectWhatsapp} className="text-slate-400 hover:text-red-500 font-bold text-xs underline decoration-dotted underline-offset-4">إلغاء العملية</button>
                        </div>
                    );
                }
                return (
                    <div className="bg-slate-50 border border-slate-200 p-10 rounded-lg text-center flex flex-col items-center">
                        <div className="w-16 h-16 bg-white text-slate-400 rounded-lg flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                            <Plug size={26} />
                        </div>
                        <h3 className="font-black text-slate-800 text-xl mb-2">رقم الواتساب غير مربوط</h3>
                        <p className="text-xs font-bold text-slate-500 mb-6">اربط جوال الصالون لتمكين إرسال الفواتير والتنبيهات للعملاء آلياً.</p>
                        {waProviders.length > 1 && (
                            <fieldset className="mb-6 w-full max-w-sm">
                                <legend className="mb-2 text-xs font-black text-slate-600">وسيط الواتساب</legend>
                                <div className="grid grid-cols-2 gap-2">
                                    {waProviders.map((provider) => (
                                        <label key={provider.id} className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-black transition-colors ${selectedWaProvider === provider.id ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                            <input type="radio" name="wa-provider" value={provider.id} checked={selectedWaProvider === provider.id} onChange={() => setSelectedWaProvider(provider.id)} className="sr-only" />
                                            {provider.name}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        )}
                        {selectedWaProvider === 'whatsi' ? (
                            <div className="w-full max-w-2xl">
                                <WhatsiSettings linked={false} info={null} onSave={handleSaveWhatsi} onDisconnect={handleDisconnectWhatsapp} isBusy={isWaLoading} />
                            </div>
                        ) : (
                        <button onClick={handleConnectWhatsapp} disabled={isWaLoading} className="bg-emerald-600 text-white font-black px-10 py-4 rounded-lg hover:bg-emerald-700 active:scale-95 transition-all text-sm shadow-lg shadow-emerald-600/30 inline-flex items-center gap-2">
                            <MessageCircle size={16} />
                            {isWaLoading ? 'جاري تجهيز السيرفر...' : 'بدء ربط الواتساب'}
                        </button>
                        )}
                    </div>
                );
            })()
        )}
    </section>
);

export default IntegrationsSection;
