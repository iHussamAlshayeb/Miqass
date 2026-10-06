import { LockKeyhole } from 'lucide-react';

const PLAN_LABELS = { Pro: 'Pro', Premium: 'المميزة' };

// شارة موحدة لأي خيار يتطلب باقة أعلى؛ الضغط عليها يعرض تفاصيل الترقية
export const PlanBadge = ({ plan, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700 hover:bg-violet-100"
        title={`متاح في باقة ${PLAN_LABELS[plan] || plan}`}
    >
        <LockKeyhole size={11} aria-hidden="true" />
        {PLAN_LABELS[plan] || plan}
    </button>
);

// تنبيه موحد لصفحة كاملة مقفلة على الباقة الحالية
export const LockedNotice = ({ plan, text, onUpgrade }) => (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
            <LockKeyhole size={18} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm font-bold leading-7 text-violet-900">{text}</p>
        </div>
        <button type="button" onClick={onUpgrade} className="shrink-0 rounded-lg bg-violet-700 px-4 py-2 text-sm font-black text-white hover:bg-violet-800">
            الترقية إلى {PLAN_LABELS[plan] || plan}
        </button>
    </div>
);
