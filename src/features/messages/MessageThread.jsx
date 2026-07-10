import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { getOrderById } from '../../services/orderService';
import { getMessagesForOrder, markThreadRead, sendMessage } from '../../services/messageService';
import { STORAGE_KEYS } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function MessageThread() {
  const { orderId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const order = getOrderById(orderId);
  const [messages, setMessages] = useState(() => getMessagesForOrder(orderId));
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  // "Buyer" here means "the account that placed this order" — a partner organization
  // checking out through the marketplace is just as much the buyer as a buyer-role
  // account is, so this checks id ownership, not the literal account role.
  const isBuyer = order && currentUser.id === order.buyerId;
  const isFarmer = order && currentUser.role === 'farmer' && currentUser.id === order.farmerId;
  const canView = Boolean(isBuyer || isFarmer);

  useEffect(() => {
    if (canView) markThreadRead(orderId, currentUser.id);
  }, [orderId, canView, currentUser.id]);

  useEffect(() => {
    if (!canView) return undefined;
    const reload = () => {
      setMessages(getMessagesForOrder(orderId));
      markThreadRead(orderId, currentUser.id);
    };
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.messages) reload();
    };
    const interval = setInterval(reload, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [orderId, canView, currentUser.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  if (!order || !canView) return <Navigate to="/messages" replace />;

  const navItems = getNavItemsForRole(currentUser.role);
  const otherPartyName = currentUser.role === 'farmer' ? order.buyerName : order.farmerName;

  const handleSend = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    sendMessage(order, currentUser, draft);
    setDraft('');
    setMessages(getMessagesForOrder(orderId));
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={`Chat with ${otherPartyName}`}
      subtitle={`Order — ${order.productName}`}
    >
      <section className="panel chat-panel">
        <div className="chat-thread">
          {messages.length ? (
            messages.map((message) => (
              <div key={message.id} className={`chat-bubble ${message.senderId === currentUser.id ? 'mine' : 'theirs'}`}>
                <p>{message.text}</p>
                <small>{formatDate(message.createdAt)}</small>
              </div>
            ))
          ) : (
            <p className="muted">No messages yet — say hello.</p>
          )}
          <div ref={bottomRef} />
        </div>
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
