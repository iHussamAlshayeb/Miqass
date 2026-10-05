// أيقونة كرسي الحلاقة (موحّدة في صفحة الحجز والكشك وبوابة الحلاق وشاشة الطابور)
const BarberChairIcon = ({ strokeWidth = 1.7, style, ...props }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ overflow: 'visible', ...style }}
        {...props}
    >
        <rect x="9" y="2.5" width="6" height="3" rx="1.5" />
        <path d="M12 5.5V7" />
        <path d="M7.5 13.5V10a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v3.5" />
        <rect x="5.5" y="13.5" width="13" height="3" rx="1.5" />
        <path d="M4 11h3.5M16.5 11H20" />
        <path d="M12 16.5v3" />
        <path d="M8 20.5h8" />
    </svg>
);

export default BarberChairIcon;
