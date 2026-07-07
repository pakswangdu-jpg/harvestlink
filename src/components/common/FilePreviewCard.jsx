import { useEffect, useState } from 'react';
import { FileText, X, ZoomIn } from 'lucide-react';

export default function FilePreviewCard({ label, file, large = false }) {
  const [isZoomed, setIsZoomed] = useState(false);
  const isImage = Boolean(file) && file.startsWith('data:image');

  useEffect(() => {
    if (!isZoomed) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsZoomed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  return (
    <div className={`profile-file-card${large ? ' large' : ''}`}>
      <div className="profile-file-top">
        <span className="profile-file-icon"><FileText size={19} /></span>
        <div className="profile-file-meta">
          <strong>{label}</strong>
          <span>{file ? 'Uploaded' : 'Not provided'}</span>
        </div>
        {file && !isImage ? <a href={file} target="_blank" rel="noreferrer">View file</a> : null}
      </div>

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
