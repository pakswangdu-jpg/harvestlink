export const STORAGE_KEYS = {
  users: 'harvestlink_users',
  products: 'harvestlink_products',
  orders: 'harvestlink_orders',
  donations: 'harvestlink_donations',
  notifications: 'harvestlink_notifications',
  currentUser: 'harvestlink_current_user',
  legacyProducts: 'harvestlinkProducts',
  legacyRequests: 'harvestlink_purchase_requests',
};

// Crop categories/products/units used to live here as hardcoded arrays — they're now
// admin-editable data in Supabase (public.categories / public.products_catalog /
// public.units / public.product_units), read via src/contexts/CatalogContext.jsx's
// useCatalog() hook instead (see supabase/schema.sql for why).

export const PRODUCT_GRADES = [
  { value: 'A', label: 'Grade A — Premium' },
  { value: 'B', label: 'Grade B — Standard' },
];

export const SALES_TYPES = [
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
];

// A single, easy-to-adjust cutoff for the "low stock" warning shown to buyers/stakeholders
// on the marketplace card and product detail page — not per-product, since there's no
// per-listing threshold field to configure one from.
export const LOW_STOCK_THRESHOLD = 10;

// Zero/negative quantity isn't "low stock" — that's out of stock, already surfaced via the
// product's own status instead of this warning.
export function isLowStock(quantity) {
  const value = Number(quantity);
  return value > 0 && value <= LOW_STOCK_THRESHOLD;
}

// How many days out an expiration date starts showing an "Expiring soon" warning, instead
// of only flagging it once it's already too late to act on.
export const EXPIRING_SOON_DAYS = 3;

// 'expired' | 'expiring_soon' | null — null covers both "no expiration date set" and "expires
// comfortably later," so callers can do a single truthy check before rendering a badge.
export function getExpiryStatus(expirationDate) {
  if (!expirationDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expirationDate);
  const diffDays = Math.round((expiry - today) / 86400000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= EXPIRING_SOON_DAYS) return 'expiring_soon';
  return null;
}

export const ORGANIZATION_TYPES = [
  'Orphanage',
  'Home for the Aged',
  'Community Feeding Program',
  'NGO',
  'Local Government Food Bank',
  'Charitable Institution',
];

export const CEBU_MUNICIPALITIES = [
  'Alcantara',
  'Alcoy',
  'Alegria',
  'Aloguinsan',
  'Argao',
  'Asturias',
  'Badian',
  'Balamban',
  'Bantayan',
  'Barili',
  'Bogo City',
  'Boljoon',
  'Borbon',
  'Carcar City',
  'Carmen',
  'Catmon',
  'Cebu City',
  'Compostela',
  'Consolacion',
  'Cordova',
  'Daanbantayan',
  'Dalaguete',
  'Danao City',
  'Dumanjug',
  'Ginatilan',
  'Lapu-Lapu City',
  'Liloan',
  'Madridejos',
  'Malabuyoc',
  'Mandaue City',
  'Minglanilla',
  'Moalboal',
  'Naga City',
  'Oslob',
  'Pilar',
  'Pinamungajan',
  'Poro',
  'Ronda',
  'Samboan',
  'San Fernando',
  'San Francisco',
  'San Remigio',
  'Santander',
  'Santa Fe',
  'Sibonga',
  'Sogod',
  'Tabogon',
  'Tabuelan',
  'Talisay City',
  'Toledo City',
  'Tuburan',
  'Tudela',
  'Valencia',
  'Other',
];

export const DEFAULT_MUNICIPALITY = 'Cebu City';

