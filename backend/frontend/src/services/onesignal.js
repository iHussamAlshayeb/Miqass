import OneSignal from 'react-onesignal';
import API from './api';

const ONESIGNAL_APP_ID =
  import.meta.env.VITE_ONESIGNAL_APP_ID ||
  'df2b3be8-ac20-4e4b-9f52-fad5648afd2b';

const PRIMARY_ONESIGNAL_ORIGIN =
  import.meta.env.VITE_ONESIGNAL_PRIMARY_ORIGIN || 'https://www.miqass.app';
const DEFAULT_ALLOWED_ORIGINS = [PRIMARY_ONESIGNAL_ORIGIN];
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const LOCALHOST_OPT_IN = import.meta.env.VITE_ONESIGNAL_ENABLE_LOCALHOST === 'true';

let oneSignalInitPromise = null;
let syncedSubscriptionId = null;
const INSTALLATION_ID_KEY = 'miqass_push_installation_id';

const isBrowser = () => typeof window !== 'undefined' && typeof navigator !== 'undefined';

const normalizeOrigin = (origin) => String(origin || '').replace(/\/+$/, '');

const getAllowedOrigins = () => {
  const configuredOrigins = import.meta.env.VITE_ONESIGNAL_ALLOWED_ORIGINS;
  if (!configuredOrigins) return DEFAULT_ALLOWED_ORIGINS;

  return configuredOrigins
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);
};

