// Mirrors the small, stable value lists from the frontend's src/utils/constants.js that
// the backend needs for validation/derivation. Kept manually in sync (not imported across
// the frontend/backend boundary — they're two separate deployable projects) since these
// lists change rarely. If you add/rename a municipality or payment/delivery value on the
// frontend, mirror the change here too.
//
// Crop categories/units used to live here as a hardcoded PRODUCT_CATEGORIES array — they're
// now admin-editable data in Supabase (public.crop_categories / public.crops), read via
// lib/catalogRepo.js instead (see supabase/schema.sql for why).

export const CEBU_MUNICIPALITIES = [
  'Alcantara', 'Alcoy', 'Alegria', 'Aloguinsan', 'Argao', 'Asturias', 'Badian', 'Balamban',
  'Bantayan', 'Barili', 'Bogo City', 'Boljoon', 'Borbon', 'Carcar City', 'Carmen', 'Catmon',
  'Cebu City', 'Compostela', 'Consolacion', 'Cordova', 'Daanbantayan', 'Dalaguete',
  'Danao City', 'Dumanjug', 'Ginatilan', 'Lapu-Lapu City', 'Liloan', 'Madridejos',
  'Malabuyoc', 'Mandaue City', 'Minglanilla', 'Moalboal', 'Naga City', 'Oslob', 'Pilar',
  'Pinamungajan', 'Poro', 'Ronda', 'Samboan', 'San Fernando', 'San Francisco',
  'San Remigio', 'Santander', 'Santa Fe', 'Sibonga', 'Sogod', 'Tabogon', 'Tabuelan',
  'Talisay City', 'Toledo City', 'Tuburan', 'Tudela', 'Valencia', 'Other',
];

export const DEFAULT_MUNICIPALITY = 'Cebu City';

// Ported verbatim from src/utils/constants.js's CEBU_MUNICIPALITY_COORDS — used server-side
// to compute the distance-based delivery fee at order creation (see lib/deliveryFee.js).
// Keep in sync with the frontend copy (used there for map pin placement/ETA estimates).
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

export function getMunicipalityCoords(municipality) {
  return CEBU_MUNICIPALITY_COORDS[municipality] || CEBU_MUNICIPALITY_COORDS[DEFAULT_MUNICIPALITY];
}

// Only GCash (via the demo payment module — see payments.controller.js) and Cash on
// Delivery are offered.
export const PAYMENT_METHODS = ['cod', 'gcash'];

export const DELIVERY_METHODS = ['farmer_delivery', 'buyer_pickup', 'courier'];

export const DELIVERY_SEQUENCES = {
  farmer_delivery: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
  courier: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
  buyer_pickup: ['pending', 'preparing', 'ready_for_pickup', 'picked_up'],
};
