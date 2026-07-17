import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Languages, Send, Store } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { getOrderById } from '../../services/orderService';
import { getUserById } from '../../services/authService';
import { getMessagesForOrder, markThreadRead, sendMessage } from '../../services/messageService';
import { MESSAGE_TRANSLATION_LANGUAGES, translateText } from '../../services/translateService';
import { formatDate, formatRelativeTime, isRecentlyActive } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function MessageThread() {
  const { orderId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loadedOrderId, setLoadedOrderId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otherParty, setOtherParty] = useState(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [targetLang, setTargetLang] = useState('ceb');
  const [translations, setTranslations] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getOrderById(orderId)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
        setLoadedOrderId(orderId);
      })
      .catch(() => {
        if (cancelled) return;
        setOrder(null);
        setLoadedOrderId(orderId);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // "Buyer" here means "the account that placed this order" — a partner organization
  // checking out through the marketplace is just as much the buyer as a buyer-role
  // account is, so this checks id ownership, not the literal account role.
  const isBuyer = order && currentUser.id === order.buyerId;
  const isFarmer = order && currentUser.role === 'farmer' && currentUser.id === order.farmerId;
  const canView = Boolean(isBuyer || isFarmer);

  // Messenger-style presence: poll the other party's profile so their "Active now" status
  // updates live while this chat is open, the same ~4s cadence as the message reload below.
  const otherPartyId = canView ? (isFarmer ? order.buyerId : order.farmerId) : null;
  useEffect(() => {
    if (!otherPartyId) return undefined;
    let cancelled = false;
    const reload = () => {
      getUserById(otherPartyId).then((profile) => {
        if (!cancelled) setOtherParty(profile);
      });
    };
    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [otherPartyId]);

  // A buyer/stakeholder can jump straight to this farmer's full marketplace listing —
  // handy for exactly the kind of question this thread exists for ("do you still have
  // carrots?"). Farmer-side viewers don't need a shortcut to their own listings.
  const shouldShowViewProducts = canView && !isFarmer;

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    const reload = async () => {
      const next = await getMessagesForOrder(orderId);
      if (cancelled) return;
      setMessages(next);
      markThreadRead(orderId).catch(() => {});
    };
    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId, canView]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  if (loadedOrderId !== orderId) return null;
  if (!order || !canView) return <Navigate to="/messages" replace />;

  const navItems = getNavItemsForRole(currentUser.role);
  const otherPartyName = currentUser.role === 'farmer' ? order.buyerName : order.farmerName;
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
      await sendMessage(order, currentUser, draft);
      setDraft('');
      setMessages(await getMessagesForOrder(orderId));
    } catch (error) {
      setSendError(error.message);
    }
  };

  const handleToggleTranslate = async (message) => {
    const existing = translations[message.id];
    // A cached translation is only reusable if it's in the language currently selected —
    // switching the dropdown makes any prior-language result stale, so it's refetched
    // (translateText's own cache makes that effectively instant either way).
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
      title={`Chat with ${otherPartyName}`}
      subtitle={`Order — ${order.productName}`}
    >
      <section className="panel chat-panel">
        <div className="chat-header-row">
          <span className="chat-presence">
            <span className={`presence-dot ${online ? 'online' : 'offline'}`} /> {presenceLabel}
          </span>
          <div className="chat-header-actions">
            {shouldShowViewProducts ? (
              <Link
                className="btn btn-secondary btn-sm"
                to={`/marketplace?farmerId=${order.farmerId}&farmerName=${encodeURIComponent(otherPartyName)}`}
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
            placeholder={`Message ${otherPartyName}...`}
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
