import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Forward, Loader2, X } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import ConversationList from '../../components/messages/ConversationList';
import ChatHeader from '../../components/messages/ChatHeader';
import OrderContextCard from '../../components/messages/OrderContextCard';
import MessageBubble from '../../components/messages/MessageBubble';
import MessageInput from '../../components/messages/MessageInput';
import TypingIndicator from '../../components/messages/TypingIndicator';
import { StartConversationState, NoConversationSelectedState } from '../../components/messages/ChatEmptyState';
import { useAuth } from '../auth/AuthContext';
import { useChatTyping } from '../../hooks/useChatTyping';
import { getUserById } from '../../services/authService';
import { getOrderById } from '../../services/orderService';
import {
  deleteMessage, editMessage, getDirectMessages, getDirectThreads, markDirectThreadRead, sendDirectMessage,
} from '../../services/messageService';
import { uploadChatAttachment } from '../../services/uploadService';
import { translateText } from '../../services/translateService';
import { getInitials } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

const LIST_POLL_MS = 4000;
const MESSAGE_POLL_MS = 3000;
const PAGE_SIZE = 30;

function pinnedStorageKey(userId) {
  return `harvestlink_pinned_threads_${userId}`;
}

function loadPinnedKeys(userId) {
  try {
    const raw = localStorage.getItem(pinnedStorageKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function savePinnedKeys(userId, keys) {
  try {
    localStorage.setItem(pinnedStorageKey(userId), JSON.stringify([...keys]));
  } catch {
    // best-effort only
  }
}

function dateSeparatorLabel(dateIso) {
  const date = new Date(dateIso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a, b) => a.toDateString() === b.toDateString();

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  const daysAgo = Math.floor((today.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
  if (daysAgo < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Merges a freshly-fetched page into existing state by id — handles new messages arriving,
// and edits/deletes to already-loaded messages, without disturbing older pages the buyer/
// farmer already scrolled up to load (infinite scroll never gets silently reset by polling).
function mergeMessages(existing, incoming) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export default function MessagesPage() {
  const { orderId, userId: directUserId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const navItems = getNavItemsForRole(currentUser.role);

  const [threads, setThreads] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedKeys, setPinnedKeys] = useState(() => loadPinnedKeys(currentUser.id));

  // Order-entry resolution — only relevant arriving via /messages/:orderId. A buyer/farmer
  // pair has exactly ONE conversation (see messageService.js), so entering from an order
  // never shows a separate thread — it shows the SAME merged conversation with that order's
  // other party, just with that specific order pinned above the messages.
  const [orderContext, setOrderContext] = useState({ key: null, order: null, otherPartyId: null, notFound: false });
  useEffect(() => {
    if (!orderId) return undefined;
    let cancelled = false;
    getOrderById(orderId).then((order) => {
      if (cancelled) return;
      const isBuyer = currentUser.id === order.buyerId;
      const isFarmer = currentUser.role === 'farmer' && currentUser.id === order.farmerId;
      if (!isBuyer && !isFarmer) {
        setOrderContext({
          key: orderId, order: null, otherPartyId: null, notFound: true,
        });
        return;
      }
      setOrderContext({
        key: orderId, order, otherPartyId: isFarmer ? order.buyerId : order.farmerId, notFound: false,
      });
    }).catch(() => {
      if (!cancelled) setOrderContext({
        key: orderId, order: null, otherPartyId: null, notFound: true,
      });
    });
    return () => { cancelled = true; };
  }, [orderId, currentUser.id, currentUser.role]);

  const isResolvingOrder = Boolean(orderId) && orderContext.key !== orderId;
  const orderNotFound = Boolean(orderId) && orderContext.key === orderId && orderContext.notFound;
  const otherPartyId = orderId ? (orderContext.key === orderId ? orderContext.otherPartyId : null) : directUserId;
  const pinnedOrder = orderId && orderContext.key === orderId ? orderContext.order : null;
  const hasActiveThread = Boolean(otherPartyId) || isResolvingOrder;
  const activeKey = otherPartyId ? `direct-${otherPartyId}` : null;

  const [messages, setMessages] = useState([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [threadDetail, setThreadDetail] = useState({ key: null, otherParty: null, notFound: false });
  const otherParty = threadDetail.key === otherPartyId ? threadDetail.otherParty : null;
  const directThreadNotFound = otherPartyId && threadDetail.key === otherPartyId && threadDetail.notFound;
  const threadNotFound = orderNotFound || directThreadNotFound;

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  // Defaults to English rather than Cebuano — this is a Cebu-based marketplace, so most
  // messages are already typed in Cebuano/Bisaya; defaulting the translate target to the
  // same language made a freshly-clicked "Translate" button look broken (same text back).
  const [targetLang, setTargetLang] = useState('en');
  const [translations, setTranslations] = useState({});

  const messageListRef = useRef(null);
  const bottomRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // --- Conversation list (left sidebar), polled the same ~4s cadence the old inbox used. ---
  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      const nextThreads = await getDirectThreads();
      if (!cancelled) setThreads(nextThreads);
    };
    reload();
    const interval = setInterval(reload, LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const combinedThreads = useMemo(() => threads.map((thread) => ({
    key: `direct-${thread.otherUserId}`,
    to: `/messages/direct/${thread.otherUserId}`,
    name: thread.otherUserName,
    subtitle: null,
    avatarUrl: thread.otherUserAvatarUrl,
    lastActiveAt: thread.otherUserLastActiveAt,
    lastMessage: thread.lastMessage,
    lastMessageAt: thread.lastMessage?.createdAt,
    unreadCount: thread.unreadCount,
  })).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()), [threads]);

  const togglePin = (key) => {
    setPinnedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      savePinnedKeys(currentUser.id, next);
      return next;
    });
  };

  // --- Active conversation: the other party's profile. ---
  useEffect(() => {
    if (!otherPartyId) return undefined;
    let cancelled = false;
    getUserById(otherPartyId).then((profile) => {
      if (!cancelled) setThreadDetail({ key: otherPartyId, otherParty: profile, notFound: false });
    }).catch(() => {
      if (!cancelled) setThreadDetail({ key: otherPartyId, otherParty: null, notFound: true });
    });
    return () => { cancelled = true; };
  }, [otherPartyId]);

  useEffect(() => {
    if (threadNotFound) navigate('/messages', { replace: true });
  }, [threadNotFound, navigate]);

  // --- Active conversation: messages, first page on switch + polling for new ones. ---
  // No "clear on inactive" branch here is intentional: `messages` only ever renders inside
  // the hasActiveThread branch of the JSX below, so leaving it stale while there's no active
  // thread is invisible — and the first successful load of a NEW thread already fully
  // replaces it (see reload's isFirstLoad branch), never merges stale content in.
  useEffect(() => {
    if (!otherPartyId || threadNotFound) return undefined;
    let cancelled = false;
    isNearBottomRef.current = true;

    const reload = async (isFirstLoad) => {
      const result = await getDirectMessages(otherPartyId, { limit: PAGE_SIZE });
      if (cancelled) return;
      setMessages((current) => (isFirstLoad ? result.messages : mergeMessages(current, result.messages)));
      if (isFirstLoad) setHasMoreOlder(result.hasMore);
      markDirectThreadRead(otherPartyId).catch(() => {});
    };

    reload(true);
    const interval = setInterval(() => reload(false), MESSAGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [otherPartyId, threadNotFound]);

  // --- Auto-scroll: always on first load / own send, only if already near bottom otherwise. ---
  useEffect(() => {
    if (isNearBottomRef.current) bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  const handleScroll = async () => {
    const container = messageListRef.current;
    if (!container) return;
    isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

    if (container.scrollTop < 80 && hasMoreOlder && !isLoadingOlder && messages.length) {
      setIsLoadingOlder(true);
      prevScrollHeightRef.current = container.scrollHeight;
      const before = messages[0].createdAt;
      const result = await getDirectMessages(otherPartyId, { before, limit: PAGE_SIZE });
      setMessages((current) => mergeMessages(current, result.messages));
      setHasMoreOlder(result.hasMore);
      setIsLoadingOlder(false);
      // Keep the buyer/farmer's view anchored on the same message after older ones are
      // prepended, instead of the scroll position jumping to the very top.
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevScrollHeightRef.current;
      });
    }
  };

  const otherPartyName = otherParty ? (otherParty.organizationName || otherParty.farmName || otherParty.name) : '';
  const { isOtherTyping, notifyTyping, notifyStoppedTyping } = useChatTyping(otherPartyId);

  // --- Compose actions ---
  const refreshMessages = async () => {
    const result = await getDirectMessages(otherPartyId, { limit: PAGE_SIZE });
    setMessages((current) => mergeMessages(current, result.messages));
  };

  const handleSendText = async (text) => {
    if (editingMessage) {
      await editMessage(editingMessage.id, text);
      setEditingMessage(null);
      await refreshMessages();
      return;
    }
    await sendDirectMessage(otherPartyId, text, replyingTo ? { replyToId: replyingTo.id } : {});
    isNearBottomRef.current = true;
    await refreshMessages();
  };

  const handleSendAttachment = async (file, caption) => {
    const isImage = file.type.startsWith('image/');
    const url = await uploadChatAttachment(file, currentUser.id);
    await sendDirectMessage(otherPartyId, caption, {
      messageType: isImage ? 'image' : 'file',
      imageUrl: isImage ? url : undefined,
      fileUrl: isImage ? undefined : url,
      fileName: isImage ? undefined : file.name,
      ...(replyingTo ? { replyToId: replyingTo.id } : {}),
    });
    isNearBottomRef.current = true;
    await refreshMessages();
  };

  const handleDelete = async (message) => {
    await deleteMessage(message.id);
    setMessages((current) => current.map((entry) => (entry.id === message.id ? { ...entry, deleted: true, text: '' } : entry)));
  };

  const handleCopy = (message) => {
    navigator.clipboard?.writeText(message.text).catch(() => {});
  };

  const handleToggleTranslate = async (message) => {
    const existing = translations[message.id];
    if (existing?.lang === targetLang && (existing.text || existing.error)) {
      setTranslations((previous) => ({ ...previous, [message.id]: { ...existing, visible: !existing.visible } }));
      return;
    }
    setTranslations((previous) => ({ ...previous, [message.id]: { visible: true, loading: true, lang: targetLang } }));
    const result = await translateText(message.text, targetLang);
    setTranslations((previous) => ({
      ...previous,
      [message.id]: result
        ? { visible: true, loading: false, lang: targetLang, text: result.translated }
        : { visible: true, loading: false, lang: targetLang, error: true },
    }));
  };

  const handleForwardTo = async (targetThread) => {
    const message = forwardingMessage;
    setForwardingMessage(null);
    if (!message) return;
    await sendDirectMessage(targetThread.key.replace('direct-', ''), message.text, {
      messageType: message.messageType,
      imageUrl: message.imageUrl || undefined,
      fileUrl: message.fileUrl || undefined,
      fileName: message.fileName || undefined,
    });
    navigate(targetThread.to);
  };

  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const viewProductsHref = otherParty ? `/marketplace?farmerId=${otherParty.id}&farmerName=${encodeURIComponent(otherPartyName)}` : null;

  return (
    <AppShell user={currentUser} navItems={navItems} title="Messages" fullBleed pageClassName="messages-page">
      <div className="messages-workspace flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
        <ConversationList
          threads={combinedThreads}
          activeKey={activeKey}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          pinnedKeys={pinnedKeys}
          onTogglePin={togglePin}
          isHiddenOnMobile={hasActiveThread}
        />

        <div className={`messages-chat-panel flex min-w-0 flex-1 flex-col ${hasActiveThread ? 'flex' : 'hidden md:flex'}`}>
          {isResolvingOrder ? (
            <div className="flex flex-1 items-center justify-center text-[var(--muted)]">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : hasActiveThread ? (
            <>
              <ChatHeader
                otherParty={otherParty}
                onBack={() => navigate('/messages')}
                isMobile
                viewProductsHref={viewProductsHref}
                targetLang={targetLang}
                onTargetLangChange={setTargetLang}
              />
              <OrderContextCard order={pinnedOrder} />

              <div ref={messageListRef} onScroll={handleScroll} className="messages-message-list flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {isLoadingOlder ? <p className="py-2 text-center text-[11px] text-[var(--muted)]">Loading earlier messages…</p> : null}
                {!messages.length ? (
                  <StartConversationState name={otherPartyName} />
                ) : (
                  messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const showDateSeparator = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                    const isMine = message.senderId === currentUser.id;
                    const translation = translations[message.id];
                    const showTranslation = Boolean(translation?.visible && translation.lang === targetLang);
                    const isLastMine = isMine && index === messages.map((m) => m.senderId).lastIndexOf(currentUser.id);

                    return (
                      <div key={message.id}>
                        {showDateSeparator ? (
                          <div className="messages-date-divider my-3 flex items-center justify-center">
                            <span className="rounded-full bg-[var(--soft)] px-3 py-1 text-[11px] font-semibold text-[var(--muted)]">
                              {dateSeparatorLabel(message.createdAt)}
                            </span>
                          </div>
                        ) : null}
                        <MessageBubble
                          message={message}
                          isMine={isMine}
                          showStatus={isLastMine}
                          replyMessage={message.replyToId ? messagesById.get(message.replyToId) : null}
                          onReply={setReplyingTo}
                          onEdit={(m) => { setEditingMessage(m); setReplyingTo(null); }}
                          onDelete={handleDelete}
                          onForward={setForwardingMessage}
                          onCopy={handleCopy}
                          translation={showTranslation ? translation : null}
                          onToggleTranslate={handleToggleTranslate}
                        />
                      </div>
                    );
                  })
                )}
                <AnimatePresence>
                  {isOtherTyping ? <TypingIndicator name={otherPartyName} /> : null}
                </AnimatePresence>
                <div ref={bottomRef} />
              </div>

              {editingMessage ? (
                <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--amber-100)] px-4 py-1.5 text-[12px] text-[var(--amber-700)]">
                  <span>Editing message</span>
                  <button type="button" onClick={() => setEditingMessage(null)} className="border-0 bg-transparent p-0 font-semibold text-[var(--amber-700)] hover:underline">Cancel</button>
                </div>
              ) : null}

              <MessageInput
                onSendText={handleSendText}
                onSendAttachment={handleSendAttachment}
                replyingTo={editingMessage ? null : replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                onTyping={notifyTyping}
                onStoppedTyping={notifyStoppedTyping}
              />
            </>
          ) : (
            <NoConversationSelectedState />
          )}
        </div>
      </div>

      <AnimatePresence>
        {forwardingMessage ? (
          <ForwardModal
            threads={combinedThreads.filter((thread) => thread.key !== activeKey)}
            onClose={() => setForwardingMessage(null)}
            onForwardTo={handleForwardTo}
          />
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}

function ForwardModal({ threads, onClose, onForwardTo }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--surface-elevated)] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--text)]"><Forward size={16} /> Forward to</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {threads.length ? threads.map((thread) => (
            <button
              key={thread.key}
              type="button"
              onClick={() => onForwardTo(thread)}
              className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-2 text-left hover:bg-[var(--soft)]"
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--green-100)] text-[12px] font-semibold text-[var(--green-800)]">
                {thread.avatarUrl ? <img src={thread.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(thread.name)}
              </span>
              <span className="text-[13px] font-semibold text-[var(--text)]">{thread.name}</span>
            </button>
          )) : <p className="px-3 py-6 text-center text-[13px] text-[var(--muted)]">No other conversations yet.</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}
