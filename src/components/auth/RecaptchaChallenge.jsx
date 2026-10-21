import { useEffect, useRef, useState } from 'react';
import './RecaptchaChallenge.css';
import { RECAPTCHA_SITE_KEY } from './recaptchaConfig';

const SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit';

export default function RecaptchaChallenge({ onTokenChange, onReadyChange, resetKey }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onTokenChange, onReadyChange });
  const [status, setStatus] = useState(RECAPTCHA_SITE_KEY ? 'loading' : 'unavailable');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    callbacksRef.current = { onTokenChange, onReadyChange };
  }, [onTokenChange, onReadyChange]);

  useEffect(() => {
    let active = true;
    let script = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    let timeoutId;
    const setReady = (ready) => {
      if (!active) return;
      callbacksRef.current.onReadyChange(ready);
      setStatus(ready ? 'ready' : 'error');
    };
    const handleLoad = () => {
      window.clearTimeout(timeoutId);
      const recaptcha = window.grecaptcha;
      if (!recaptcha?.render) {
        setReady(false);
        return;
      }
      recaptcha.ready(() => {
        if (!active || !containerRef.current || widgetIdRef.current !== null) return;
        try {
          widgetIdRef.current = recaptcha.render(containerRef.current, {
            sitekey: RECAPTCHA_SITE_KEY,
            callback: (token) => callbacksRef.current.onTokenChange(token),
            'expired-callback': () => callbacksRef.current.onTokenChange(''),
            'error-callback': () => {
              callbacksRef.current.onTokenChange('');
              setReady(false);
            },
          });
          setReady(true);
        } catch {
          setReady(false);
        }
      });
    };
    const handleError = () => {
      window.clearTimeout(timeoutId);
      setReady(false);
    };

    callbacksRef.current.onReadyChange(false);
    if (!RECAPTCHA_SITE_KEY) return () => {};

    if (script && retryCount > 0 && !window.grecaptcha?.render) {
      script.remove();
      script = null;
    }

    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      document.head.appendChild(script);
      timeoutId = window.setTimeout(handleError, 10000);
    } else {
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      if (window.grecaptcha?.render) handleLoad();
      else timeoutId = window.setTimeout(handleError, 10000);
    }

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
      if (widgetIdRef.current !== null) {
        window.grecaptcha?.reset(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [retryCount]);

  useEffect(() => {
    if (resetKey === 0 || widgetIdRef.current === null) return;
    callbacksRef.current.onTokenChange('');
    window.grecaptcha?.reset(widgetIdRef.current);
  }, [resetKey]);

  return (
    <div className="auth-recaptcha">
      <p className="auth-recaptcha-label">Security verification</p>
      <div className="auth-recaptcha-frame">
        <div ref={containerRef} />
      </div>
      {status === 'loading' ? <p className="auth-recaptcha-status" role="status">Loading security verification…</p> : null}
      {status === 'unavailable' ? <p className="auth-recaptcha-status" role="alert">Security verification is not configured.</p> : null}
      {status === 'error' ? (
        <div className="auth-recaptcha-error" role="alert">
          <p className="auth-recaptcha-status">
            Security verification could not load. Check your connection or browser content blockers. If it continues, confirm the site key and allowed hostname in Google reCAPTCHA settings.
          </p>
          <button className="auth-recaptcha-retry" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Retry verification
          </button>
        </div>
      ) : null}
    </div>
  );
}
