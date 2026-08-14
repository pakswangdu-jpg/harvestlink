import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';

// Admin-scoped equivalent of src/components/common/DocumentCard.jsx (kept separate so this
// section's flatter styling never affects that component's other caller, Profile.jsx) — same
// resolveUrl/isDirectUrl behavior: open a direct URL immediately, or resolve a signed one
// first for a private-bucket file.
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
    // Opened blank, synchronously, in the same tick as the click — then redirected once the
    // signed URL resolves. Mobile Safari/Chrome block a window.open() that happens after an
    // await (crossing an async boundary drops it from the "trusted user gesture" the popup
    // blocker requires), which is exactly why "View" silently did nothing on mobile for any
    // private file needing a signed URL first — the fast direct-URL path above never hit
    // this since it has no await before the open.
    const newTab = window.open('', '_blank');
    if (newTab) newTab.opener = null; // same tabnabbing guard 'noreferrer' gives, without losing the reference this needs
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
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
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
