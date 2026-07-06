import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import {
    getOneSignalStatus,
    requestOneSignalPermission,
} from '../../services/onesignal';

const getStatusErrorMessage = (status) => {
    if (!status?.errorReason) return '';

    if (status.errorReason === 'onesignal-origin-mismatch') {
        return status.expectedOrigin
            ? `نطاق OneSignal مضبوط على ${status.expectedOrigin}. افتح لوحة التحكم من هذا الرابط ثم أعد إضافة التطبيق للشاشة الرئيسية.`
            : 'نطاق التطبيق لا يطابق النطاق المسجل في OneSignal.';
    }

    if (status.errorReason === 'service-worker-error') {
        return 'تعذر تجهيز ملف خدمة الإشعارات. تأكد أن OneSignalSDKWorker.js متاح من نفس نطاق التطبيق.';
    }

    if (status.errorReason === 'sdk-load-error') {
        return 'تعذر تحميل OneSignal حالياً. تحقق من الاتصال ثم أعد المحاولة.';
    }

    return 'تعذر تجهيز خدمة الإشعارات حالياً. أعد تحميل التطبيق ثم حاول مرة أخرى.';
};

const getReadinessMessage = (status) => {
    if (!status?.readinessBlockReason) return '';

    if (status.readinessBlockReason === 'missing-app-id') {
        return 'معرّف OneSignal غير مضبوط في إعدادات الواجهة.';
    }

    if (status.readinessBlockReason === 'service-worker-unavailable') {
        return 'هذا المتصفح لا يتيح Service Worker، لذلك لا يمكن تشغيل إشعارات الويب.';
    }

    if (status.readinessBlockReason === 'insecure-context') {
        return 'الإشعارات تحتاج اتصال HTTPS آمن من نفس نطاق التطبيق.';
    }

    return '';
};

