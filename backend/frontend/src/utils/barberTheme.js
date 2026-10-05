// لون الحلاق: اللون المخصص له من الإعدادات، وإلا التناوب بين لوني الهوية
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const getBarberColor = (barber, index, primary, secondary) => {
    const custom = typeof barber === 'object' ? barber?.iconColor : null;
    if (custom && HEX_COLOR.test(custom)) return custom;
    return index % 2 === 0 ? primary : secondary;
};

// لون الحلاق المختار حالياً (يُستخدم لتلوين صفحة الحجز بالكامل)
export const getSelectedBarberColor = (barbers = [], selectedName, primary, secondary) => {
    const index = barbers.findIndex((barber) => (barber?.name || barber) === selectedName);
    if (index < 0) return primary;
    return getBarberColor(barbers[index], index, primary, secondary);
};

// خلفية داكنة للأيقونة إذا كان لون الحلاق فاتحاً جداً حتى تبقى واضحة
export const getIconBackground = (hex) => {
    if (!HEX_COLOR.test(hex || '')) return '#ffffff';
    const red = parseInt(hex.slice(1, 3), 16);
    const green = parseInt(hex.slice(3, 5), 16);
    const blue = parseInt(hex.slice(5, 7), 16);
    return (red * 299 + green * 587 + blue * 114) / 1000 > 180 ? '#0f172a' : '#ffffff';
};
