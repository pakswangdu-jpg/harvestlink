import { useEffect, useRef, useState } from 'react';
import './RecaptchaChallenge.css';
import { useTheme } from '../../contexts/ThemeContext';
import { RECAPTCHA_SITE_KEY } from './recaptchaConfig';
import { loadRecaptchaApi } from './recaptchaLoader';

function logDiagnostic(message, details) {
  console.info('[reCAPTCHA]', message, details);
}

export default function RecaptchaChallenge({ onTokenChange, onReadyChange, resetKey }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onTokenChange, onReadyChange });
  const [status, setStatus] = useState(RECAPTCHA_SITE_KEY ? 'loading' : 'unconfigured');
  const [expired, setExpired] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { effectiveTheme } = useTheme();

  useEffect(() => {
    callbacksRef.current = { onTokenChange, onReadyChange };
  }, [onTokenChange, onReadyChange]);

  useEffect(() => {
    logDiagnostic('configuration', {
      siteKeyConfigured: Boolean(RECAPTCHA_SITE_KEY),
      hostname: window.location.hostname,
    });
  }, []);

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    const setReady = (ready, nextStatus) => {
      if (!active) return;
      callbacksRef.current.onReadyChange(ready);
      setStatus(nextStatus || (ready ? 'ready' : 'render-error'));
    };
    const handleExpired = () => {
      callbacksRef.current.onTokenChange('');
      setExpired(true);
      if (widgetIdRef.current !== null) window.grecaptcha?.reset(widgetIdRef.current);
    };

    callbacksRef.current.onReadyChange(false);
    callbacksRef.current.onTokenChange('');
    if (!RECAPTCHA_SITE_KEY) {
      logDiagnostic('site key missing', { hostname: window.location.hostname });
      return () => {};
    }

    loadRecaptchaApi().then((recaptcha) => {
      if (!active || !container || widgetIdRef.current !== null) return;
      logDiagnostic('API ready', { scriptLoaded: true, apiReady: true });
      try {
        widgetIdRef.current = recaptcha.render(container, {
          sitekey: RECAPTCHA_SITE_KEY,
          theme: effectiveTheme === 'dark' ? 'dark' : 'light',
          callback: (token) => {
            setExpired(false);
            callbacksRef.current.onTokenChange(token);
          },
          'expired-callback': handleExpired,
          'error-callback': () => {
            callbacksRef.current.onTokenChange('');
            setReady(false, 'render-error');
          },
        });
        setReady(true);
        logDiagnostic('widget rendered', { rendered: true });
      } catch {
        setReady(false, 'render-error');
        logDiagnostic('widget render failed', { rendered: false });
      }
    }).catch(() => {
      if (!active) return;
      setReady(false, 'script-error');
      logDiagnostic('script load failed', { scriptLoaded: false, apiReady: false });
    });

    return () => {
      active = false;
      if (widgetIdRef.current !== null) {
        window.grecaptcha?.reset(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      container?.replaceChildren();
    };
  }, [retryCount, effectiveTheme]);

  useEffect(() => {
    if (resetKey === 0 || widgetIdRef.current === null) return;
    callbacksRef.current.onTokenChange('');
    setExpired(false);
    window.grecaptcha?.reset(widgetIdRef.current);
  }, [resetKey]);

  return (
    <div className="auth-recaptcha">
      <p className="auth-recaptcha-label">Security verification</p>
      <div className="auth-recaptcha-frame">
        <div ref={containerRef} />
      </div>
      {status === 'loading' ? <p className="auth-recaptcha-status" role="status">Loading security verification…</p> : null}
      {status === 'unconfigured' ? <p className="auth-recaptcha-status" role="alert">Security verification is not configured for this environment.</p> : null}
      {expired ? <p className="auth-recaptcha-status" role="status">Security verification expired. Please verify again.</p> : null}
      {status === 'script-error' || status === 'render-error' ? (
        <div className="auth-recaptcha-error" role="alert">
          <p className="auth-recaptcha-status">
            {status === 'script-error'
              ? 'Security verification could not load. Check your connection or browser content blockers.'
              : 'Security verification could not be initialized. Please try again.'}
          </p>
          <button
            className="auth-recaptcha-retry"
            type="button"
            onClick={() => {
              setExpired(false);
              setStatus('loading');
              callbacksRef.current.onReadyChange(false);
              callbacksRef.current.onTokenChange('');
              setRetryCount((count) => count + 1);
            }}
          >
            Retry verification
          </button>
        </div>
      ) : null}
    </div>
  );
}