const PushNotificationPrompt = ({ tenantId }) => {
    const [status, setStatus] = useState(null);
    const [isChecking, setIsChecking] = useState(true);
    const [isRequesting, setIsRequesting] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const refreshStatus = useCallback(async () => {
        if (!tenantId) return null;

        const nextStatus = await getOneSignalStatus(tenantId, { initialize: true });
        setStatus(nextStatus);
        return nextStatus;
    }, [tenantId]);

    useEffect(() => {
        let isMounted = true;

        const setup = async () => {
            if (!tenantId) return;

            setIsChecking(true);
            try {
                const nextStatus = await getOneSignalStatus(tenantId);
                if (!isMounted) return;
                setStatus(nextStatus);
                setErrorMessage(getStatusErrorMessage(nextStatus));
            } catch (error) {
                if (!isMounted) return;
                console.error('OneSignal status error:', error);
                setErrorMessage('تعذر تجهيز خدمة الإشعارات حالياً.');
            } finally {
                if (isMounted) setIsChecking(false);
            }
        };

        setup();

        return () => {
            isMounted = false;
        };
    }, [tenantId]);

    const content = useMemo(() => {
        if (isChecking) {
            return {
                tone: 'border-slate-200 bg-white text-slate-700',
                icon: <Loader2 className="w-5 h-5 animate-spin" />,
                title: 'جاري تجهيز إشعارات الحجوزات',
                description: 'يتم التحقق من جاهزية المتصفح وخدمة OneSignal.',
                actionLabel: '',
                canRequest: false,
            };
        }

        if (!status) return null;

        if (!status.isOriginAllowed) {
            const expectedOriginText = status.expectedOrigin
                ? ` استخدم ${status.expectedOrigin} ثم أعد إضافة التطبيق للشاشة الرئيسية.`
                : '';

            return {
                tone: 'border-slate-200 bg-white text-slate-700',
                icon: <AlertTriangle className="w-5 h-5" />,
                title: 'الإشعارات غير مفعلة على هذا النطاق',
                description: status.originBlockReason === 'localhost-disabled'
                    ? 'في بيئة التطوير المحلية يتم تعطيل OneSignal لتجنب أخطاء النطاق. اختبر الإشعارات من نطاق التطبيق الإنتاجي.'
                    : status.originBlockReason === 'www-required'
                        ? `OneSignal يتطلب نفس النطاق المسجل حرفياً.${expectedOriginText}`
                        : `هذا النطاق غير مضاف في إعدادات OneSignal.${expectedOriginText}`,
                actionLabel: '',
                canRequest: false,
            };
        }

        if (status.needsInstallForIos) {
            return {
                tone: 'border-amber-200 bg-amber-50 text-amber-900',
                icon: <Smartphone className="w-5 h-5" />,
                title: 'افتح التطبيق من أيقونة الشاشة الرئيسية',
                description: 'على iPhone تظهر مطالبة الإشعارات فقط داخل تطبيق الشاشة الرئيسية، وليس من Safari.',
                actionLabel: '',
                canRequest: false,
            };
        }

        if (status.permission === 'denied') {
            return {
                tone: 'border-red-200 bg-red-50 text-red-900',
                icon: <AlertTriangle className="w-5 h-5" />,
                title: 'إذن الإشعارات مرفوض',
                description: status.isAppleMobileDevice
                    ? 'في iPhone احذف تطبيق مِقَص من الشاشة الرئيسية ثم أضفه من جديد لتغيير الإذن.'
                    : 'غيّر إذن الإشعارات من إعدادات المتصفح ثم عد للوحة التحكم.',
                actionLabel: '',
                canRequest: false,
            };
        }

        if (status.permission === 'granted' && status.isSubscribed) {
            if (!feedback) return null;

            return {
                tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
                icon: <CheckCircle2 className="w-5 h-5" />,
                title: 'تم تفعيل إشعارات الحجوزات',
                description: feedback,
                actionLabel: '',
                canRequest: false,
            };
        }

        if (!status.isSupported && status.permission !== 'granted') {
            const readinessMessage = getReadinessMessage(status);
            const description = status.isAppleMobileDevice
                ? 'تأكد أن الجهاز iOS 16.4 أو أحدث، وأن التطبيق مفتوح من أيقونة الشاشة الرئيسية بعد إضافته من Safari.'
                : 'استخدم متصفحاً يدعم Web Push، وتأكد من HTTPS وخدمة Service Worker.';

            return {
                tone: 'border-slate-200 bg-white text-slate-700',
                icon: <AlertTriangle className="w-5 h-5" />,
                title: 'الإشعارات غير متاحة في هذا المتصفح',
                description: readinessMessage || description,
                actionLabel: '',
                canRequest: false,
            };
        }

        return {
            tone: 'border-blue-200 bg-blue-50 text-blue-950',
            icon: <BellRing className="w-5 h-5" />,
            title: 'تفعيل إشعارات الحجوزات',
            description: 'فعّل التنبيهات لتصلك إشعارات الحجوزات والتحديثات المهمة لهذا الصالون.',
            actionLabel:
                status.permission === 'granted'
                    ? 'استكمال تفعيل الإشعارات'
                    : 'تفعيل الإشعارات',
            canRequest: true,
        };
    }, [feedback, isChecking, status]);

    const handleRequestPermission = async () => {
        setIsRequesting(true);
        setFeedback('');
        setErrorMessage('');

        try {
            const result = await requestOneSignalPermission(tenantId);
            setStatus(result.status);

            if (result.ok) {
                setFeedback('ستصلك الآن إشعارات الحجوزات والتنبيهات المهمة.');
            } else if (result.reason === 'permission-not-granted') {
                setErrorMessage('لم يتم منح إذن الإشعارات.');
            } else if (result.reason === 'subscription-pending') {
                setErrorMessage('تم منح الإذن، لكن لم يكتمل ربط الاشتراك بعد. حاول مرة أخرى.');
            } else if (result.reason === 'unsupported') {
                setErrorMessage('هذا المتصفح لا يدعم إشعارات الويب لهذا التطبيق.');
            } else if (result.status?.readinessBlockReason) {
                setErrorMessage(getReadinessMessage(result.status));
            } else {
                setErrorMessage(getStatusErrorMessage(result.status));
            }

            await refreshStatus();
        } catch (error) {
            console.error('OneSignal permission error:', error);
            setErrorMessage('تعذر تفعيل الإشعارات حالياً.');
        } finally {
            setIsRequesting(false);
        }
    };

    if (!tenantId || !content) return null;

    return (
        <div className={`mb-4 rounded-lg border px-4 py-3 shadow-sm ${content.tone}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70">
                        {content.icon}
                    </div>
                    <div>
                        <h2 className="text-sm font-black">{content.title}</h2>
                        <p className="mt-1 text-xs font-bold leading-6 opacity-80">
                            {errorMessage || content.description}
                        </p>
                    </div>
                </div>

                {content.canRequest && (
                    <button
                        type="button"
                        onClick={handleRequestPermission}
                        disabled={isRequesting}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                        {isRequesting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <BellRing className="h-4 w-4" />
                        )}
                        <span>{isRequesting ? 'جاري التفعيل' : content.actionLabel}</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default PushNotificationPrompt;
