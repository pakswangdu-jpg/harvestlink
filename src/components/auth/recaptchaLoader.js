const SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit';
const SCRIPT_SELECTOR = 'script[data-harvestlink-recaptcha="true"]';
const LOAD_TIMEOUT_MS = 10000;

let apiPromise;

function waitForApi(api, resolve, reject) {
  if (!api?.ready || !api?.render) {
    reject(new Error('Google reCAPTCHA API is unavailable.'));
    return;
  }
  try {
    api.ready(() => {
      if (window.grecaptcha?.render) resolve(window.grecaptcha);
      else reject(new Error('Google reCAPTCHA API did not initialize.'));
    });
  } catch {
    reject(new Error('Google reCAPTCHA API did not initialize.'));
  }
}

export function loadRecaptchaApi() {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    let script = document.querySelector(SCRIPT_SELECTOR)
      || document.querySelector(`script[src="${SCRIPT_URL}"]`);
    let timeoutId;
    let settled = false;

    const finish = (error, api) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
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
    const handleLoad = () => {
      if (script) script.dataset.harvestlinkRecaptchaLoaded = 'true';
      waitForApi(window.grecaptcha, (api) => finish(null, api), (error) => finish(error));
    };
    const handleError = () => finish(new Error('Google reCAPTCHA script failed to load.'));

    timeoutId = window.setTimeout(
      () => finish(new Error('Google reCAPTCHA script timed out.')),
      LOAD_TIMEOUT_MS,
    );

    if (window.grecaptcha?.render) {
      waitForApi(window.grecaptcha, (api) => finish(null, api), (error) => finish(error));
      return;
    }

    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.dataset.harvestlinkRecaptcha = 'true';
    }
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  });

  return apiPromise;
}
