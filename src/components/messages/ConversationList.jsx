import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pin, Search } from 'lucide-react';
import { formatRelativeTime, getInitials, isRecentlyActive, shortOrderId } from '../../utils/formatters';

function lastMessagePreview(lastMessage) {
  if (!lastMessage) return 'No messages yet — say hello.';
  if (lastMessage.deleted) return 'Message deleted';
  if (lastMessage.messageType === 'image') return lastMessage.text ? `📷 ${lastMessage.text}` : '📷 Photo';
  if (lastMessage.messageType === 'file') return `📎 ${lastMessage.fileName || 'File'}`;
  return lastMessage.text;
}

function ConversationRow({ thread, isActive, isPinned, onTogglePin }) {
  const online = isRecentlyActive(thread.lastActiveAt);
  return (
    <Link
      to={thread.to}
      className={`messages-conversation-row group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 ${
        isActive ? 'bg-[var(--green-100)]' : 'hover:bg-[var(--soft)]'
      }`}
    >
      <div className="relative shrink-0">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--green-100)] text-[13px] font-semibold text-[var(--green-800)]">
          {thread.avatarUrl ? <img src={thread.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(thread.name)}
        </div>
        <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--panel)] ${online ? 'bg-[var(--green-700)]' : 'bg-[var(--line)]'}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-[14px] ${thread.unreadCount ? 'font-bold text-[var(--text)]' : 'font-semibold text-[var(--text)]'}`}>
            {thread.name}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-[11px] text-[var(--muted)]">{formatRelativeTime(thread.lastMessageAt)}</span>
            <button
              type="button"
              onClick={(event) => { event.preventDefault(); onTogglePin(thread.key); }}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--soft)] hover:text-[var(--green-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--green-700)] ${isPinned ? 'text-[var(--green-700)]' : ''}`}
              title={isPinned ? 'Unpin' : 'Pin conversation'}
              aria-label={isPinned ? `Unpin ${thread.name}` : `Pin ${thread.name}`}
              aria-pressed={isPinned}
            >
              <Pin size={13} className={isPinned ? 'fill-[var(--green-700)]' : ''} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-[var(--muted)]">
            {thread.subtitle || 'Conversation'}
            {thread.lastOrder ? ` · ${thread.lastOrder.productName} · #${shortOrderId(thread.lastOrder.id)}` : ''}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-[13px] ${thread.unreadCount ? 'font-medium text-[var(--text)]' : 'text-[var(--muted)]'}`}>
            {lastMessagePreview(thread.lastMessage)}
          </p>
          {thread.unreadCount ? (
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[var(--green-800)] px-1.5 text-[11px] font-bold text-white">
              {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
            </span>
          ) : null}
        </div>
      </div>

    </Link>
  );
}

export default function ConversationList({
  threads, activeKey, searchQuery, onSearchChange, pinnedKeys, onTogglePin, isHiddenOnMobile,
  isLoading, unavailable, onRetry,
}) {
  const [filter, setFilter] = useState('all');
  const query = searchQuery.trim().toLowerCase();
  const searched = query
    ? threads.filter((thread) => `${thread.name} ${thread.subtitle || ''} ${lastMessagePreview(thread.lastMessage)}`
      .toLowerCase().includes(query))
    : threads;
  const filtered = filter === 'unread' ? searched.filter((thread) => thread.unreadCount > 0) : searched;
  const pinned = filtered.filter((thread) => pinnedKeys.has(thread.key));
  const rest = filtered.filter((thread) => !pinnedKeys.has(thread.key));

  return (
    <div className={`messages-conversation-list flex w-full shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] md:w-[360px] ${isHiddenOnMobile ? 'hidden md:flex' : 'flex'}`}>
      <div className="messages-list-header shrink-0 border-b border-[var(--line)] px-4 py-4">
        <h1 className="text-[20px] font-semibold text-[var(--text)]">Messages</h1>
        <div className="relative mt-3">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-lg bg-[var(--soft)] py-2 pl-9 pr-3 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--green-700)]/20"
          />
        </div>
        <div className="messages-list-filters mt-3 flex items-center gap-1" aria-label="Filter conversations">
          {['all', 'unread'].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={`rounded-md border-0 px-2.5 py-1 text-[12px] font-medium capitalize ${
                filter === option ? 'bg-[var(--green-50)] text-[var(--green-700)]' : 'bg-transparent text-[var(--muted)] hover:bg-[var(--soft)]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && !threads.length ? (
          <p className="messages-inline-status px-3 py-6 text-center text-[13px] text-[var(--muted)]">Loading conversations…</p>
        ) : unavailable && !threads.length ? (
          <div className="messages-list-empty px-5 py-10 text-center">
            <p className="text-[14px] font-medium text-[var(--text)]">Couldn’t load conversations</p>
            <button type="button" onClick={onRetry} className="mt-2 border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--green-700)] hover:underline">Try again</button>
          </div>
        ) : !filtered.length ? (
          <div className="messages-list-empty px-5 py-10 text-center">
            <p className="text-[14px] font-medium text-[var(--text)]">
              {query ? 'No conversations found' : filter === 'unread' && threads.length ? 'No unread conversations' : 'No conversations yet'}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
              {query ? 'Try a different name or keyword.' : filter === 'unread' && threads.length ? 'You’re all caught up.' : 'Messages with Farmers, Buyers, or Partners will appear here.'}
            </p>
          </div>
        ) : (
          <>
            {unavailable ? <p className="messages-inline-status px-3 pb-2 text-[11px] text-[var(--muted)]">Reconnecting…</p> : null}
            {pinned.length ? (
              <div className="mb-1">
                <p className="px-3 py-1 text-[11px] font-medium text-[var(--muted)]">Pinned</p>
                <div className="flex flex-col gap-0.5">
                  {pinned.map((thread) => (
                    <motion.div key={thread.key} layout>
                      <ConversationRow thread={thread} isActive={thread.key === activeKey} isPinned onTogglePin={onTogglePin} />
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {rest.map((thread) => (
                <motion.div key={thread.key} layout>
                  <ConversationRow thread={thread} isActive={thread.key === activeKey} isPinned={false} onTogglePin={onTogglePin} />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
