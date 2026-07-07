import { DEFAULT_MUNICIPALITY, matchMunicipality, STORAGE_KEYS } from '../utils/constants';

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function readStorage(key, fallback = []) {
  return safeParse(localStorage.getItem(key), fallback);
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Product/ID/avatar images are stored as data URLs directly in localStorage for this
    // prototype, so a long testing session can genuinely fill the browser's quota — this
    // used to fail completely silently (nothing saved, no feedback) wherever it happened.
    if (error?.name === 'QuotaExceededError' || error?.code === 22) {
      throw new Error('Local storage is full. Try removing old product images or clearing this site\'s browser data, then try again.', { cause: error });
    }
    throw error;
  }
  return value;
}

export function removeStorage(key) {
  localStorage.removeItem(key);
}

export function readSession(key, fallback = []) {
  return safeParse(sessionStorage.getItem(key), fallback);
}

export function writeSession(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function removeSession(key) {
  sessionStorage.removeItem(key);
}

export function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function migrateLegacyProducts() {
  const existingProducts = readStorage(STORAGE_KEYS.products, []);
  const legacyProducts = readStorage(STORAGE_KEYS.legacyProducts, null);

  if (existingProducts.length || !Array.isArray(legacyProducts) || legacyProducts.length === 0) {
    return existingProducts;
  }

  const users = readStorage(STORAGE_KEYS.users, []);
  const migrated = legacyProducts.map((product) => {
    const owner = users.find((user) => user.email === product.ownerEmail);
    const farmerId = owner?.id || product.ownerEmail || createId('farmer');
    const farmerName = owner?.name || product.ownerName || product.ownerEmail || 'Local farmer';

    return {
      id: String(product.id || createId('prod')),
      farmerId,
      farmerName,
      name: product.name || 'Untitled produce',
      category: product.category || 'Other',
      price: Number(product.price) || 0,
      unit: String(product.unit || 'kg').replace(/ *\(.*\)/, '').toLowerCase(),
      quantity: Number(product.quantity) || 0,
      location: product.location || 'Cebu',
      description: product.description || 'Fresh local produce available from a Cebu farmer.',
      image: product.imageUrl || '',
      status: Number(product.quantity) > 0 ? 'active' : 'inactive',
      createdAt: product.createdAt || new Date().toISOString(),
      updatedAt: product.createdAt || new Date().toISOString(),
    };
  });

  writeStorage(STORAGE_KEYS.products, migrated);
  return migrated;
}

export function migrateLegacyOrders() {
  const existingOrders = readStorage(STORAGE_KEYS.orders, []);
  const legacyRequests = readStorage(STORAGE_KEYS.legacyRequests, null);

  if (existingOrders.length || !Array.isArray(legacyRequests) || legacyRequests.length === 0) {
    return existingOrders;
  }

  // Resolve each legacy request against the current products/users stores so migrated
  // orders carry the same fields createOrder() always sets — without this, every order
  // detail/tracking view (which assumes productName/unit/unitPrice/farmerName/totalAmount
  // always exist) renders "undefined" and "₱0.00" for these rows.
  const products = readStorage(STORAGE_KEYS.products, []);
  const users = readStorage(STORAGE_KEYS.users, []);

  const migrated = legacyRequests.map((request) => {
    const product = products.find((item) => String(item.id) === String(request.productId));
    const farmer = users.find((user) => user.id === request.farmerId);
    const quantity = Number(request.quantity) || 0;
    const unitPrice = Number(product?.price) || 0;
    const municipality = product?.location ? matchMunicipality(product.location) : DEFAULT_MUNICIPALITY;

    return {
      id: String(request.id || createId('order')),
      productId: request.productId,
      productName: product?.name || 'Produce order',
      unit: product?.unit || 'kg',
      unitPrice,
      farmerId: request.farmerId,
      farmerName: farmer?.name || product?.farmerName || 'Local farmer',
      buyerId: request.buyerId,
      buyerName: request.buyerName || 'Buyer',
      quantity,
      totalAmount: unitPrice * quantity,
      message: request.message || '',
      paymentMethod: request.paymentMethod === 'online' ? 'gcash' : 'cod',
      paymentStatus: request.paymentMethod === 'online' ? 'paid' : 'pending',
      deliveryMethod: 'farmer_delivery',
      deliveryStatus: 'pending',
      originMunicipality: municipality,
      deliveryMunicipality: municipality,
      status: request.status || 'pending',
      createdAt: request.createdAt || new Date().toISOString(),
      updatedAt: request.updatedAt || request.createdAt || new Date().toISOString(),
    };
  });

  writeStorage(STORAGE_KEYS.orders, migrated);
  return migrated;
}
