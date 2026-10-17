// تسعير الخدمات حسب الحلاق: سعر الحلاق الخاص إن وُجد، وإلا السعر الأساسي للخدمة
export const getServiceKey = (service) => String(service?._id || service?.id || '');

export const getBarberServicePrice = (service, barber) => {
    const key = getServiceKey(service);
    const custom = (barber?.servicePrices || []).find((entry) => String(entry.serviceId) === key);
    const customPrice = custom && custom.price !== '' && custom.price !== null ? Number(custom.price) : NaN;
    return Number.isFinite(customPrice) ? customPrice : Number(service?.price || 0);
};

export const findBarberByName = (barbers, name) =>
    (barbers || []).find((barber) => (typeof barber === 'string' ? barber : barber?.name) === name) || null;
