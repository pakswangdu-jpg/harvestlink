import { useEffect, useState } from 'react';
import { X, ZoomIn } from 'lucide-react';

// A plain, always-resolvable image (a public URL — unlike FilePreviewCard's private-bucket
// signed-URL case) that opens into the same full-screen lightbox on click, reusing its exact
// classes — lets an image only ever shown in a small fixed preview box (e.g. a GCash QR
// code) actually be viewed/read/scanned at full size.
export default function ZoomableImage({ src, alt, className = '' }) {
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (!isZoomed) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsZoomed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  return (
    <>
      <button
        type="button"
        className={`profile-file-image-btn ${className}`.trim()}
        onClick={() => setIsZoomed(true)}
      >
        <img src={src} alt={alt} />
        <span className="profile-file-zoom-hint"><ZoomIn size={14} /> Click to view fully</span>
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