const getOriginSupport = () => {
  if (!isBrowser()) {
    return { ok: false, reason: 'not-browser' };
  }

  const { origin, hostname } = window.location;
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedPrimaryOrigin = normalizeOrigin(PRIMARY_ONESIGNAL_ORIGIN);
  const isLocalOrigin = LOCAL_HOSTNAMES.includes(hostname);

  if (isLocalOrigin && !LOCALHOST_OPT_IN) {
    return { ok: false, reason: 'localhost-disabled', expectedOrigin: normalizedPrimaryOrigin };
  }

  const allowedOrigins = getAllowedOrigins();
  const isAllowed =
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(normalizedOrigin) ||
    allowedOrigins.includes(hostname);

  if (!isAllowed && normalizedPrimaryOrigin) {
    try {
      const primaryUrl = new URL(normalizedPrimaryOrigin);
      const currentWithoutWww = hostname.replace(/^www\./, '');
      const primaryWithoutWww = primaryUrl.hostname.replace(/^www\./, '');

      if (currentWithoutWww === primaryWithoutWww) {
        return {
          ok: false,
          reason: 'www-required',
          expectedOrigin: normalizedPrimaryOrigin,
        };
      }
    } catch {
      // Ignore malformed configuration and fall through to the generic reason.
    }
  }

  return {
    ok: isAllowed,
    reason: isAllowed ? null : 'origin-not-allowed',
    expectedOrigin: isAllowed ? null : normalizedPrimaryOrigin,
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

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

const getInstallationId = () => {
  if (!isBrowser()) return '';

  let installationId = localStorage.getItem(INSTALLATION_ID_KEY);
  if (!installationId) {
    installationId =
      window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(INSTALLATION_ID_KEY, installationId);
  }
  return installationId;
};

const getTenantExternalId = (tenantId) =>
  `tenant:${tenantId}:device:${getInstallationId()}`;

const syncPushSubscription = async (tenantId) => {
  const subscription = getPushSubscriptionState();
  if (!tenantId || !subscription.id || !subscription.optedIn) return false;

  const externalId = getTenantExternalId(tenantId);
  await API.post('/notifications/subscriptions', {
    subscriptionId: subscription.id,
    externalId,
    platform: isAppleMobileDevice() ? 'ios-web' : 'web',
  });
  syncedSubscriptionId = subscription.id;
  return true;
};

const identifyTenantDevice = async (tenantId) => {
  if (!tenantId) return;

  await OneSignal.login(getTenantExternalId(tenantId));
  const tags = OneSignal.User?.getTags?.() || {};
  if (tags.tenantId !== tenantId.toString()) {
    OneSignal.User?.addTag?.('tenantId', tenantId.toString());
  }
};

const canUseServiceWorker = () => isBrowser() && 'serviceWorker' in navigator;

const hasNativePushApi = () =>
  isBrowser() &&
  'Notification' in window &&
  'PushManager' in window &&
  canUseServiceWorker();

const doesSdkSupportPush = () => {
  try {
    const sdkSupport = OneSignal.Notifications?.isPushSupported?.();
    if (typeof sdkSupport === 'boolean') return sdkSupport;
  } catch {
    // Fall back to native API detection when the SDK has not finished booting.
  }

  return hasNativePushApi();
};

const getErrorInfo = (error) => {
  if (!error) return null;

  const message = String(error?.message || error || '');
  const originMatch = message.match(/Can only be used on:\s*(https?:\/\/[^\s]+)/i);

  if (originMatch) {
    return {
      reason: 'onesignal-origin-mismatch',
      message,
      expectedOrigin: normalizeOrigin(originMatch[1]),
    };
  }

  if (/service\s*worker/i.test(message)) {
    return { reason: 'service-worker-error', message };
  }

  if (/network|fetch|load|script|cdn/i.test(message)) {
    return { reason: 'sdk-load-error', message };
  }

  return { reason: 'initialization-failed', message };
};

const getPushSubscriptionState = () => {
  if (!isBrowser()) {
    return { optedIn: false, id: null, token: null };
  }

  const pushSubscription = window.OneSignal?.User?.PushSubscription;

  return {
    optedIn: pushSubscription?.optedIn === true,
    id: pushSubscription?.id || null,
    token: pushSubscription?.token || null,
  };
};

const getReadinessBlockReason = () => {
  if (!isBrowser()) return 'not-browser';
  if (!ONESIGNAL_APP_ID) return 'missing-app-id';
  if (!canUseServiceWorker()) return 'service-worker-unavailable';
  if (window.isSecureContext === false) return 'insecure-context';
  return null;
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
  const errorInfo = getErrorInfo(error);
  const serviceWorkerAvailable = canUseServiceWorker();
  const nativePushAvailable = hasNativePushApi();
  const isSecure = !isBrowser() || window.isSecureContext !== false;
  const pushSubscription = getPushSubscriptionState();
  const hasOneSignalSubscription = Boolean(
    pushSubscription.optedIn ||
    pushSubscription.id ||
    pushSubscription.token,
  );
  const isSubscribed = permission === 'granted' && hasOneSignalSubscription;

  return {
    initialized,
    isSupported:
      originSupport.ok &&
      !needsInstallForIos &&
      hasNotificationApi &&
      serviceWorkerAvailable &&
      isSecure &&
      (sdkSupportsPush || nativePushAvailable),
    isOriginAllowed: originSupport.ok,
    originBlockReason: originSupport.reason,
    expectedOrigin: errorInfo?.expectedOrigin || originSupport.expectedOrigin || null,
    isAppleMobileDevice: appleMobile,
    isStandalonePwa: standalone,
    needsInstallForIos,
    permission,
    isOptedIn: pushSubscription.optedIn,
    isSubscribed,
    subscriptionId: pushSubscription.id,
    subscriptionToken: pushSubscription.token,
    isBackendSynced:
      Boolean(pushSubscription.id) && pushSubscription.id === syncedSubscriptionId,
    serviceWorkerAvailable,
    nativePushAvailable,
    sdkSupportsPush,
    isSecureContext: isSecure,
    readinessBlockReason: getReadinessBlockReason(),
    errorReason: errorInfo?.reason || null,
    errorMessage: errorInfo?.message || '',
    error,
  };
};

export const initOneSignalForTenant = async (tenantId) => {
  if (getReadinessBlockReason()) return false;
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
    await identifyTenantDevice(tenantId);
    const status = buildOneSignalStatus({ initialized: true });
    if (status.permission === 'granted' && status.isSubscribed) {
      await syncPushSubscription(tenantId);
    }
  }

  return true;
};

const waitForOneSignalSubscription = async (tenantId) => {
  const startedAt = Date.now();
  let latestStatus = buildOneSignalStatus({ initialized: true });

  while (Date.now() - startedAt < 6000) {
    if (latestStatus.permission !== 'granted' || latestStatus.isSubscribed) {
      return latestStatus;
    }

    await sleep(400);
    latestStatus = await getOneSignalStatus(tenantId, { initialize: true });
  }

  return latestStatus;
};

export const getOneSignalStatus = async (tenantId, { initialize = false } = {}) => {
  const currentStatus = buildOneSignalStatus();

  if (
    initialize &&
    tenantId &&
    currentStatus.isOriginAllowed &&
    !currentStatus.needsInstallForIos
  ) {
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
    try {
      const initialized = await initOneSignalForTenant(tenantId);
      if (!initialized) {
        const status = buildOneSignalStatus({ initialized: false });
        return {
          ok: false,
          reason: status.readinessBlockReason || 'initialization-failed',
          status,
        };
      }
    } catch (error) {
      return {
        ok: false,
        reason: getErrorInfo(error)?.reason || 'initialization-failed',
        status: buildOneSignalStatus({
          initialized: false,
          sdkSupportsPush: false,
          error,
        }),
      };
    }
    statusBeforeRequest = buildOneSignalStatus({ initialized: true });
  }

  if (statusBeforeRequest.permission === 'denied') {
    return { ok: false, reason: 'permission-denied', status: statusBeforeRequest };
  }

  if (!statusBeforeRequest.isSupported && statusBeforeRequest.permission !== 'granted') {
    return { ok: false, reason: 'unsupported', status: statusBeforeRequest };
  }

  if (statusBeforeRequest.permission === 'default') {
    const granted = await OneSignal.Notifications?.requestPermission?.();
    if (granted === false) {
      return {
        ok: false,
        reason: 'permission-not-granted',
        status: buildOneSignalStatus({ initialized: true }),
      };
    }
  }

  if (getNativePermission() === 'granted') {
    await OneSignal.User?.PushSubscription?.optIn?.();
    if (tenantId) {
      await identifyTenantDevice(tenantId);
    }
  }

  const status = await waitForOneSignalSubscription(tenantId);
  if (status.permission === 'granted' && status.isSubscribed) {
    await syncPushSubscription(tenantId);
  }

  return {
    ok:
      status.permission === 'granted' &&
      status.isSubscribed &&
      getPushSubscriptionState().id === syncedSubscriptionId,
    reason: status.permission === 'granted' ? 'subscription-pending' : 'permission-not-granted',
    status,
  };
};

export const listenForOneSignalChanges = (callback) => {
  if (!isBrowser() || !window.OneSignal) return () => {};

  const handleChange = () => callback();
  OneSignal.Notifications?.addEventListener?.('permissionChange', handleChange);
  OneSignal.User?.PushSubscription?.addEventListener?.('change', handleChange);

  return () => {
    OneSignal.Notifications?.removeEventListener?.('permissionChange', handleChange);
    OneSignal.User?.PushSubscription?.removeEventListener?.('change', handleChange);
  };
};

export const disconnectOneSignal = async () => {
  if (!isBrowser() || !oneSignalInitPromise) return;

  try {
    await oneSignalInitPromise;
  } catch {
    return;
  }

  const subscriptionId = getPushSubscriptionState().id;
  if (subscriptionId) {
    await API.delete(`/notifications/subscriptions/${encodeURIComponent(subscriptionId)}`).catch(
      () => {},
    );
  }

  await OneSignal.User?.PushSubscription?.optOut?.().catch(() => {});
  OneSignal.User?.removeTag?.('tenantId');
  await OneSignal.logout?.().catch(() => {});
  syncedSubscriptionId = null;
};

export default OneSignal;
