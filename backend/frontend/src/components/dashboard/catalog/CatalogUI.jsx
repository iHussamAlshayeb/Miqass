import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { inputClass } from './format';

// عناصر مشتركة لصفحات الخدمات والمنتجات والمخزون


export const StatCard = ({ label, value, icon, tone = 'slate', hint }) => {
    const tones = {
        slate: 'text-slate-800',
        amber: 'text-amber-600',
        emerald: 'text-emerald-700',
        rose: 'text-rose-600',
    };
    return (
        <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                {icon && React.createElement(icon, { size: 18, className: 'text-slate-400' })}
            </div>
            <p className={`mt-1.5 text-2xl font-black ${tones[tone]}`}>{value}</p>
            {hint && <p className="mt-0.5 text-xs font-bold text-slate-400">{hint}</p>}
        </div>
    );
};

/** لوحة جانبية للنماذج، تُغلق بالخلفية أو Esc */
export const Drawer = ({ title, subtitle, onClose, children, footer }) => {
    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div className="min-w-0">
                        <h3 className="truncate text-lg font-black text-slate-800">{title}</h3>
                        {subtitle && <p className="mt-0.5 text-xs font-bold text-slate-500">{subtitle}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
                {footer && <div className="border-t border-slate-100 bg-slate-50 p-4">{footer}</div>}
            </div>
        </div>
    );
};

export const Field = ({ label, hint, children }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-black text-slate-600">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-[11px] font-bold text-slate-400">{hint}</span>}
    </label>
);

export const Toggle = ({ checked, onChange, label, description }) => (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-right">
        <span>
            <span className="block text-sm font-black text-slate-800">{label}</span>
            {description && <span className="mt-0.5 block text-[11px] font-bold text-slate-500">{description}</span>}
        </span>
        <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'right-[22px]' : 'right-0.5'}`} />
        </span>
    </button>
);

export const StatusPill = ({ active, onLabel = 'متاح', offLabel = 'موقوف' }) => (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {active ? onLabel : offLabel}
    </span>
);

/** تأكيد الحذف مع شرح ما سيحدث */
export const ConfirmDelete = ({ title, body, busy, onCancel, onConfirm }) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="alertdialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600"><AlertTriangle size={20} /></span>
                <h3 className="text-base font-black text-slate-800">{title}</h3>
            </div>
            <p className="mt-3 text-sm font-bold leading-6 text-slate-600">{body}</p>
            <div className="mt-5 flex gap-2">
                <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-lg border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50">تراجع</button>
                <button type="button" disabled={busy} onClick={onConfirm} className="h-11 flex-1 rounded-lg bg-rose-600 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50">{busy ? 'جارٍ الحذف…' : 'حذف'}</button>
            </div>
        </div>
    </div>
);

/** رسالة مؤقتة أعلى الصفحة */
export const Notice = ({ notice, onClose }) => {
    useEffect(() => {
        if (!notice?.ok) return undefined;
        const timer = setTimeout(onClose, 3500);
        return () => clearTimeout(timer);
    }, [notice, onClose]);
    if (!notice) return null;
    return (
        <div role="status" className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-black ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={onClose} aria-label="إغلاق" className="opacity-60 hover:opacity-100"><X size={16} /></button>
        </div>
    );
};

export const SearchBox = ({ value, onChange, placeholder }) => (
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} sm:max-w-xs`} />
);

export const FilterChips = ({ options, value, onChange }) => (
    <div className="flex flex-wrap gap-2">
        {options.map(([id, label, count]) => (
            <button key={id} type="button" onClick={() => onChange(id)} className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-black transition ${value === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                {label}
                {count !== undefined && <span className={`rounded-full px-1.5 ${value === id ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span>}
            </button>
        ))}
    </div>
);
