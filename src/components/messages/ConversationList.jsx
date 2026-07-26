import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pin, Search } from 'lucide-react';
import { formatRelativeTime, getInitials, isRecentlyActive } from '../../utils/formatters';

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
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 ${
        isActive ? 'bg-emerald-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className="relative shrink-0">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[13px] font-semibold text-emerald-800">
          {thread.avatarUrl ? <img src={thread.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(thread.name)}
        </div>
        <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-[14px] ${thread.unreadCount ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
            {thread.name}
          </p>
          <span className="shrink-0 text-[11px] text-gray-400">{formatRelativeTime(thread.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-[13px] ${thread.unreadCount ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>
            {thread.subtitle ? <span className="text-gray-400">{thread.subtitle} · </span> : null}
            {lastMessagePreview(thread.lastMessage)}
          </p>
          {thread.unreadCount ? (
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#166534] px-1.5 text-[11px] font-bold text-white">
              {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => { event.preventDefault(); onTogglePin(thread.key); }}
        className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 text-gray-300 opacity-0 transition-opacity duration-150 hover:bg-gray-100 hover:text-emerald-700 group-hover:opacity-100 ${isPinned ? 'opacity-100 text-emerald-600' : ''}`}
        title={isPinned ? 'Unpin' : 'Pin conversation'}
      >
        <Pin size={13} className={isPinned ? 'fill-emerald-600' : ''} />
      </button>
    </Link>
  );
}

export default function ConversationList({
  threads, activeKey, searchQuery, onSearchChange, pinnedKeys, onTogglePin, isHiddenOnMobile,
}) {
  const filtered = searchQuery.trim()
    ? threads.filter((thread) => thread.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : threads;
  const pinned = filtered.filter((thread) => pinnedKeys.has(thread.key));
  const rest = filtered.filter((thread) => !pinnedKeys.has(thread.key));

  return (
    <div className={`flex w-full shrink-0 flex-col border-r border-gray-100 bg-white md:w-[360px] ${isHiddenOnMobile ? 'hidden md:flex' : 'flex'}`}>
      <div className="shrink-0 border-b border-gray-100 px-4 py-4">
        <h1 className="text-[20px] font-bold text-gray-900">Messages</h1>
        <div className="relative mt-3">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-full bg-gray-100 py-2 pl-9 pr-3 text-[13px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!filtered.length ? (
          <p className="px-3 py-6 text-center text-[13px] text-gray-400">No conversations found.</p>
        ) : (
          <>
            {pinned.length ? (
              <div className="mb-1">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pinned</p>
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
