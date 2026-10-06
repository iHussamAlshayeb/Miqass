import {
    CalendarDays,
    Clock3,
    Plus,
    RotateCcw,
    Scissors,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { PlanBadge } from './PlanBadge';
import { WEEKDAY_OPTIONS, LEAVE_TYPE_OPTIONS, formatLeaveDate } from './barberLeaveOptions';

// 4. قسم قائمة الخدمات والطاقم
const TeamSection = ({
    part = 'all',
    settings,
    barbers,
    setBarbers,
    services,
    themeColors,
    currentPlan,
    handleAddBarber,
    handleAddBarberLeave,
    handleAddService,
    handleRemoveBarberLeave,
    handleRemoveService,
    handleServiceChange,
    leaveDrafts,
    newBarberName,
    newBarberPin,
    setNewBarberName,
    setNewBarberPin,
    setUpsellConfig,
    updateLeaveDraft,
}) => {
    const [editingIndex, setEditingIndex] = useState(null);
    const onClose = () => setEditingIndex(null);

    // محرر الحلاق: نفس الحقول السابقة، تُعرض في لوحة جانبية لحلاق واحد
    const renderBarberEditor = (barber, index) => {
            const bName = typeof barber === 'string' ? barber : barber.name;
            const bPin = typeof barber === 'string'
                ? settings?.barberPins?.find(b => b.name === bName)?.pin || ''
                : barber.pin || '';
            const isActive = typeof barber === 'string' ? true : (barber.isActive !== false);
            const iconColor = typeof barber === 'string' ? '' : (barber.iconColor || '');
            const leaves = typeof barber === 'string' ? [] : (barber.leaves || []);
            const leaveDraft = leaveDrafts[index] || {
                type: 'daily',
                startDate: '',
                endDate: '',
                weekday: 0,
            };

            return (
                <div key={barber?._id || index} className={`rounded-lg border transition-all ${isActive ? 'bg-white border-emerald-100 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                    <div className={`grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 ${isActive ? '' : 'opacity-75'}`}>
                        <div className="flex-1 w-full">
                            <label className="text-[10px] font-black text-slate-400 block mb-1">اسم الحلاق</label>
                            <input
                                type="text"
                                value={bName}
                                onChange={(e) => {
                                    const updated = [...barbers];
                                    if (typeof updated[index] === 'string') {
                                        updated[index] = { name: e.target.value, pin: bPin, isActive, leaves };
                                    } else {
                                        updated[index] = { ...updated[index], name: e.target.value };
                                    }
                                    setBarbers(updated);
                                }}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:border-emerald-400 text-sm"
                            />
                        </div>

                        {currentPlan === 'Premium' && (
                            <div className="w-full">
                                <label className="text-[10px] font-black text-slate-400 block mb-1">رمز الدخول (PIN)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    maxLength="8"
                                    placeholder={barber?.hasPin ? '•••• محفوظ' : 'بدون رمز'}
                                    value={bPin}
                                    onChange={(e) => {
                                        const updated = [...barbers];
                                        if (typeof updated[index] === 'string') {
                                            updated[index] = { name: bName, pin: e.target.value.replace(/\D/g, ''), isActive, leaves };
                                        } else {
                                            updated[index] = { ...updated[index], pin: e.target.value.replace(/\D/g, '') };
                                        }
                                        setBarbers(updated);
                                    }}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-emerald-400 text-sm text-center tracking-widest"
                                    dir="ltr"
                                />
                                {barber?.hasPin && !bPin && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = [...barbers];
                                            updated[index] = { ...updated[index], hasPin: false, clearPin: true };
                                            setBarbers(updated);
                                        }}
                                        className="text-[10px] font-black text-rose-500 hover:text-rose-600 mt-1"
                                    >
                                        إزالة الرمز
                                    </button>
                                )}
                                {barber?.clearPin && !bPin && (
                                    <p className="text-[10px] font-bold text-rose-500 mt-1">سيُزال الرمز عند الحفظ</p>
                                )}
                            </div>
                        )}

                        <div className="flex items-center justify-between w-full bg-slate-100/50 p-2.5 rounded-lg border border-slate-100 mt-1 md:mt-0">
                            <span className={`text-[10px] font-black transition-colors ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {isActive ? 'متاح' : 'متوقف'}
                            </span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={isActive}
                                    onChange={(e) => {
                                        const updated = [...barbers];
                                        if (typeof updated[index] === 'string') {
                                            updated[index] = { name: bName, pin: bPin, isActive: e.target.checked, leaves };
                                        } else {
                                            updated[index] = { ...updated[index], isActive: e.target.checked };
                                        }
                                        setBarbers(updated);
                                    }}
                                />
                                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>

                        {barbers.length > 1 && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm(`هل أنت متأكد من حذف الحلاق "${bName}" نهائياً؟`)) {
                                        setBarbers(barbers.filter((_, i) => i !== index));
                                    onClose();
                                    }
                                }}
                                className="text-red-500 hover:bg-red-50 p-3 rounded-lg transition-colors w-full md:w-auto inline-flex justify-center"
                                title="حذف الحلاق"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>

                    <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-3">
                        <div>
                            <label htmlFor={`barber-icon-color-${index}`} className="text-xs font-black text-slate-700">لون أيقونة الحلاق</label>
                            <p className="text-[10px] font-bold text-slate-400">يظهر في صفحة الحجز</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {iconColor && (
                                <button
                                    type="button"
                                    onClick={() => setBarbers((current) => current.map((item, itemIndex) => itemIndex === index
                                        ? { ...(typeof item === 'string' ? { name: item, pin: bPin, isActive, leaves } : item), iconColor: '' }
                                        : item))}
                                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                                    title="إعادة اللون الافتراضي"
                                    aria-label={`إعادة لون أيقونة ${bName} الافتراضي`}
                                >
                                    <RotateCcw size={16} />
                                </button>
                            )}
                            <input
                                id={`barber-icon-color-${index}`}
                                type="color"
                                value={iconColor || (index % 2 === 0 ? themeColors?.primaryColor : themeColors?.secondaryColor) || '#3b82f6'}
                                onChange={(event) => setBarbers((current) => current.map((item, itemIndex) => itemIndex === index
                                    ? { ...(typeof item === 'string' ? { name: item, pin: bPin, isActive, leaves } : item), iconColor: event.target.value }
                                    : item))}
                                className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent p-0"
                                aria-label={`لون أيقونة ${bName}`}
                            />
                        </div>
                    </div>

                    <div className="border-t border-slate-100 p-5">
                        <div className="flex items-center gap-2 mb-3 text-slate-700">
                            <CalendarDays size={17} />
                            <h5 className="text-sm font-black">إجازات الحلاق</h5>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <select
                                value={leaveDraft.type}
                                onChange={(event) => updateLeaveDraft(index, 'type', event.target.value)}
                                className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-700 outline-none focus:border-emerald-400"
                            >
                                {LEAVE_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            {leaveDraft.type === 'daily' && (
                                <select
                                    value={leaveDraft.weekday}
                                    onChange={(event) => updateLeaveDraft(index, 'weekday', Number(event.target.value))}
                                    className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-700 outline-none focus:border-emerald-400"
                                    aria-label="يوم الأسبوع"
                                >
                                    {WEEKDAY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            )}
                            <input
                                type="date"
                                value={leaveDraft.startDate}
                                onChange={(event) => updateLeaveDraft(index, 'startDate', event.target.value)}
                                className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                                aria-label={leaveDraft.type === 'daily' ? 'بداية فترة التكرار' : 'تاريخ بداية الإجازة'}
                            />
                            {leaveDraft.type === 'daily' && (
                                <input
                                    type="date"
                                    min={leaveDraft.startDate || undefined}
                                    value={leaveDraft.endDate}
                                    onChange={(event) => updateLeaveDraft(index, 'endDate', event.target.value)}
                                    className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                                    aria-label="نهاية فترة التكرار"
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => handleAddBarberLeave(index)}
                                className="h-11 px-4 rounded-lg bg-slate-900 text-white text-sm font-black hover:bg-slate-700 inline-flex items-center justify-center gap-2 sm:col-span-2"
                            >
                                <Plus size={17} />
                                إضافة
                            </button>
                        </div>

                        {leaves.length > 0 && (
                            <div className="mt-3 divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                                {leaves.map((leave, leaveIndex) => {
                                    const typeLabel = LEAVE_TYPE_OPTIONS.find((option) => option.value === leave.type)?.label || 'إجازة';
                                    const weekdayLabel = WEEKDAY_OPTIONS.find((option) => option.value === Number(leave.weekday))?.label;
                                    return (
                                        <div key={`${leave.type}-${leave.startDate}-${leaveIndex}`} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white">
                                            <div className="min-w-0">
                                                <span className="text-xs font-black text-slate-700">
                                                    {weekdayLabel ? `${weekdayLabel} أسبوعيًا` : typeLabel}
                                                </span>
                                                <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                                    {formatLeaveDate(leave.startDate)} إلى {formatLeaveDate(leave.endDate)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveBarberLeave(index, leaveIndex)}
                                                className="w-9 h-9 shrink-0 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                                                title="حذف الإجازة"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            );
    };

    const editingBarber = editingIndex !== null ? barbers?.[editingIndex] : null;

    return (
    <section className="bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100">
        {/* إدارة الطاقم */}
        {part !== 'services' && (
        <div>

            <div className="flex flex-col md:flex-row gap-3 mb-6 p-4 bg-white rounded-lg border border-slate-200">
                <input type="text" value={newBarberName} onChange={(e) => setNewBarberName(e.target.value)} placeholder="اسم الحلاق الجديد (مثال: محمد)" className="flex-1 p-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-slate-800 outline-none focus:border-emerald-400 text-sm" />
                <div className="relative w-full md:w-40 group" onClick={() => { if (currentPlan !== 'Premium') setUpsellConfig({ isOpen: true, featureName: 'صلاحيات دخول الطاقم', requiredPlan: 'Premium' }); }}>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength="8"
                        disabled={currentPlan !== 'Premium'}
                        value={newBarberPin}
                        onChange={(e) => setNewBarberPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="PIN (اختياري)"
                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-slate-800 outline-none focus:border-emerald-400 text-center tracking-[0.3em] disabled:opacity-50 text-sm"
                    />
                    {currentPlan !== 'Premium' && <span className="absolute left-2 top-1/2 -translate-y-1/2"><PlanBadge plan="Premium" onClick={() => setUpsellConfig({ isOpen: true, featureName: 'بوابة الحلاقين الخاصة (PIN)', requiredPlan: 'Premium' })} /></span>}
                </div>
                <button type="button" onClick={handleAddBarber} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
                    <Plus size={16} /> إضافة حلاق
                </button>
            </div>

            <div className="divide-y divide-slate-100">
                {barbers?.map((barber, index) => {
                    const bName = typeof barber === 'string' ? barber : barber.name;
                    const isActive = typeof barber === 'string' ? true : (barber.isActive !== false);
                    const iconColor = (typeof barber === 'string' ? '' : barber.iconColor) || (index % 2 === 0 ? themeColors?.primaryColor : themeColors?.secondaryColor) || '#3b82f6';
                    const leavesCount = typeof barber === 'string' ? 0 : (barber.leaves || []).length;
                    const hasPin = typeof barber !== 'string' && (barber.hasPin || barber.pin);
                    return (
                        <div key={barber?._id || index} className="flex items-center gap-3 py-3">
                            <span className="h-9 w-9 shrink-0 rounded-lg border border-slate-200" style={{ backgroundColor: iconColor }} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-black text-slate-800">{bName || 'بدون اسم'}</p>
                                <p className="mt-0.5 text-xs font-bold text-slate-500">
                                    <span className={isActive ? 'text-emerald-700' : 'text-slate-400'}>{isActive ? 'متاح للحجز' : 'متوقف'}</span>
                                    {currentPlan === 'Premium' && <span>{hasPin ? '، له رمز دخول' : '، بدون رمز دخول'}</span>}
                                    {leavesCount > 0 && <span>{`، ${leavesCount} ${leavesCount === 1 ? 'إجازة' : 'إجازات'}`}</span>}
                                </p>
                            </div>
                            <button type="button" onClick={() => setEditingIndex(index)} className="shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
                                تعديل
                            </button>
                        </div>
                    );
                })}
                {barbers?.length === 0 && (
                    <div className="text-center p-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-bold text-sm">لم تقم بإضافة أي حلاق بعد.</p>
                    </div>
                )}
            </div>
        </div>
        )}

        {/* قائمة الخدمات */}
        {part !== 'barbers' && (
        <div>
            <div className="flex justify-between items-center mb-4">
                <div>
                    <label className="block text-sm font-black text-slate-800">قائمة الخدمات والأسعار</label>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">لحساب الفاتورة بدقة، قم بإضافة خدماتك بأسعار شاملة الضريبة.</p>
                </div>
                <button type="button" onClick={handleAddService} className="bg-slate-800 text-white px-4 py-2.5 rounded-lg font-black text-xs hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2">
                    <span>+</span> خدمة جديدة
                </button>
            </div>
            <div className="space-y-3">
                {services.length === 0 ? (
                    <div className="text-center p-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                        <Scissors size={28} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 font-bold text-sm">لم تقم بإضافة خدمات. (الوضع الافتراضي: حجز مقعد فقط)</p>
                    </div>
                ) : (
                    services.map((srv, index) => (
                        <div key={srv.id || index} className="flex flex-col md:flex-row gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 items-center hover:border-blue-300 transition-colors">
                            <div className="w-full md:w-2/5 relative">
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black bg-white w-5 h-5 flex items-center justify-center rounded-full shadow-sm">{index + 1}</span>
                                <input type="text" required placeholder="اسم الخدمة (مثال: تنظيف بشرة)" value={srv.name} onChange={(e) => handleServiceChange(srv.id, 'name', e.target.value)} className="w-full pr-12 pl-4 py-3.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 shadow-sm" />
                            </div>
                            <div className="w-full md:w-1/4 relative">
                                <input type="number" required placeholder="السعر" min="0" value={srv.price} onChange={(e) => handleServiceChange(srv.id, 'price', Number(e.target.value))} className="w-full px-4 py-3.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 shadow-sm" dir="ltr" />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">ر.س</span>
                            </div>
                            <div className="w-full md:w-1/4 relative">
                                <select value={srv.duration} onChange={(e) => handleServiceChange(srv.id, 'duration', Number(e.target.value))} className="w-full pl-10 pr-4 py-3.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 appearance-none shadow-sm cursor-pointer">
                                    <option value={15}>15 دقيقة</option>
                                    <option value={30}>30 دقيقة</option>
                                    <option value={45}>45 دقيقة</option>
                                    <option value={60}>ساعة</option>
                                </select>
                                <Clock3 size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                            <button type="button" onClick={() => handleRemoveService(srv.id)} className="w-full md:w-auto p-3.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center font-bold">حذف</button>
                        </div>
                    ))
                )}
            </div>
        </div>
        )}
        {editingBarber && (
            <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-labelledby="barber-editor-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
                <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                        <h3 id="barber-editor-title" className="text-lg font-black text-slate-800">تعديل الحلاق</h3>
                        <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-black text-white hover:bg-slate-800">تم</button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        {renderBarberEditor(editingBarber, editingIndex)}
                        <p className="mt-4 text-xs font-bold text-slate-400">تُحفظ التعديلات من شريط الحفظ أسفل صفحة الإعدادات.</p>
                    </div>
                </div>
            </div>
        )}
    </section>
    );
};

export default TeamSection;
