import React, { useEffect, useState } from 'react';
import { RefreshCcw, X } from 'lucide-react';
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
    <div
      className="pointer-events-none fixed bottom-4 left-3 right-3 z-[9999] flex justify-center sm:bottom-5 sm:left-5 sm:right-auto"
      dir="rtl"
      role="alert"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <RefreshCcw className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">تحديث جديد متوفر</p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">
            حدث التطبيق للحصول على آخر نسخة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => applyPwaUpdate(registration)}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 active:scale-95"
        >
          تحديث الآن
        </button>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
          aria-label="إغلاق"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default AppUpdatePrompt;
