import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getOrdersByBuyer, getOrdersByFarmer } from '../../services/orderService';
import { getThreadsForOrders } from '../../services/messageService';
import { formatDate } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function MessageThreads() {
  const { currentUser } = useAuth();
  const [threads, setThreads] = useState([]);
  const navItems = getNavItemsForRole(currentUser.role);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      const orders = currentUser.role === 'farmer'
        ? await getOrdersByFarmer(currentUser.id)
        : await getOrdersByBuyer(currentUser.id);
      if (cancelled) return;
      const nextThreads = await getThreadsForOrders(orders, currentUser);
      if (cancelled) return;
      setThreads(nextThreads);
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.role]);

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
