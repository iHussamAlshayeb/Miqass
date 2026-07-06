const UPDATE_EVENT_NAME = "miqass:update-ready";
const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const MIQASS_WORKER_PATH = "/OneSignalSDKWorker.js";

let appShellSignature = null;
let hasDispatchedUpdate = false;

const extractBuildSignature = (html) => {
  const assetMatches = html.match(/\/assets\/[^"']+/g) || [];
  if (assetMatches.length > 0) return assetMatches.sort().join("|");

  const devEntry = html.match(/\/src\/main\.jsx/g) || [];
  return devEntry.join("|") || String(html.length);
};

const dispatchUpdateReady = (registration = null) => {
  if (hasDispatchedUpdate) return;
  hasDispatchedUpdate = true;
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT_NAME, { detail: { registration } }),
  );
};

const checkAppShellVersion = async () => {
  const response = await fetch(`/index.html?update-check=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });

  if (!response.ok) return;

  const html = await response.text();
  const nextSignature = extractBuildSignature(html);

  if (!appShellSignature) {
    appShellSignature = nextSignature;
    return;
  }

  if (nextSignature && nextSignature !== appShellSignature) {
    dispatchUpdateReady();
  }
};

export const registerPwaUpdates = () => {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    if (import.meta.env.DEV) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(window.location.origin))
            .map((registration) => registration.unregister()),
        );
      } catch {
        // Development should not be blocked by an old local service worker.
      }
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register(MIQASS_WORKER_PATH);
      setInterval(() => registration.update(), CHECK_INTERVAL_MS);
    } catch (error) {
      console.error("PWA registration failed:", error);
    }

    checkAppShellVersion().catch(() => {});
    setInterval(() => {
      checkAppShellVersion().catch(() => {});
    }, CHECK_INTERVAL_MS);
  });
};

export const applyPwaUpdate = (registration) => {
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: "MIQASS_SKIP_WAITING" });
    return;
  }

  window.location.reload();
};

export const listenForPwaUpdates = (callback) => {
  const handler = (event) => callback(event.detail?.registration || null);
  window.addEventListener(UPDATE_EVENT_NAME, handler);
  return () => window.removeEventListener(UPDATE_EVENT_NAME, handler);
};
