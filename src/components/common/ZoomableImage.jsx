import { useEffect, useState } from 'react';
import { ImageOff, X, ZoomIn } from 'lucide-react';



function ZoomableImageInner({
  src, alt, className, fallbackMessage,
}) {
  const [isZoomed, setIsZoomed] = useState(false);


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
