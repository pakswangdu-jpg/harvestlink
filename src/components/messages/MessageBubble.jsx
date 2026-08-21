import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check, CheckCheck, Copy, Download, Forward, Globe, MoreHorizontal, Pencil, Reply, Trash2, File as FileIcon,
} from 'lucide-react';

function BubbleTimestamp({ message, isMine, showStatus }) {
  const time = new Date(message.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className={`mt-1 flex items-center gap-1 text-[11px] ${isMine ? 'justify-end text-emerald-100' : 'text-[var(--muted)]'}`}>
      {message.edited ? <span className="italic">Edited</span> : null}
      <span>{time}</span>
      {/* Seen/Sent are real states derived from the same `read` flag the inbox unread badge
          already uses — "Delivered" would need a live socket layer to mean anything real,
          so it's deliberately not shown here yet (see the fast-follow plan). */}
      {isMine && showStatus ? (
        message.read ? <CheckCheck size={13} className="text-sky-200" /> : <Check size={13} />
      ) : null}
    </div>
  );
}

function ReplyPreview({ replyMessage, isMine }) {
  if (!replyMessage) return null;
  return (
    <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[12px] ${
      isMine ? 'border-emerald-200 bg-emerald-800/30 text-emerald-50' : 'border-[var(--green-600)] bg-[var(--green-50)] text-[var(--muted)]'
    }`}
    >
      <p className="font-semibold">{replyMessage.senderName}</p>
      <p className="truncate opacity-90">
        {replyMessage.deleted ? 'This message was deleted' : replyMessage.messageType === 'text' ? replyMessage.text : `📎 ${replyMessage.messageType}`}
      </p>
    </div>
  );
}

const MENU_ITEM_CLASS = 'flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-[13px] text-[var(--text)] hover:bg-[var(--soft)]';

export default function MessageBubble({
  message, isMine, replyMessage, showStatus, onReply, onEdit, onDelete, onForward, onCopy, translation, onToggleTranslate,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canTranslate = !isMine && message.messageType === 'text' && message.text;
  const showTranslation = Boolean(translation?.visible);

  if (message.deleted) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-1`}>
        <p className="rounded-3xl bg-[var(--soft)] px-4 py-2.5 text-[13px] italic text-[var(--muted)]">This message was deleted</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`group flex items-end gap-1.5 px-1 ${isMine ? 'justify-end' : 'justify-start'}`}
    >
      {!isMine ? <div className="w-6 shrink-0" /> : null}

      <div className="relative max-w-[75%] sm:max-w-[65%]">
        <div className={`rounded-3xl px-4 py-2.5 shadow-sm ${
          isMine
            ? 'rounded-br-lg bg-[var(--green-800)] text-white'
            : 'rounded-bl-lg border border-[var(--line)] bg-[var(--soft)] text-[var(--text)]'
        }`}
        >
          <ReplyPreview replyMessage={replyMessage} isMine={isMine} />

          {message.messageType === 'image' && message.imageUrl ? (
            <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
              <img src={message.imageUrl} alt="Attachment" className="max-h-64 w-full object-cover transition-transform duration-200 hover:scale-[1.02]" />
            </a>
          ) : null}

          {message.messageType === 'file' && message.fileUrl ? (
            <a
              href={message.fileUrl}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${isMine ? 'bg-emerald-800/40' : 'bg-[var(--panel)] border border-[var(--line)]'}`}
            >
              <FileIcon size={20} className={isMine ? 'text-emerald-100' : 'text-[var(--muted)]'} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{message.fileName || 'Attachment'}</span>
              <Download size={15} className={isMine ? 'text-emerald-100' : 'text-[var(--muted)]'} />
            </a>
          ) : null}

          {message.text ? (
            <p className={`whitespace-pre-wrap break-words text-[14px] leading-relaxed ${message.messageType !== 'text' ? 'mt-1.5' : ''}`}>
              {message.text}
            </p>
          ) : null}

          {showTranslation ? (
            <div className="mt-1.5 border-t border-[var(--line)] pt-1.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                <Globe size={10} /> Translated
              </p>
              <p className="mt-0.5 text-[13px] italic leading-relaxed text-[var(--muted)]">
                {translation.loading ? 'Translating…' : translation.error ? 'Translation unavailable.' : translation.text}
              </p>
            </div>
          ) : null}

          <BubbleTimestamp message={message} isMine={isMine} showStatus={showStatus} />
        </div>

        {/* Hover action menu — reply/copy/forward always available; translate only on the
            other party's text messages; edit/delete only on own text messages, matching the
            backend's own edit/delete scope. */}
        <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${isMine ? '-left-8' : '-right-8'}`}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-7 w-7 items-center justify-center rounded-full border-0 bg-[var(--panel)] p-0 text-[var(--muted)] shadow-sm ring-1 ring-[var(--line)] hover:text-[var(--text)]"
          >
            <MoreHorizontal size={15} />
          </button>
          {menuOpen ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`absolute top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-elevated)] py-1 shadow-lg ${isMine ? 'right-0' : 'left-0'}`}
            >
              <button type="button" onClick={() => { onReply(message); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>
                <Reply size={14} /> Reply
              </button>
              {canTranslate ? (
                <button type="button" onClick={() => { onToggleTranslate(message); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>
                  <Globe size={14} /> {showTranslation ? 'Hide translation' : 'Translate'}
                </button>
              ) : null}
              {message.messageType === 'text' ? (
                <button type="button" onClick={() => { onCopy(message); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>
                  <Copy size={14} /> Copy
                </button>
              ) : null}
              <button type="button" onClick={() => { onForward(message); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>
                <Forward size={14} /> Forward
              </button>
              {isMine && message.messageType === 'text' ? (
                <button type="button" onClick={() => { onEdit(message); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>
                  <Pencil size={14} /> Edit
                </button>
              ) : null}
              {isMine ? (
                <button type="button" onClick={() => { onDelete(message); setMenuOpen(false); }} className={`${MENU_ITEM_CLASS} text-[var(--red-700)] hover:bg-[var(--red-100)]`}>
                  <Trash2 size={14} /> Delete
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
