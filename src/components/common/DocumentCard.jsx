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
    try {
      const url = await resolveUrl();
      if (!url) throw new Error('File unavailable.');
      window.open(url, '_blank', 'noreferrer');
    } catch {
      setError('Unable to load this file.');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
            <FileText size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-gray-900">{label}</p>
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${file ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
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
