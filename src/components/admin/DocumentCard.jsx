import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';





export default function DocumentCard({ label, file, resolveUrl }) {
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState('');
  const isDirectUrl = Boolean(file) && (file.startsWith('data:') || /^https?:\/\//.test(file));

  const handleView = async () => {
    if (isDirectUrl) {
      window.open(file, '_blank', 'noreferrer');
      return;
    }
    if (!resolveUrl) return;
    setError('');
    setIsResolving(true);






    const newTab = window.open('', '_blank');
    if (newTab) newTab.opener = null;
    try {
      const url = await resolveUrl();
      if (!url) throw new Error('File unavailable.');
      if (newTab) newTab.location.href = url;
      else window.open(url, '_blank', 'noreferrer');
    } catch {
      setError('Unable to load this file.');
      newTab?.close();
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--soft)] text-[var(--muted)]">
            <FileText size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text)]">{label}</p>
            <div className="mt-1">
              <Badge tone={file ? 'success' : 'neutral'}>
                <span className="flex items-center gap-1">
                  {file ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  {file ? 'Uploaded' : 'Not uploaded'}
                </span>
              </Badge>
            </div>
          </div>
        </div>
        {file ? (
          <Button variant="secondary" onClick={handleView} disabled={isResolving} className="shrink-0">
            {isResolving ? 'Loading…' : 'View'} <ExternalLink size={13} />
          </Button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[12px] text-[var(--red-700)]">{error}</p> : null}
    </div>
  );
}
