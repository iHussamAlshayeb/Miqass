// نفس توحيد الخادم (backend/src/utils/saudiMobile.js): الصيغة 05XXXXXXXX أو null
export const normalizeSaudiMobile = (value) => {
    let phone = String(value ?? '')
        .trim()
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/\D/g, '');
    if (phone.startsWith('00966')) phone = `0${phone.slice(5)}`;
    else if (phone.startsWith('966')) phone = `0${phone.slice(3)}`;
    else if (phone.length === 9 && phone.startsWith('5')) phone = `0${phone}`;
    return /^05\d{8}$/.test(phone) ? phone : null;
};
