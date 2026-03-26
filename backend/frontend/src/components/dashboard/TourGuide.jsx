import React, { useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';

const TourGuide = () => {
    // 💡 حالة تشغيل الجولة
    const [run, setRun] = useState(false);

    // 💡 خطوات الجولة (نستهدف العناصر عبر الكلاسات أو الـ IDs)
    const steps = [
        {
            target: 'body', // الخطوة الأولى تظهر في منتصف الشاشة
            content: (
                <div className="text-right font-arabic">
                    <h3 className="text-xl font-black mb-2 text-slate-800">أهلاً بك في منصة مِقَص! ✂️</h3>
                    <p className="text-slate-600 font-bold">دعنا نأخذك في جولة سريعة لتعريفك بكيفية إدارة صالونك باحترافية.</p>
                </div>
            ),
            placement: 'center',
            disableBeacon: true,
        },
        {
            target: '.tour-tabs',
            content: (
                <div className="text-right font-arabic">
                    <h3 className="font-black text-blue-600 mb-1">القائمة الرئيسية</h3>
                    <p className="text-sm font-bold text-slate-600">من هنا يمكنك التنقل بين مواعيد اليوم، السجل الشامل، وإعدادات صالونك.</p>
                </div>
            ),
        },
        {
            target: '.tour-stats',
            content: (
                <div className="text-right font-arabic">
                    <h3 className="font-black text-rose-500 mb-1">نظرة سريعة</h3>
                    <p className="text-sm font-bold text-slate-600">هنا تتابع عدد العملاء المنتظرين للحلاقة اليوم وإجمالي حجوزاتك القادمة.</p>
                </div>
            ),
        },
        {
            target: '.tour-whatsapp',
            content: (
                <div className="text-right font-arabic">
                    <h3 className="font-black text-emerald-500 mb-1">خدمة الواتساب</h3>
                    <p className="text-sm font-bold text-slate-600">تأكد دائماً أن هذه العلامة خضراء لضمان وصول الرسائل الآلية لعملائك.</p>
                </div>
            ),
        },
        {
            target: '.tour-link',
            content: (
                <div className="text-right font-arabic">
                    <h3 className="font-black text-slate-800 mb-1">رابط صالونك</h3>
                    <p className="text-sm font-bold text-slate-600">انسخ هذا الرابط وشاركه في بايو الإنستجرام أو أرسله لعملائك ليبدأوا بالحجز!</p>
                </div>
            ),
        }
    ];

    // 💡 التحقق مما إذا كان المستخدم يزور اللوحة لأول مرة
    useEffect(() => {
        const hasSeenTour = localStorage.getItem('hasSeenTour');
        if (!hasSeenTour) {
            // نؤخر التشغيل قليلاً لضمان تحميل الصفحة بالكامل
            setTimeout(() => setRun(true), 1000);
        }
    }, []);

    // 💡 ماذا يحدث عند انتهاء الجولة أو تخطيها؟
    const handleJoyrideCallback = (data) => {
        const { status } = data;
        const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

        if (finishedStatuses.includes(status)) {
            // نوقف الجولة ونحفظ في المتصفح أنه شاهدها ولن تظهر مرة أخرى
            setRun(false);
            localStorage.setItem('hasSeenTour', 'true');
        }
    };

    return (
        <Joyride
            steps={steps}
            run={run}
            continuous={true} // الانتقال التلقائي للخطوة التالية
            showSkipButton={true} // إظهار زر التخطي
            showProgress={true} // إظهار الترقيم (1/5)
            callback={handleJoyrideCallback}
            styles={{
                options: {
                    primaryColor: '#2563eb', // لون أزرار الجولة (أزرق Tailwind)
                    textColor: '#1e293b',
                    backgroundColor: '#ffffff',
                    zIndex: 1000,
                },
                buttonNext: {
                    fontFamily: 'inherit',
                    fontWeight: '900',
                    borderRadius: '8px',
                    padding: '8px 16px',
                },
                buttonBack: {
                    fontFamily: 'inherit',
                    fontWeight: '900',
                    color: '#64748b',
                },
                buttonSkip: {
                    fontFamily: 'inherit',
                    fontWeight: 'bold',
                    color: '#ef4444', // أحمر للتخطي
                }
            }}
            locale={{
                back: 'السابق',
                close: 'إغلاق',
                last: 'إنهاء الجولة',
                next: 'التالي',
                skip: 'تخطي الجولة',
            }}
        />
    );
};

export default TourGuide;