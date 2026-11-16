import React, { useEffect, useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, X } from 'lucide-react';
import { formatTime12Hour, getTimePeriod } from '../../utils/helpers';
import LoyaltyCard from './LoyaltyCard';
import { getSelectedBarberColor } from '../../utils/barberTheme';

// نفس هوية صفحة الحجز
const INK = { stone: '#EEF0EC', ink: '#1C1F22', muted: '#6A7068', line: '#DCDFD8' };
const DISPLAY_FONT = "'Noto Kufi Arabic', 'IBM Plex Sans Arabic', sans-serif";
const FIELD = 'h-14 w-full rounded-[14px] border bg-white px-4 text-base font-semibold outline-none transition-shadow focus:ring-4';

/** خطوة "بياناتك": ملخص الموعد، الجوال، أسماء الأشخاص، ثم التأكيد */
const BookingModal = ({
    isOpen,
    onClose,
    tenantData,
    selectedTime,
    selectedChair,
    selectedDateLabel,
    selectedServices = [],
    phone,
    setPhone,
    childrenNames,
    setChildrenNames,
    maxConsecutiveSlots,
    selectedServicesIds,
    totals,
    isCheckingLoyalty,
    loyaltyVisits,
    savedChildren,
    onRequestSavedNames,
    handleBookingSubmit,
    isLoading,
    bookingError,
    bookingErrorField,
    clearBookingError,
}) => {
    const [quickSelectError, setQuickSelectError] = useState('');

    const brandPrimary = tenantData?.branding?.primaryColor || '#3b82f6';
    const brandSecondary = tenantData?.branding?.secondaryColor || '#64748b';
    const accent = getSelectedBarberColor(tenantData?.barbers || [], selectedChair, brandPrimary, brandSecondary);
    const people = Math.max(childrenNames.filter((name) => name.trim() !== '').length, 1);
    const deposit = tenantData?.paymentSettings?.isOnlinePaymentEnabled && tenantData?.paymentSettings?.depositAmount > 0
        ? tenantData.paymentSettings.depositAmount : 0;

    const handleClose = () => {
        setQuickSelectError('');
        onClose();
    };

    // إغلاق بزر Esc
    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const handleQuickSelect = (childName) => {
        if (childrenNames.includes(childName)) return;
        setQuickSelectError('');
        const emptyIndex = childrenNames.findIndex((name) => name.trim() === '');
        if (emptyIndex !== -1) {
            const next = [...childrenNames];
            next[emptyIndex] = childName;
            setChildrenNames(next);
            clearBookingError();
        } else if (childrenNames.length < maxConsecutiveSlots) {
            setChildrenNames([...childrenNames, childName]);
            clearBookingError();
        } else {
            setQuickSelectError('الوقت المتاح لا يتسع لشخص آخر بعد هذا الموعد.');
        }
    };

    const setName = (index, value) => {
        const next = [...childrenNames];
        next[index] = value;
        setChildrenNames(next);
        clearBookingError();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="booking-details-title">
                    <Motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-[rgba(28,31,34,0.55)]"
                        onClick={handleClose}
                    />
                    <Motion.div
                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                        className="relative max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-white sm:rounded-[24px]"
                        dir="rtl"
                    >
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4" style={{ borderColor: INK.line }}>
                            <h3 id="booking-details-title" className="text-lg font-bold" style={{ fontFamily: DISPLAY_FONT }}>بياناتك لتأكيد الموعد</h3>
                            <button type="button" onClick={handleClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: INK.stone }}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleBookingSubmit} noValidate className="space-y-5 p-5">
                            {/* ملخص الموعد */}
                            <div className="rounded-[16px] p-4" style={{ backgroundColor: INK.stone }}>
                                <div className="flex items-baseline justify-between gap-3">
                                    <p className="text-2xl font-bold" style={{ fontFamily: DISPLAY_FONT }}>
                                        <bdi dir="ltr">{formatTime12Hour(selectedTime)}</bdi> <span className="text-sm font-semibold">{getTimePeriod(selectedTime)}</span>
                                    </p>
                                    <p className="text-sm font-semibold" style={{ color: accent }}>{selectedChair}</p>
                                </div>
                                <p className="mt-0.5 text-sm" style={{ color: INK.muted }}>{selectedDateLabel}</p>
                                {selectedServices.length > 0 && (
                                    <p className="mt-2 text-sm">{selectedServices.map((service) => service.name).join('، ')}</p>
                                )}
                            </div>

                            {bookingError && !bookingErrorField && (
                                <p role="alert" className="rounded-[12px] bg-rose-50 p-3 text-sm font-semibold text-rose-700">{bookingError}</p>
                            )}

                            <div>
                                <label htmlFor="booking-phone" className="mb-1.5 block text-sm font-bold">رقم الجوال</label>
                                <input
                                    id="booking-phone" type="tel" inputMode="numeric" autoComplete="tel" required maxLength="10" placeholder="05XXXXXXXX" dir="ltr"
                                    aria-invalid={bookingErrorField === 'phone'} aria-describedby="booking-phone-hint"
                                    value={phone}
                                    onChange={(event) => { setPhone(event.target.value.replace(/\D/g, '')); clearBookingError(); }}
                                    className={`${FIELD} text-left text-lg tracking-wider`}
                                    style={{ borderColor: bookingErrorField === 'phone' ? '#E11D48' : phone.length === 10 ? accent : INK.line, '--tw-ring-color': `${accent}33` }}
                                />
                                <p id="booking-phone-hint" role={bookingErrorField === 'phone' ? 'alert' : undefined} className={`mt-1.5 text-xs ${bookingErrorField === 'phone' ? 'font-semibold text-rose-700' : ''}`} style={bookingErrorField === 'phone' ? undefined : { color: INK.muted }}>
                                    {bookingErrorField === 'phone' ? bookingError : 'يصلك تأكيد الموعد والتذكير عليه.'}
                                </p>
                            </div>

                            <AnimatePresence>
                                {tenantData?.settings?.isLoyaltyEnabled && isCheckingLoyalty && (
                                    <Motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: INK.muted }}>
                                        جاري التحقق من بطاقة الولاء…
                                    </Motion.p>
                                )}
                                {tenantData?.settings?.isLoyaltyEnabled && loyaltyVisits !== null && !isCheckingLoyalty && (
                                    <LoyaltyCard visits={loyaltyVisits} primaryColor={accent} requiredVisits={tenantData.settings.loyaltyVisitsRequired || 5} />
                                )}
                            </AnimatePresence>

                            <fieldset>
                                <legend className="mb-1.5 text-sm font-bold">{childrenNames.length > 1 ? 'أسماء الأشخاص' : 'الاسم'}</legend>
                                <div className="space-y-2">
                                    {childrenNames.map((name, index) => (
                                        <div key={index} className="flex gap-2">
                                            <input
                                                type="text" required autoComplete={index === 0 ? 'given-name' : 'off'}
                                                aria-label={`اسم الشخص ${index + 1}`} aria-invalid={bookingErrorField === 'names'}
                                                placeholder={index === 0 ? 'اسمك' : `اسم الشخص ${index + 1}`}
                                                value={name}
                                                onChange={(event) => setName(index, event.target.value)}
                                                className={FIELD}
                                                style={{ borderColor: bookingErrorField === 'names' && !name.trim() ? '#E11D48' : INK.line, '--tw-ring-color': `${accent}33` }}
                                            />
                                            {index > 0 && (
                                                <button type="button" onClick={() => setChildrenNames(childrenNames.filter((_, i) => i !== index))} aria-label={`حذف الشخص ${index + 1}`}
                                                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border text-rose-600" style={{ borderColor: INK.line }}>
                                                    <Minus size={18} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {bookingErrorField === 'names' && <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">{bookingError}</p>}

                                {childrenNames.length < maxConsecutiveSlots ? (
                                    <button type="button" onClick={() => setChildrenNames([...childrenNames, ''])} className="mt-2 inline-flex h-10 items-center gap-1.5 text-sm font-bold" style={{ color: accent }}>
                                        <Plus size={16} /> إضافة شخص معك
                                    </button>
                                ) : childrenNames.length > 1 || maxConsecutiveSlots === 1 ? (
                                    <p className="mt-2 text-xs" style={{ color: INK.muted }}>الأوقات بعد هذا الموعد محجوزة، فلا يتسع لشخص آخر.</p>
                                ) : null}

                                {savedChildren?.length > 0 && (
                                    <div className="mt-3">
                                        <p className="mb-2 text-xs" style={{ color: INK.muted }}>أسماء حجزت بها سابقاً</p>
                                        <div className="flex flex-wrap gap-2">
                                            {savedChildren.map((childName) => {
                                                const used = childrenNames.includes(childName);
                                                return (
                                                    <button key={childName} type="button" disabled={used} onClick={() => handleQuickSelect(childName)}
                                                        className="h-9 rounded-full border px-3 text-sm font-semibold disabled:opacity-60"
                                                        style={used ? { backgroundColor: `${accent}14`, borderColor: 'transparent', color: accent } : { borderColor: INK.line }}>
                                                        {childName}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {onRequestSavedNames && (
                                    <button type="button" onClick={onRequestSavedNames} className="mt-2 block text-xs font-bold underline underline-offset-4" style={{ color: INK.ink }}>
                                        عرض الأسماء التي حجزت بها سابقاً (رمز تحقق على واتساب)
                                    </button>
                                )}
                                {quickSelectError && <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">{quickSelectError}</p>}
                            </fieldset>

                            {selectedServicesIds.length > 0 && (
                                <div className="flex items-baseline justify-between border-t pt-4" style={{ borderColor: INK.line }}>
                                    <span className="text-sm" style={{ color: INK.muted }}>
                                        الإجمالي{people > 1 ? ` لـ ${people} أشخاص` : ''}، {totals.duration * people} دقيقة
                                    </span>
                                    <span className="text-xl font-bold" style={{ fontFamily: DISPLAY_FONT }}>
                                        {totals.price * people} <span className="text-xs font-semibold" style={{ color: INK.muted }}>ر.س</span>
                                    </span>
                                </div>
                            )}

                            <div className="pb-[env(safe-area-inset-bottom)]">
                                <button type="submit" disabled={isLoading} className="h-14 w-full rounded-[14px] text-lg font-bold text-white transition-opacity disabled:opacity-60" style={{ backgroundColor: accent }}>
                                    {isLoading ? 'جاري الحجز…' : deposit ? `تأكيد ودفع عربون ${deposit} ر.س` : 'تأكيد الحجز'}
                                </button>
                                {deposit > 0 && <p className="mt-2 text-center text-xs" style={{ color: INK.muted }}>يُخصم العربون من الحساب في الصالون.</p>}
                            </div>
                        </form>
                    </Motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default BookingModal;
