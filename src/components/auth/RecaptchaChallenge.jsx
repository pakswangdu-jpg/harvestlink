import { useEffect, useRef, useState } from 'react';
import './RecaptchaChallenge.css';
import { RECAPTCHA_SITE_KEY } from './recaptchaConfig';

const SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit';

export default function RecaptchaChallenge({ onTokenChange, onReadyChange, resetKey }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onTokenChange, onReadyChange });
  const [status, setStatus] = useState(RECAPTCHA_SITE_KEY ? 'loading' : 'unavailable');

  useEffect(() => {
    callbacksRef.current = { onTokenChange, onReadyChange };
  }, [onTokenChange, onReadyChange]);

  useEffect(() => {
    let active = true;
    let script = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    const setReady = (ready) => {
      if (!active) return;
      callbacksRef.current.onReadyChange(ready);
      setStatus(ready ? 'ready' : 'error');
    };
    const handleLoad = () => {
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
    const handleError = () => setReady(false);

    callbacksRef.current.onReadyChange(false);
    if (!RECAPTCHA_SITE_KEY) return () => {};

    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      if (window.grecaptcha?.render) handleLoad();
    }

    return () => {
      active = false;
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
      if (widgetIdRef.current !== null) {
        window.grecaptcha?.reset(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

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
      {status === 'error' ? <p className="auth-recaptcha-status" role="alert">Security verification could not load. Check your connection and try again.</p> : null}
    </div>
  );
}
