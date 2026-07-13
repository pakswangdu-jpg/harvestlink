import { useEffect, useState } from 'react';
import { FileText, X, ZoomIn } from 'lucide-react';

// `file` is either:
//  - a directly-usable value: a data: URL (legacy pre-migration records) or a full
//    http(s):// URL (e.g. a public-bucket product image) — rendered/linked immediately.
//  - a private Storage bucket path (e.g. "userId/govid-xxx.jpg") — has no directly-fetchable
//    URL at all, so `resolveUrl` (an async () => signedUrl callback the caller provides —
//    see Profile.jsx / AdminDashboard.jsx) is called on demand, only when the user actually
//    clicks to view it, to fetch a short-lived signed URL first.
export default function FilePreviewCard({ label, file, resolveUrl, large = false }) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');

  const isDirectUrl = Boolean(file) && (file.startsWith('data:') || /^https?:\/\//.test(file));
  const isImage = isDirectUrl && file.startsWith('data:image');

  useEffect(() => {
    if (!isZoomed) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsZoomed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  const handleView = async () => {
    if (isDirectUrl) {
      window.open(file, '_blank', 'noreferrer');
      return;
    }
    if (!resolveUrl) return;
    setResolveError('');
    setIsResolving(true);
    try {
      const url = await resolveUrl();
      if (!url) throw new Error('File unavailable.');
      window.open(url, '_blank', 'noreferrer');
    } catch {
      setResolveError('Unable to load this file.');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className={`profile-file-card${large ? ' large' : ''}`}>
      <div className="profile-file-top">
        <span className="profile-file-icon"><FileText size={19} /></span>
        <div className="profile-file-meta">
          <strong>{label}</strong>
          <span>{file ? 'Uploaded' : 'Not provided'}</span>
        </div>
        {file && !isImage ? (
          <button type="button" className="profile-file-view-btn" onClick={handleView} disabled={isResolving}>
            {isResolving ? 'Loading…' : 'View file'}
          </button>
        ) : null}
      </div>

      {resolveError ? <small className="field-error">{resolveError}</small> : null}

      {file && isImage ? (
        <button type="button" className="profile-file-image-btn" onClick={() => setIsZoomed(true)}>
          <img src={file} alt={label} />
          <span className="profile-file-zoom-hint"><ZoomIn size={14} /> Click to view fully</span>
        </button>
      ) : null}

      {isZoomed ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={label} onClick={() => setIsZoomed(false)}>
          <button type="button" className="image-lightbox-close" onClick={() => setIsZoomed(false)} aria-label="Close">
            <X size={22} />
          </button>
          <img src={file} alt={label} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
