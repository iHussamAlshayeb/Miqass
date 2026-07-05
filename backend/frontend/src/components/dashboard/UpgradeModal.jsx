import React, { useState } from 'react';
import { CheckCircle2, Crown, LockKeyhole, TicketPercent, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from '../../services/api';

const UpgradeModal = ({ isOpen, onClose, requiredPlan, featureName, tenantId }) => {
    const navigate = useNavigate();
    const [promoCode, setPromoCode] = useState('');
    const [promoStatus, setPromoStatus] = useState({ type: '', message: '' });
    const [isVerifying, setIsVerifying] = useState(false);
    const [appliedPromo, setAppliedPromo] = useState(null);

    const handleVerifyPromo = async () => {
        if (!promoCode.trim()) return;
        setIsVerifying(true);
        setPromoStatus({ type: '', message: '' });

        try {
            const res = await API.post('/tenants/validate-promo', { code: promoCode });
            setPromoStatus({ type: 'success', message: res.data.message });
            setAppliedPromo(res.data);
        } catch (error) {
            setPromoStatus({ type: 'error', message: error.response?.data?.message || 'كود غير صالح' });
            setAppliedPromo(null);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleClose = () => {
        setPromoCode('');
        setPromoStatus({ type: '', message: '' });
        setAppliedPromo(null);
        onClose();
    };

    const goToPayment = () => {
        handleClose();
        navigate('/payment', { state: { tenantId, appliedPromo } });
    };

    if (!isOpen) return null;

    const PlanIcon = requiredPlan === 'Premium' ? Crown : LockKeyhole;
    const planLabel = requiredPlan === 'Premium' ? 'الباقة المميزة' : 'الباقة الاحترافية';

    return (
        <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
            onClick={handleClose}
        >
            <div
                className="bg-white w-full max-w-md rounded-lg p-5 shadow-2xl border border-slate-100"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                            <PlanIcon size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-400">ميزة ضمن الباقات</p>
                            <h2 className="text-lg font-black text-slate-800 mt-1">{featureName}</h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="w-9 h-9 rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
                        aria-label="إغلاق"
                    >
                        <X size={17} />
                    </button>
                </div>

                <p className="text-sm font-bold text-slate-500 leading-relaxed mt-5">
                    هذه الميزة متاحة في {planLabel} وأعلى. الترقية تفتح أدوات إضافية لإدارة الصالون والعمليات اليومية.
                </p>

                <div className="bg-slate-50 rounded-lg p-4 mt-5 border border-slate-100">
                    <p className="text-xs font-black text-slate-500 mb-3">ما الذي ستحصل عليه؟</p>
                    <ul className="space-y-2 text-sm font-bold text-slate-600">
                        <li className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            توفير وقت الإدارة والمتابعة.
                        </li>
                        <li className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            زيادة ولاء العملاء وعودتهم.
                        </li>
                        <li className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            أتمتة مهام الصالون المتكررة.
                        </li>
                    </ul>
                </div>

                <div className="mt-5 border border-slate-100 rounded-lg p-3">
                    <label className="flex items-center gap-2 text-xs font-black text-slate-500 mb-2">
                        <TicketPercent size={15} />
                        كود خصم اختياري
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleVerifyPromo}
                            disabled={isVerifying || !promoCode || appliedPromo}
                            className={`px-4 rounded-lg font-black text-xs transition-colors ${appliedPromo ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50'}`}
                        >
                            {isVerifying ? 'جاري التحقق' : appliedPromo ? 'مطبق' : 'تطبيق'}
                        </button>
                        <input
                            type="text"
                            placeholder="PROMO"
                            value={promoCode}
                            onChange={(event) => {
                                setPromoCode(event.target.value.toUpperCase());
                                setPromoStatus({ type: '', message: '' });
                                setAppliedPromo(null);
                            }}
                            disabled={appliedPromo}
                            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400 text-center tracking-widest uppercase text-sm disabled:opacity-90 disabled:bg-emerald-50/50 disabled:text-emerald-700 disabled:border-emerald-200"
                            dir="ltr"
                        />
                    </div>
                    {promoStatus.message && (
                        <p className={`mt-2 text-xs font-bold ${promoStatus.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {promoStatus.message}
                        </p>
                    )}
                </div>

                <div className="flex gap-3 mt-5">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex-1 bg-slate-100 text-slate-600 font-black py-3 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                        لاحقاً
                    </button>
                    <button
                        type="button"
                        onClick={goToPayment}
                        className="flex-[2] bg-slate-900 text-white font-black py-3 rounded-lg hover:bg-slate-700 active:scale-95 transition-all"
                    >
                        ترقية الباقة
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;
