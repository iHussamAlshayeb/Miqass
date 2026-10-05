// خيارات وأدوات إجازات الحلاقين (مشتركة بين تبويب الفريق ومنطق الإضافة)
export const LEAVE_TYPE_OPTIONS = [
    { value: 'daily', label: 'يوم أسبوعي متكرر' },
    { value: 'weekly', label: 'أسبوع', durationDays: 7 },
    { value: 'monthly', label: 'شهر', durationDays: 30 },
];

export const WEEKDAY_OPTIONS = [
    { value: 0, label: 'الأحد' },
    { value: 1, label: 'الإثنين' },
    { value: 2, label: 'الثلاثاء' },
    { value: 3, label: 'الأربعاء' },
    { value: 4, label: 'الخميس' },
    { value: 5, label: 'الجمعة' },
    { value: 6, label: 'السبت' },
];

export const buildLeavePeriod = (type, startDate, endDate, weekday) => {
    const option = LEAVE_TYPE_OPTIONS.find((item) => item.value === type);
    if (!option || !startDate) return null;

    if (type === 'daily') {
        const parsedWeekday = Number(weekday);
        if (!endDate || endDate < startDate || !Number.isInteger(parsedWeekday)) return null;

        return { type, startDate, endDate, weekday: parsedWeekday };
    }

    const calculatedEndDate = new Date(`${startDate}T12:00:00`);
    if (Number.isNaN(calculatedEndDate.getTime())) return null;
    calculatedEndDate.setDate(calculatedEndDate.getDate() + option.durationDays - 1);

    return {
        type,
        startDate,
        endDate: `${calculatedEndDate.getFullYear()}-${String(calculatedEndDate.getMonth() + 1).padStart(2, '0')}-${String(calculatedEndDate.getDate()).padStart(2, '0')}`,
    };
};

export const formatLeaveDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('ar-SA-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});
