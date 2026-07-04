import React, { useEffect, useState } from 'react';
import { applyPwaUpdate, listenForPwaUpdates } from '../services/pwaUpdates';

const AppUpdatePrompt = () => {
  const [registration, setRegistration] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const stopListening = listenForPwaUpdates((nextRegistration) => {
      setRegistration(nextRegistration);
      setIsVisible(true);
    });

    let isRefreshing = false;
    const handleControllerChange = () => {
      if (isRefreshing) return;
      isRefreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker?.addEventListener(
      'controllerchange',
      handleControllerChange,
    );

    return () => {
      stopListening();
      navigator.serviceWorker?.removeEventListener(
        'controllerchange',
        handleControllerChange,
      );
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-5 left-4 right-4 z-[9999] flex justify-center pointer-events-none" dir="rtl">
      <div className="pointer-events-auto w-full max-w-md bg-slate-950 text-white border border-white/10 shadow-2xl rounded-2xl p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">تحديث جديد متوفر</p>
          <p className="text-[11px] font-bold text-slate-300 mt-0.5">
            حدث التطبيق للحصول على آخر نسخة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => applyPwaUpdate(registration)}
          className="shrink-0 bg-white text-slate-950 px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
        >
          تحديث الآن
        </button>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="shrink-0 w-8 h-8 rounded-xl bg-white/10 text-white text-sm font-black active:scale-95 transition-transform"
          aria-label="إغلاق"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default AppUpdatePrompt;
