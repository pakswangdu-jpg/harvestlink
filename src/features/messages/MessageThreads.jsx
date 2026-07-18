import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getOrdersByBuyer, getOrdersByFarmer } from '../../services/orderService';
import { getDirectThreads, getThreadsForOrders } from '../../services/messageService';
import { formatDate } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function MessageThreads() {
  const { currentUser } = useAuth();
  const [orderThreads, setOrderThreads] = useState([]);
  const [directThreads, setDirectThreads] = useState([]);
  const navItems = getNavItemsForRole(currentUser.role);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      const orders = currentUser.role === 'farmer'
        ? await getOrdersByFarmer(currentUser.id)
        : await getOrdersByBuyer(currentUser.id);
      const [nextOrderThreads, nextDirectThreads] = await Promise.all([
        getThreadsForOrders(orders, currentUser),
        getDirectThreads(),
      ]);
      if (cancelled) return;
      setOrderThreads(nextOrderThreads);
      setDirectThreads(nextDirectThreads);
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.role]);

  // Both kinds of thread — an order chat and a direct (order-independent) conversation —
  // rendered as one merged, newest-first list rather than two separate sections, since from
  // the user's point of view they're both just "a conversation with someone."
  const combinedThreads = [
    ...orderThreads.map((thread) => ({
      key: `order-${thread.order.id}`,
      to: `/messages/${thread.order.id}`,
      name: thread.otherPartyName,
      subtitle: thread.order.productName,
      lastMessageText: thread.lastMessage?.text,
      lastMessageAt: thread.lastMessage?.createdAt || thread.order.createdAt,
      unreadCount: thread.unreadCount,
    })),
    ...directThreads.map((thread) => ({
      key: `direct-${thread.otherUserId}`,
      to: `/messages/direct/${thread.otherUserId}`,
      name: thread.otherUserName,
      subtitle: 'Direct message',
      lastMessageText: thread.lastMessage?.text,
      lastMessageAt: thread.lastMessage?.createdAt,
      unreadCount: thread.unreadCount,
    })),
  ].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Messages"
      subtitle="Chat with the farmer, buyer, or stakeholder behind an order — or reach out directly."
    >
      {combinedThreads.length ? (
        <section className="panel thread-list">
          {combinedThreads.map((thread) => (
            <Link key={thread.key} to={thread.to} className="thread-item">
              <div className="thread-item-main">
                <strong>{thread.name}</strong>
                <span className="muted">{thread.subtitle}</span>
                <p className="muted">{thread.lastMessageText || 'No messages yet — say hello.'}</p>
              </div>
              <div className="thread-item-meta">
                <small>{formatDate(thread.lastMessageAt)}</small>
                {thread.unreadCount ? <span className="badge badge-pending">{thread.unreadCount} new</span> : null}
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState title="No conversations yet" message="Messages tied to your orders, or started directly, will appear here." />
      )}
    </AppShell>
  );
}
