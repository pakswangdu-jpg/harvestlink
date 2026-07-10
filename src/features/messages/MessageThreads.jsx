import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getOrdersByBuyer, getOrdersByFarmer } from '../../services/orderService';
import { getThreadsForOrders } from '../../services/messageService';
import { STORAGE_KEYS } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function MessageThreads() {
  const { currentUser } = useAuth();
  const [, forceRefresh] = useState(0);
  const navItems = getNavItemsForRole(currentUser.role);
  const orders = currentUser.role === 'farmer' ? getOrdersByFarmer(currentUser.id) : getOrdersByBuyer(currentUser.id);
  const threads = getThreadsForOrders(orders, currentUser);

  useEffect(() => {
    const tick = () => forceRefresh((count) => count + 1);
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.messages || event.key === STORAGE_KEYS.orders) tick();
    };
    const interval = setInterval(tick, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Messages"
      subtitle="Chat with the farmer or buyer for each of your orders."
    >
      {threads.length ? (
        <section className="panel thread-list">
          {threads.map(({ order, lastMessage, unreadCount, otherPartyName }) => (
            <Link key={order.id} to={`/messages/${order.id}`} className="thread-item">
              <div className="thread-item-main">
                <strong>{otherPartyName}</strong>
                <span className="muted">{order.productName}</span>
                <p className="muted">{lastMessage ? lastMessage.text : 'No messages yet — say hello.'}</p>
              </div>
              <div className="thread-item-meta">
                <small>{formatDate(lastMessage?.createdAt || order.createdAt)}</small>
                {unreadCount ? <span className="badge badge-pending">{unreadCount} new</span> : null}
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState title="No conversations yet" message="Messages tied to your orders will appear here." />
      )}
    </AppShell>
  );
}
