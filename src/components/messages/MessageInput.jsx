import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Image as ImageIcon, Loader2, Mic, Paperclip, Send, Smile, X,
} from 'lucide-react';
import EmojiPicker from './EmojiPicker';

const MAX_ATTACHMENT_MB = 10;

export default function MessageInput({
  onSendText, onSendAttachment, replyingTo, onCancelReply, disabled, onTyping, onStoppedTyping,
}) {
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const textareaRef = useRef(null);

  const pickFile = (file) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setError(`Files must be under ${MAX_ATTACHMENT_MB}MB.`);
      return;
    }
    setError('');
    setPendingFile(file);
    setPendingPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const clearPendingFile = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
  };

  const handleSend = async () => {
    if (isSending) return;
    const trimmed = draft.trim();
    if (!trimmed && !pendingFile) return;

    onStoppedTyping?.();
    setIsSending(true);
    setError('');
    try {
      if (pendingFile) {
        await onSendAttachment(pendingFile, trimmed);
        clearPendingFile();
      } else {
        await onSendText(trimmed);
      }
      setDraft('');
      onCancelReply();
    } catch (sendError) {
      setError(sendError.message || 'Could not send that — please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };

  const canSend = Boolean(draft.trim() || pendingFile) && !isSending;

  return (
    <div
      className="relative border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3"
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--green-100)]/95 text-[14px] font-semibold text-[var(--green-700)]"
          >
            Drop an image or file to attach
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {replyingTo ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex items-center justify-between gap-2 overflow-hidden rounded-lg bg-[var(--soft)] px-3 py-1.5"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--green-700)]">Replying to {replyingTo.senderName}</p>
              <p className="truncate text-[12px] text-[var(--muted)]">
                {replyingTo.messageType === 'text' ? replyingTo.text : `📎 ${replyingTo.messageType}`}
              </p>
            </div>
            <button type="button" onClick={onCancelReply} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--text)]">
              <X size={15} />
            </button>
          </motion.div>
        ) : null}

        {pendingFile ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex items-center gap-2 overflow-hidden rounded-lg bg-[var(--soft)] px-3 py-2"
          >
            {pendingPreviewUrl ? (
              <img src={pendingPreviewUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
            ) : (
              <Paperclip size={16} className="text-[var(--muted)]" />
            )}
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]">{pendingFile.name}</span>
            <button type="button" onClick={clearPendingFile} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--text)]">
              <X size={15} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? <p className="mb-2 text-[12px] text-[var(--red-700)]">{error}</p> : null}

      <div className="flex items-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--soft)] hover:text-[var(--green-700)]"
          >
            <Smile size={19} />
          </button>
          <AnimatePresence>
            {showEmoji ? (
              <EmojiPicker
                onClose={() => setShowEmoji(false)}
                onSelect={(emoji) => {
                  setDraft((current) => `${current}${emoji}`);
                  textareaRef.current?.focus();
                }}
              />
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--soft)] hover:text-[var(--green-700)]"
        >
          <ImageIcon size={19} />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => pickFile(event.target.files?.[0])} />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--soft)] hover:text-[var(--green-700)]"
        >
          <Paperclip size={19} />
        </button>
        <input ref={fileInputRef} type="file" hidden onChange={(event) => pickFile(event.target.files?.[0])} />

        <div className="flex-1 rounded-2xl bg-[var(--soft)] px-4 py-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); onTyping?.(); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            className="max-h-28 w-full resize-none bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
            style={{ minHeight: '22px' }}
          />
        </div>

        <button
          type="button"
          disabled
          title="Voice messages are coming soon"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)]"
        >
          <Mic size={19} />
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[var(--green-800)] p-0 text-white shadow-sm transition-all duration-150 hover:bg-[var(--green-700)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted)]"
        >
          {isSending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}
