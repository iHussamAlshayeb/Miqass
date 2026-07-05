import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID =
  import.meta.env.VITE_ONESIGNAL_APP_ID ||
  'df2b3be8-ac20-4e4b-9f52-fad5648afd2b';

const DEFAULT_ALLOWED_ORIGINS = ['https://www.miqass.app', 'https://miqass.app'];
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const LOCALHOST_OPT_IN = import.meta.env.VITE_ONESIGNAL_ENABLE_LOCALHOST === 'true';

let oneSignalInitPromise = null;

const isBrowser = () => typeof window !== 'undefined' && typeof navigator !== 'undefined';

const getAllowedOrigins = () => {
  const configuredOrigins = import.meta.env.VITE_ONESIGNAL_ALLOWED_ORIGINS;
  if (!configuredOrigins) return DEFAULT_ALLOWED_ORIGINS;

  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const getOriginSupport = () => {
  if (!isBrowser()) {
    return { ok: false, reason: 'not-browser' };
  }

  const { origin, hostname } = window.location;
  const isLocalOrigin = LOCAL_HOSTNAMES.includes(hostname);

  if (isLocalOrigin && !LOCALHOST_OPT_IN) {
    return { ok: false, reason: 'localhost-disabled' };
  }

  const allowedOrigins = getAllowedOrigins();
  const isAllowed =
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(origin) ||
    allowedOrigins.includes(hostname);

  return {
    ok: isAllowed,
    reason: isAllowed ? null : 'origin-not-allowed',
  };
};

export const isAppleMobileDevice = () => {
  if (!isBrowser()) return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

export const isStandalonePwa = () => {
  if (!isBrowser()) return false;

  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  );
};

const getNativePermission = () => {
  if (!isBrowser() || !('Notification' in window)) return 'unsupported';

  return (
    window.OneSignal?.Notifications?.permissionNative ||
    window.Notification?.permission ||
    'default'
  );
};

const waitForSubscriptionUpdate = () =>
  new Promise((resolve) => setTimeout(resolve, 350));

const canUseServiceWorker = () => isBrowser() && 'serviceWorker' in navigator;

const doesSdkSupportPush = () => {
  try {
    return Boolean(OneSignal.Notifications?.isPushSupported?.());
  } catch {
    return false;
  }
};

const buildOneSignalStatus = ({
  initialized = false,
  sdkSupportsPush = doesSdkSupportPush(),
  error = null,
} = {}) => {
  const appleMobile = isAppleMobileDevice();
  const standalone = isStandalonePwa();
  const permission = getNativePermission();
  const originSupport = getOriginSupport();
  const hasNotificationApi = permission !== 'unsupported';
  const needsInstallForIos = appleMobile && !standalone;

  return {
    initialized,
    isSupported:
      originSupport.ok &&
      !needsInstallForIos &&
      hasNotificationApi &&
      canUseServiceWorker() &&
      sdkSupportsPush,
    isOriginAllowed: originSupport.ok,
    originBlockReason: originSupport.reason,
    isAppleMobileDevice: appleMobile,
    isStandalonePwa: standalone,
    needsInstallForIos,
    permission,
    isOptedIn: isBrowser() && window.OneSignal?.User?.PushSubscription?.optedIn === true,
    subscriptionId: isBrowser() ? window.OneSignal?.User?.PushSubscription?.id || null : null,
    error,
  };
};

export const initOneSignalForTenant = async (tenantId) => {
  if (!isBrowser() || !ONESIGNAL_APP_ID || !canUseServiceWorker()) return false;
  if (!getOriginSupport().ok) return false;

  if (!oneSignalInitPromise) {
    oneSignalInitPromise = OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
      autoResubscribe: true,
      notifyButton: { enable: false },
      serviceWorkerPath: 'OneSignalSDKWorker.js',
      serviceWorkerParam: { scope: '/' },
      welcomeNotification: { disable: true },
      promptOptions: {
        slidedown: {
          prompts: [
            {
              type: 'push',
              autoPrompt: false,
              text: {
                actionMessage: 'فعّل إشعارات الحجوزات والتنبيهات المهمة.',
                acceptButton: 'تفعيل',
                cancelButton: 'لاحقاً',
              },
            },
          ],
        },
      },
    })
      .catch((error) => {
        if (String(error?.message || error).includes('already initialized')) {
          return;
        }

        oneSignalInitPromise = null;
        throw error;
      });
  }

  await oneSignalInitPromise;

  if (tenantId) {
    await OneSignal.User?.addTag?.('tenantId', tenantId.toString());
  }

  return true;
};

export const getOneSignalStatus = async (tenantId) => {
  const currentStatus = buildOneSignalStatus();

  if (tenantId && currentStatus.isOriginAllowed && !currentStatus.needsInstallForIos) {
    try {
      const initialized = await initOneSignalForTenant(tenantId);
      return buildOneSignalStatus({ initialized });
    } catch (error) {
      return buildOneSignalStatus({
        initialized: false,
        sdkSupportsPush: false,
        error,
      });
    }
  }

  return currentStatus;
};

export const requestOneSignalPermission = async (tenantId) => {
  let statusBeforeRequest = buildOneSignalStatus({
    initialized: Boolean(oneSignalInitPromise),
  });

  if (statusBeforeRequest.needsInstallForIos) {
    return { ok: false, reason: 'ios-home-screen-required', status: statusBeforeRequest };
  }

  if (!statusBeforeRequest.isOriginAllowed) {
    return { ok: false, reason: statusBeforeRequest.originBlockReason || 'origin-not-allowed', status: statusBeforeRequest };
  }

  if (!oneSignalInitPromise) {
    await initOneSignalForTenant(tenantId);
    statusBeforeRequest = buildOneSignalStatus({ initialized: true });
  }

  if (statusBeforeRequest.permission === 'denied') {
    return { ok: false, reason: 'permission-denied', status: statusBeforeRequest };
  }

  if (!statusBeforeRequest.isSupported && statusBeforeRequest.permission !== 'granted') {
    return { ok: false, reason: 'unsupported', status: statusBeforeRequest };
  }

  if (statusBeforeRequest.permission === 'default') {
    await OneSignal.Notifications?.requestPermission?.();
  }

  if (getNativePermission() === 'granted') {
    await OneSignal.User?.PushSubscription?.optIn?.();
    if (tenantId) {
      await OneSignal.User?.addTag?.('tenantId', tenantId.toString());
    }
  }

  await waitForSubscriptionUpdate();
  const status = await getOneSignalStatus(tenantId);

  return {
    ok: status.permission === 'granted' && status.isOptedIn,
    reason: status.permission === 'granted' ? 'subscription-pending' : 'permission-not-granted',
    status,
  };
};

export default OneSignal;
