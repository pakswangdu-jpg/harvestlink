import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, X, ZoomIn } from 'lucide-react';








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






    const newTab = window.open('', '_blank');
    if (newTab) newTab.opener = null;
    try {
      const url = await resolveUrl();
      if (!url) throw new Error('File unavailable.');
      if (newTab) newTab.location.href = url;
      else window.open(url, '_blank', 'noreferrer');
    } catch {
      setResolveError('Unable to load this file.');
      newTab?.close();
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className={`profile-file-card${large ? ' large' : ''}${file ? '' : ' empty'}`}>
      <div className="profile-file-top">
        <span className="profile-file-icon"><FileText size={19} /></span>
        <div className="profile-file-meta">
          <strong>{label}</strong>
          <span className={`profile-file-status ${file ? 'uploaded' : 'missing'}`}>
            {file ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {file ? 'Uploaded' : 'Not uploaded'}
          </span>
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
