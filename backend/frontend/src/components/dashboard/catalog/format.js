// أدوات تنسيق مشتركة لصفحات الخدمات والمنتجات والمخزون
export const toMoney = (value) => Number(value || 0).toFixed(2);
export const formatQty = (value) => {
    const number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(2);
};
export const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
export const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 disabled:bg-slate-100';
