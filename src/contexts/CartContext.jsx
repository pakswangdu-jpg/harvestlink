/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';

// Only productId + quantity are persisted — never a price/farmer/stock snapshot — so the
// cart can never go stale against a listing that changed after it was added. CartPage.jsx
// re-fetches the real product for every item on load, the same way ProductDetails.jsx
// already does for a single product. Nothing here is sensitive, so localStorage (not a
// server table) is an appropriate, low-risk place for it.
function storageKeyFor(userId) {
  return `harvestlink_cart_${userId}`;
}

function readCart(userId) {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKeyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && item.productId && Number(item.quantity) > 0)
      : [];
  } catch {
    return [];
  }
}

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id || null;
  const [items, setItems] = useState(() => readCart(userId));
  // Tracks which user's cart `items` currently holds — compared against `userId` on every
  // render so a login/logout swap reloads the new account's own cart. Adjusting state during
  // render (React's own documented pattern for "derived state that resets when a prop
  // changes") instead of an effect, since resetting a whole account's cart is a synchronous
  // reaction to userId changing, not a side effect that needs to run after paint.
  const [loadedUserId, setLoadedUserId] = useState(userId);
  if (userId !== loadedUserId) {
    setLoadedUserId(userId);
    setItems(readCart(userId));
  }

  useEffect(() => {
    if (!userId) return;
    window.localStorage.setItem(storageKeyFor(userId), JSON.stringify(items));
  }, [userId, items]);

  const value = useMemo(() => {
    const addItem = (productId, stockQuantity, incrementBy = 1) => {
      if (!userId) return;
      setItems((previous) => {
        const existing = previous.find((item) => item.productId === productId);
        const cap = Number(stockQuantity) > 0 ? Number(stockQuantity) : 0;
        if (!cap) return previous;
        if (existing) {
          const nextQuantity = Math.min(cap, existing.quantity + incrementBy);
          return previous.map((item) => (item.productId === productId ? { ...item, quantity: nextQuantity } : item));
        }
        return [...previous, { productId, quantity: Math.min(cap, incrementBy) }];
      });
    };

    const updateQuantity = (productId, quantity, stockQuantity) => {
      const cap = Number(stockQuantity) > 0 ? Number(stockQuantity) : 1;
      const clamped = Math.min(cap, Math.max(1, Math.round(Number(quantity) || 1)));
      setItems((previous) => previous.map((item) => (item.productId === productId ? { ...item, quantity: clamped } : item)));
    };

    const removeItem = (productId) => {
      setItems((previous) => previous.filter((item) => item.productId !== productId));
    };

    const clearCart = () => setItems([]);

    const isInCart = (productId) => items.some((item) => item.productId === productId);

    const itemCount = items.reduce((total, item) => total + item.quantity, 0);

    return {
      items, itemCount, addItem, updateQuantity, removeItem, clearCart, isInCart,
    };
  }, [items, userId]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider.');
  return context;
}
