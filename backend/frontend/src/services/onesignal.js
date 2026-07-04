import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID =
  import.meta.env.VITE_ONESIGNAL_APP_ID ||
  'df2b3be8-ac20-4e4b-9f52-fad5648afd2b';

let oneSignalInitPromise = null;

export const initOneSignalForTenant = async (tenantId, { prompt = false } = {}) => {
  if (!ONESIGNAL_APP_ID || !('Notification' in window)) return false;

  if (!oneSignalInitPromise) {
    oneSignalInitPromise = OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
    });
  }

  await oneSignalInitPromise;

  if (tenantId) {
    await OneSignal.User?.addTag?.('tenantId', tenantId.toString());
  }

  const shouldPrompt =
    prompt &&
    window.Notification?.permission === 'default' &&
    !sessionStorage.getItem('miqass_onesignal_prompt_seen');

  if (shouldPrompt) {
    sessionStorage.setItem('miqass_onesignal_prompt_seen', 'true');
    await OneSignal.Slidedown?.promptPush?.();
  }

  return true;
};

export default OneSignal;
