import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Languages, Send, Store } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { getUserById } from '../../services/authService';
import { getDirectMessages, markDirectThreadRead, sendDirectMessage } from '../../services/messageService';
import { MESSAGE_TRANSLATION_LANGUAGES, translateText } from '../../services/translateService';
import { formatDate, formatRelativeTime, getInitials, isRecentlyActive } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

// A general, order-independent conversation with another account — reached from a map pin
// (or the inbox once one exists). Mirrors MessageThread.jsx's chat UI, minus everything
// that only makes sense in the context of a specific order (status, receipt, product name).
export default function DirectMessageThread() {
  const { userId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [otherParty, setOtherParty] = useState(null);
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [targetLang, setTargetLang] = useState('ceb');
  const [translations, setTranslations] = useState({});
  const bottomRef = useRef(null);

  // Messenger-style presence + profile display name, polled the same ~4s cadence as the
  // message reload below so it stays live while the chat is open.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const reload = () => {
      getUserById(userId)
        .then((profile) => {
          if (cancelled) return;
          setOtherParty(profile);
          setNotFound(false);
          setLoadedUserId(userId);
        })
        .catch(() => {
          if (cancelled) return;
          setNotFound(true);
          setLoadedUserId(userId);
        });
    };
    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || notFound) return undefined;
    let cancelled = false;
    const reload = async () => {
      const next = await getDirectMessages(userId);
      if (cancelled) return;
      setMessages(next);
      markDirectThreadRead(userId).catch(() => {});
    };
    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId, notFound]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  if (loadedUserId !== userId) return null;
  if (notFound) return <Navigate to="/messages" replace />;

  const navItems = getNavItemsForRole(currentUser.role);
  const otherPartyName = otherParty ? (otherParty.organizationName || otherParty.farmName || otherParty.name) : '';
  // Whichever side of the chat is a farmer, the other person gets a shortcut straight to
  // their listings — same as the order-based chat's "View products" link, just keyed off
  // the other party's actual role instead of the order's fixed buyer/farmer pair, so it
  // shows up correctly for either direction of a farmer<->farmer, buyer<->farmer, or
  // stakeholder<->farmer conversation.
  const shouldShowViewProducts = otherParty?.role === 'farmer';
  const online = isRecentlyActive(otherParty?.lastActiveAt);
  const presenceLabel = online
    ? 'Active now'
    : otherParty?.lastActiveAt
      ? `Active ${formatRelativeTime(otherParty.lastActiveAt)}`
      : 'Offline';

  const handleSend = async (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    try {
      setSendError('');
      await sendDirectMessage(userId, draft);
      setDraft('');
      setMessages(await getDirectMessages(userId));
    } catch (error) {
      setSendError(error.message);
    }
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

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={otherParty ? `Chat with ${otherPartyName}` : 'Chat'}
      subtitle="Direct message"
    >
      <section className="panel chat-panel">
        <div className="chat-header-row">
          <span className="chat-presence">
            <span className="farmer-list-avatar">
              {otherParty ? (
                otherParty.avatarUrl ? <img src={otherParty.avatarUrl} alt="" /> : getInitials(otherPartyName)
              ) : null}
            </span>
            <span className={`presence-dot ${online ? 'online' : 'offline'}`} /> {presenceLabel}
          </span>
          <div className="chat-header-actions">
            {shouldShowViewProducts ? (
              <Link
                className="btn btn-secondary btn-sm"
                to={`/marketplace?farmerId=${otherParty.id}&farmerName=${encodeURIComponent(otherPartyName)}`}
              >
                <Store size={14} /> View products
              </Link>
            ) : null}
            <label className="chat-lang-select" htmlFor="translate-lang">
              <Languages size={14} />
              <select id="translate-lang" value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
                {MESSAGE_TRANSLATION_LANGUAGES.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="chat-thread">
          {messages.length ? (
            messages.map((message) => {
              const translation = translations[message.id];
              const showTranslation = Boolean(translation?.visible && translation.lang === targetLang);
              return (
                <div key={message.id} className={`chat-bubble ${message.senderId === currentUser.id ? 'mine' : 'theirs'}`}>
                  <p>{message.text}</p>
                  {showTranslation ? (
                    <p className="chat-translation">
                      {translation.loading ? 'Translating…' : translation.error ? 'Translation unavailable.' : translation.text}
                    </p>
                  ) : null}
                  <div className="chat-bubble-footer">
                    <small>{formatDate(message.createdAt)}</small>
                    <button type="button" className="chat-translate-btn" onClick={() => handleToggleTranslate(message)}>
                      <Languages size={11} /> {showTranslation ? 'Hide translation' : 'Translate'}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="muted">No messages yet — say hello.</p>
          )}
          <div ref={bottomRef} />
        </div>
        {sendError ? <div className="form-alert error">{sendError}</div> : null}
        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message ${otherPartyName || ''}...`}
          />
          <Button type="submit">
            <Send size={16} />
          </Button>
        </form>
      </section>

      <Button variant="ghost" onClick={() => navigate('/messages')}>Back to messages</Button>
    </AppShell>
  );
}
