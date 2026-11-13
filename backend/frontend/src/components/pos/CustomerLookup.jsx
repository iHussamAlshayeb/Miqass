import React, { useEffect, useRef, useState } from 'react';
import { Check, Search, UserRound, X } from 'lucide-react';
import API from '../../services/api';

const TYPE_LABELS = { VIP: 'مميز', Regular: 'دائم', New: 'جديد', Blacklisted: 'محظور' };

const formatVisitDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' });
};

const displayName = (match) => match.name || match.children?.[0] || 'عميل بدون اسم';

/**
 * عميل الفاتورة: يُكتب رقم الجوال فتظهر العملاء المطابقون فوراً، والضغط على أحدهم يعبّئ بياناته.
 * أسماء الأطفال المحفوظة تظهر كأزرار لاختيار اسم صاحب الخدمة مباشرة.
 */
const CustomerLookup = ({ customer, onChange, onDone }) => {
    const [matches, setMatches] = useState([]);
    const [selected, setSelected] = useState(null);
    const [searching, setSearching] = useState(false);
    const phoneRef = useRef(null);
    const digits = customer.phone.replace(/\D/g, '');

    useEffect(() => { phoneRef.current?.focus(); }, []);

    // بحث أثناء الكتابة بعد توقف قصير، ويتوقف بعد اختيار عميل حتى يتغير الرقم
    useEffect(() => {
        if (selected && selected.phone === customer.phone) return undefined;
        if (digits.length < 3) {
            setMatches([]);
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            setSearching(true);
            API.get('/pos/customers', { params: { q: digits } })
                .then((res) => {
                    if (cancelled) return;
                    const found = res.data.customers || [];
                    setMatches(found);
                    // رقم كامل يطابق عميلاً واحداً: يُختار تلقائياً
                    const exact = found.find((match) => match.phone === digits);
                    if (exact && digits.length >= 10) pick(exact);
                })
                .catch(() => { if (!cancelled) setMatches([]); })
                .finally(() => { if (!cancelled) setSearching(false); });
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
        // pick ثابتة المنطق؛ لا نعيد البحث عند تغيرها
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digits, selected]);

    const pick = (match) => {
        setSelected(match);
        setMatches([]);
        onChange({ phone: match.phone, name: match.children?.length === 1 ? match.children[0] : match.name || match.children?.[0] || '' });
    };

    const clear = () => {
        setSelected(null);
        setMatches([]);
        onChange({ name: '', phone: '' });
        phoneRef.current?.focus();
    };

    return (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="relative">
                <label className="flex h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-slate-900">
                    <Search size={18} className="shrink-0 text-slate-400" />
                    <input
                        ref={phoneRef}
                        value={customer.phone}
                        onChange={(event) => {
                            const phone = event.target.value.replace(/[^\d+]/g, '');
                            if (selected && phone !== selected.phone) setSelected(null);
                            onChange({ ...customer, phone });
                        }}
                        inputMode="tel"
                        maxLength={15}
                        placeholder="رقم الجوال"
                        dir="ltr"
                        className="h-full min-w-0 flex-1 bg-transparent text-right font-mono text-base font-semibold outline-none"
                        aria-label="رقم جوال العميل"
                    />
                    {searching && <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-slate-400" />}
                    {customer.phone && (
                        <button type="button" onClick={clear} className="p-1 text-slate-400" aria-label="مسح العميل"><X size={18} /></button>
                    )}
                </label>

                {matches.length > 0 && (
                    <div className="absolute inset-x-0 top-[52px] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                        {matches.map((match) => (
                            <button key={match._id} type="button" onClick={() => pick(match)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-right last:border-0 active:bg-slate-50">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UserRound size={18} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-bold text-slate-800">{displayName(match)}</span>
                                    <span className="block font-mono text-xs text-slate-500" dir="ltr">{match.phone}</span>
                                </span>
                                <span className="shrink-0 text-xs font-bold text-slate-500">{match.totalVisits} زيارة</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected && (
                <div className="mt-2 rounded-lg border border-sky-100 bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
                        <span className="text-sky-700">عميل مسجل · {TYPE_LABELS[selected.customerType] || 'جديد'}</span>
                        <span>{selected.totalVisits} زيارة{selected.lastVisitDate ? ` · آخرها ${formatVisitDate(selected.lastVisitDate)}` : ''}</span>
                    </div>
                    {selected.children?.length > 1 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {selected.children.map((child) => (
                                <button key={child} type="button" onClick={() => onChange({ ...customer, name: child })} className={`h-9 rounded-full border px-3 text-sm font-bold ${customer.name === child ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700'}`}>
                                    {child}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-2 flex gap-2">
                <input
                    value={customer.name}
                    onChange={(event) => onChange({ ...customer, name: event.target.value })}
                    maxLength={100}
                    placeholder="اسم العميل"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-slate-900"
                />
                <button type="button" onClick={onDone} className="flex h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-4 font-bold text-white">
                    <Check size={18} /> تم
                </button>
            </div>
        </div>
    );
};

export default CustomerLookup;
