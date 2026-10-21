const SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit';
const SCRIPT_SELECTOR = 'script[data-harvestlink-recaptcha="true"]';
const LOAD_TIMEOUT_MS = 10000;
const API_POLL_INTERVAL_MS = 50;

let apiPromise;

export function loadRecaptchaApi() {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    let script = document.querySelector(SCRIPT_SELECTOR)
      || document.querySelector(`script[src="${SCRIPT_URL}"]`);
    let timeoutId;
    let pollId;
    let settled = false;

    const finish = (error, api) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearTimeout(pollId);
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
      if (error) {
        if (script && !window.grecaptcha?.render) script.remove();
        apiPromise = undefined;
        reject(error);
      } else {
        resolve(api);
      }
    };
    const waitForApi = () => {
      if (settled) return;
      const api = window.grecaptcha;
      if (!api?.ready || !api?.render) {
        pollId = window.setTimeout(waitForApi, API_POLL_INTERVAL_MS);
        return;
      }
      try {
        api.ready(() => {
          if (window.grecaptcha?.render) finish(null, window.grecaptcha);
          else pollId = window.setTimeout(waitForApi, API_POLL_INTERVAL_MS);
        });
      } catch {
        pollId = window.setTimeout(waitForApi, API_POLL_INTERVAL_MS);
      }
    };
    const handleLoad = () => {
      if (script) script.dataset.harvestlinkRecaptchaLoaded = 'true';
      waitForApi();
    };
    const handleError = () => finish(new Error('Google reCAPTCHA script failed to load.'));

    timeoutId = window.setTimeout(
      () => finish(new Error('Google reCAPTCHA script timed out.')),
      LOAD_TIMEOUT_MS,
    );

    if (window.grecaptcha?.render) {
      waitForApi();
      return;
    }

    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.dataset.harvestlinkRecaptcha = 'true';
    }
    if (script.dataset.harvestlinkRecaptchaLoaded === 'true' || script.readyState === 'complete') {
      waitForApi();
      return;
    }
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  });

  return apiPromise;
}
