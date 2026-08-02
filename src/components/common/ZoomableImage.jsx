import { useEffect, useState } from 'react';
import { ImageOff, X, ZoomIn } from 'lucide-react';

// Mounted fresh (via the key below) whenever `src` changes, so its lazy useState initializer
// picks up the new image's load state with no effect needed to reset it.
function ZoomableImageInner({
  src, alt, className, fallbackMessage,
}) {
  const [isZoomed, setIsZoomed] = useState(false);
  // 'loading' | 'loaded' | 'error' — starts 'error' immediately for a missing src rather
  // than waiting on an <img> load attempt that was never going to succeed.
  const [status, setStatus] = useState(() => (src ? 'loading' : 'error'));

  useEffect(() => {
    if (!isZoomed) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsZoomed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  const handleLoad = () => setStatus('loaded');
  const handleError = () => {
    setStatus('error');
    console.error('ZoomableImage: image failed to load', { src, alt });
  };

  if (status === 'error') {
    return (
      <div className={`zoomable-image-error ${className}`.trim()} role="img" aria-label={fallbackMessage}>
        <ImageOff size={20} />
        <span>{fallbackMessage}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`profile-file-image-btn ${className}`.trim()}
        onClick={() => status === 'loaded' && setIsZoomed(true)}
        disabled={status !== 'loaded'}
      >
        <img src={src} alt={alt} onLoad={handleLoad} onError={handleError} style={status === 'loading' ? { visibility: 'hidden' } : undefined} />
        {status === 'loading' ? <span className="zoomable-image-loading">Loading…</span> : null}
        {status === 'loaded' ? <span className="profile-file-zoom-hint"><ZoomIn size={14} /> Click to view fully</span> : null}
      </button>

      {isZoomed ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setIsZoomed(false)}>
          <button type="button" className="image-lightbox-close" onClick={() => setIsZoomed(false)} aria-label="Close">
            <X size={22} />
          </button>
          <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </>
  );
}

// A plain, always-resolvable image (a public URL — unlike FilePreviewCard's private-bucket
// signed-URL case) that opens into the same full-screen lightbox on click, reusing its exact
// classes — lets an image only ever shown in a small fixed preview box (e.g. a GCash QR
// code) actually be viewed/read/scanned at full size. Also verifies the image actually loads
// before treating it as showable — a broken `src` renders `fallbackMessage` instead of the
// browser's own broken-image icon, and is never clickable/zoomable.
export default function ZoomableImage({ src, alt, className = '', fallbackMessage = 'Unable to load this image.' }) {
  return (
    <ZoomableImageInner
      key={src || 'none'}
      src={src}
      alt={alt}
      className={className}
      fallbackMessage={fallbackMessage}
    />
  );
}