export const CEBU_MUNICIPALITY_COORDS = {
  Alcantara: { lat: 9.9500, lng: 123.4167 },
  Alcoy: { lat: 9.6833, lng: 123.5000 },
  Alegria: { lat: 9.7167, lng: 123.2333 },
  Aloguinsan: { lat: 10.1667, lng: 123.5333 },
  Argao: { lat: 9.8833, lng: 123.6000 },
  Asturias: { lat: 10.5833, lng: 123.7167 },
  Badian: { lat: 9.8667, lng: 123.3333 },
  Balamban: { lat: 10.4833, lng: 123.7167 },
  Bantayan: { lat: 11.1700, lng: 123.7200 },
  Barili: { lat: 10.1000, lng: 123.5000 },
  'Bogo City': { lat: 11.0517, lng: 124.0058 },
  Boljoon: { lat: 9.6167, lng: 123.4667 },
  Borbon: { lat: 10.8500, lng: 124.0000 },
  'Carcar City': { lat: 10.1058, lng: 123.6414 },
  Carmen: { lat: 10.6167, lng: 123.9333 },
  Catmon: { lat: 10.7167, lng: 123.9833 },
  'Cebu City': { lat: 10.3157, lng: 123.8854 },
  Compostela: { lat: 10.4525, lng: 123.9558 },
  Consolacion: { lat: 10.3778, lng: 123.9564 },
  Cordova: { lat: 10.2536, lng: 123.9491 },
  Daanbantayan: { lat: 11.2500, lng: 124.0000 },
  Dalaguete: { lat: 9.7667, lng: 123.5333 },
  'Danao City': { lat: 10.5225, lng: 123.9444 },
  Dumanjug: { lat: 10.0000, lng: 123.4667 },
  Ginatilan: { lat: 9.5833, lng: 123.2333 },
  'Lapu-Lapu City': { lat: 10.3103, lng: 123.9494 },
  Liloan: { lat: 10.4009, lng: 123.9928 },
  Madridejos: { lat: 11.2700, lng: 123.7100 },
  Malabuyoc: { lat: 9.6667, lng: 123.2500 },
  'Mandaue City': { lat: 10.3237, lng: 123.9224 },
  Minglanilla: { lat: 10.2461, lng: 123.7981 },
  Moalboal: { lat: 9.9333, lng: 123.3833 },
  'Naga City': { lat: 10.2098, lng: 123.7583 },
  Oslob: { lat: 9.5167, lng: 123.4167 },
  Pilar: { lat: 10.6833, lng: 124.4000 },
  Pinamungajan: { lat: 10.2000, lng: 123.5833 },
  Poro: { lat: 10.6667, lng: 124.3833 },
  Ronda: { lat: 9.8333, lng: 123.4167 },
  Samboan: { lat: 9.5333, lng: 123.2833 },
  'San Fernando': { lat: 10.2136, lng: 123.7136 },
  'San Francisco': { lat: 10.6167, lng: 124.3333 },
  'San Remigio': { lat: 11.0833, lng: 123.9500 },
  Santander: { lat: 9.4667, lng: 123.3667 },
  'Santa Fe': { lat: 11.1500, lng: 123.8200 },
  Sibonga: { lat: 10.0333, lng: 123.6667 },
  Sogod: { lat: 10.7667, lng: 123.9833 },
  Tabogon: { lat: 10.9436, lng: 124.0175 },
  Tabuelan: { lat: 10.8167, lng: 123.7167 },
  'Talisay City': { lat: 10.2447, lng: 123.8494 },
  'Toledo City': { lat: 10.3771, lng: 123.6438 },
  Tuburan: { lat: 10.7167, lng: 123.8000 },
  Tudela: { lat: 10.7333, lng: 124.3333 },
  Valencia: { lat: 10.4000, lng: 123.6667 },
  Other: { lat: 10.3157, lng: 123.8854 },
};

export function matchMunicipality(freeText) {
  const normalized = String(freeText || '').toLowerCase();
  const match = CEBU_MUNICIPALITIES.find(
    (municipality) => municipality !== 'Other' && normalized.includes(municipality.toLowerCase())
  );
  return match || DEFAULT_MUNICIPALITY;
}

export function getMunicipalityCoords(municipality) {
  return CEBU_MUNICIPALITY_COORDS[municipality] || CEBU_MUNICIPALITY_COORDS[DEFAULT_MUNICIPALITY];
}

export const PAYMENT_METHODS = [
  { value: 'cod', label: 'Cash on delivery' },
  { value: 'gcash', label: 'GCash' },
];

export const ONLINE_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => method.value !== 'cod').map((method) => method.value);

export const DELIVERY_METHODS = [
  { value: 'farmer_delivery', label: 'Farmer delivery' },
  { value: 'buyer_pickup', label: 'Buyer pickup' },
  { value: 'courier', label: 'Third-party courier' },
];

export const DELIVERY_STEP_LABELS = {
  pending: 'Order confirmed',
  preparing: 'Preparing',
  packed: 'Packed',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const DELIVERY_SEQUENCES = {
  farmer_delivery: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
  courier: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
  buyer_pickup: ['pending', 'preparing', 'ready_for_pickup', 'picked_up'],
};

export const ROLE_DASHBOARDS = {
  farmer: '/farmer-dashboard',
  buyer: '/buyer-dashboard',
  stakeholder: '/stakeholder-dashboard',
  admin: '/admin-dashboard',
};
