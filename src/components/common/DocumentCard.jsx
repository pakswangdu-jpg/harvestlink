import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import Button from './Button';

// A simpler, "here's the document, go view it" card — distinct from FilePreviewCard (shared
// with the farmer/buyer/stakeholder's own Profile page, which also handles inline image
// zoom/lightbox); this one is scoped to the admin's read-only document review.
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
    // blocker requires), which is exactly why "View Document" silently did nothing on mobile
    // for any private file needing a signed URL first — the fast direct-URL path above never
    // hit this since it has no await before the open.
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
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--soft)] text-[var(--muted)]">
            <FileText size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[var(--text)]">{label}</p>
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${file ? 'bg-[var(--green-50)] text-[var(--green-700)]' : 'bg-[var(--soft)] text-[var(--muted)]'}`}>
              {file ? <CheckCircle2 size={12} strokeWidth={2} /> : <AlertCircle size={12} strokeWidth={2} />}
              {file ? 'Uploaded' : 'Not uploaded'}
            </span>
          </div>
        </div>
        {file ? (
          <Button variant="secondary" size="sm" onClick={handleView} disabled={isResolving} className="shrink-0 gap-1.5">
            {isResolving ? 'Loading…' : 'View Document'} <ExternalLink size={14} strokeWidth={2} />
          </Button>
        ) : null}
      </div>
      {error ? <small className="field-error">{error}</small> : null}
    </motion.div>
  );
}
