import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Loader2, Package, Paperclip, Send, ShoppingBag, Smile, Store, X,
} from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { formatCurrency } from '../../utils/formatters';

const MAX_ATTACHMENT_MB = 10;

export default function MessageInput({
  onSendText, onSendAttachment, replyingTo, onCancelReply, disabled, onTyping, onStoppedTyping,
  initialDraft = '', suggestedMessages = [], productContext = null, onRemoveProductContext,
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showProductShareCard, setShowProductShareCard] = useState(Boolean(productContext));
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
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

  const handleSendProductInquiry = async () => {
    if (isSending || disabled || !productContext) return;
    const text = draft.trim() || suggestedMessages[0] || `Hi! I'm interested in ${productContext.productName || 'this product'}.`;
    onStoppedTyping?.();
    setIsSending(true);
    setError('');
    try {
      await onSendText(text, productContext);
      setDraft('');
      setShowProductShareCard(false);
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
      className="messages-composer relative border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3"
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

      {productContext ? (
        <div className="messages-product-actions mb-2 flex items-center gap-2" aria-label="Product actions">
          <button
            type="button"
            onClick={() => setShowProductShareCard((open) => !open)}
            disabled={disabled || isSending}
            aria-expanded={showProductShareCard}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border-0 bg-[var(--soft)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--line)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShoppingBag size={18} aria-hidden="true" />
            Send product
          </button>
          {productContext.farmerId ? (
            <Link
              to={`/farmers/${productContext.farmerId}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border-0 bg-[var(--soft)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--line)]"
            >
              <Store size={18} aria-hidden="true" />
              Visit store
            </Link>
          ) : null}
        </div>
      ) : null}

      {productContext && showProductShareCard ? (
        <div className="messages-product-share-card mb-2 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3" aria-label={`Product to send: ${productContext.productName || 'Product listing'}`}>
          <div className="messages-product-share-image flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--soft)] text-[var(--muted)]">
            {productContext.imageUrl
              ? <img src={productContext.imageUrl} alt="" className="h-full w-full object-cover" />
              : <Package size={22} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="messages-product-share-name line-clamp-2 text-base font-semibold leading-snug text-[var(--text)]">{productContext.productName || 'Product listing'}</p>
            <p className="messages-product-share-category mt-0.5 truncate text-sm text-[var(--muted)]">{productContext.category || productContext.farmerFarmName || productContext.farmerName || 'Farmer listing'}</p>
            <p className="messages-product-share-price mt-1 truncate text-sm font-medium text-[var(--text-secondary)]">
              {productContext.price != null ? `${formatCurrency(productContext.price)} / ${productContext.unit || 'unit'}` : ''}
              {productContext.price != null && productContext.availableQuantity != null ? ' · ' : ''}
              {productContext.availableQuantity != null
                ? Number(productContext.availableQuantity) <= 0
                  ? 'Out of stock'
                  : `${productContext.availableQuantity} ${productContext.unit || 'available'}`
                : ''}
            </p>
          </div>
          {onRemoveProductContext ? (
            <button
              type="button"
              onClick={onRemoveProductContext}
              disabled={disabled || isSending}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--text)]"
              aria-label="Remove product from message"
            >
              <X size={18} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSendProductInquiry}
            disabled={disabled || isSending}
            className="messages-product-share-send min-h-11 shrink-0 rounded-lg border-0 bg-[var(--green-700)] px-5 text-base font-semibold text-white hover:bg-[var(--green-800)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? <Loader2 size={16} className="animate-spin" aria-label="Sending product" /> : 'Send'}
          </button>
        </div>
      ) : null}

      {suggestedMessages.length ? (
        <div className="messages-suggestion-list mb-2 flex flex-wrap items-start gap-1.5" aria-label="Suggested opening messages. Swipe horizontally on mobile to see more.">
          {suggestedMessages.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setDraft(suggestion);
                textareaRef.current?.focus();
              }}
              disabled={disabled || isSending}
              className="messages-suggestion shrink-0 rounded-full border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--green-700)] hover:text-[var(--green-700)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

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
            className="max-h-28 w-full resize-none bg-transparent text-[15px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
            style={{ minHeight: '22px' }}
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="messages-send-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[var(--green-800)] p-0 text-white shadow-sm transition-all duration-150 hover:bg-[var(--green-700)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted)]"
        >
          {isSending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}
