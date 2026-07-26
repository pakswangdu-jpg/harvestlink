// Server-side twin of src/services/marketPriceService.js's commodity list — duplicated
// (not imported across the frontend/backend boundary) because Render only builds and
// deploys the backend/ directory in isolation (see render.yaml's rootDir), so backend code
// must be fully self-contained. Keep this list in sync with the frontend one if either
// changes.
//
// All 43 commodities PSA actually publishes farmgate PRICES for (table 0142M4EFGP0) — see
// the frontend copy's own comment for why the other ~16 PSA OpenStat tables (production
// volume, area planted/harvested, tree counts, fertilizer use, stocks) can't feed this list:
// they have no price dimension at all.
export const MARKET_COMMODITIES = [
  { id: '28', label: 'Cabbage', keywords: ['cabbage'] },
  { id: '41', label: 'Tomato', keywords: ['tomato'] },
  { id: '33', label: 'Eggplant (Native, Long)', keywords: ['eggplant native long', 'talong native long'] },
  { id: '34', label: 'Eggplant (Native, Round)', keywords: ['eggplant native round', 'talong native round', 'round eggplant'] },
  { id: '32', label: 'Eggplant', keywords: ['eggplant', 'talong'] },
  { id: '27', label: 'Ampalaya (Bitter Gourd)', keywords: ['ampalaya', 'bitter gourd'] },
  { id: '38', label: 'Onion (Yellow Granex)', keywords: ['yellow onion', 'onion yellow', 'bermuda white'] },
  { id: '40', label: 'Onion (Red Shallot)', keywords: ['shallot', 'sibuyas tagalog', 'red shallot'] },
  { id: '39', label: 'Onion (Red Creole)', keywords: ['onion', 'sibuyas'] },
  { id: '29', label: 'Camote (Sweet Potato)', keywords: ['camote', 'sweet potato'] },
  { id: '31', label: 'Cassava (Industrial Use)', keywords: ['cassava industrial', 'industrial cassava'] },
  { id: '30', label: 'Cassava', keywords: ['cassava'] },
  { id: '42', label: 'Potato', keywords: ['potato'] },
  { id: '21', label: 'Mango (Piko)', keywords: ['mango piko', 'piko mango'] },
  { id: '22', label: 'Mango (Indian)', keywords: ['mango indian', 'indian mango'] },
  { id: '23', label: 'Mango (Others)', keywords: ['mango others', 'other mango'] },
  { id: '20', label: 'Mango (Carabao)', keywords: ['mango', 'mangga'] },
  { id: '15', label: 'Banana (Lakatan)', keywords: ['lakatan'] },
  { id: '16', label: 'Banana (Latundan)', keywords: ['latundan'] },
  { id: '13', label: 'Banana (Bungulan)', keywords: ['bungulan'] },
  { id: '14', label: 'Banana (Cavendish)', keywords: ['cavendish'] },
  { id: '18', label: 'Banana (Others)', keywords: ['banana others', 'other banana'] },
  { id: '17', label: 'Banana (Saba)', keywords: ['banana', 'saging'] },
  { id: '19', label: 'Calamansi', keywords: ['calamansi'] },
  { id: '24', label: 'Pineapple (Formosa)', keywords: ['formosa'] },
  { id: '25', label: 'Pineapple (Hawaiian)', keywords: ['hawaiian'] },
  { id: '26', label: 'Pineapple (Native)', keywords: ['pineapple', 'pinya'] },
  { id: '35', label: 'Mongo (Green, Labo)', keywords: ['mongo green', 'green mongo', 'monggo green'] },
  { id: '37', label: 'Mongo (Yellow)', keywords: ['mongo yellow', 'yellow mongo', 'monggo yellow'] },
  { id: '36', label: 'Mongo (Mungbean)', keywords: ['mongo', 'mung bean', 'monggo'] },
  { id: '1', label: 'Coconut (Mature)', keywords: ['coconut', 'niyog'] },
  { id: '2', label: 'Coconut (Young / Buko)', keywords: ['buko', 'young coconut'] },
  { id: '12', label: 'Cacao', keywords: ['cacao', 'cocoa', 'tsokolate'] },
  { id: '8', label: 'Sugarcane', keywords: ['sugarcane', 'tubo'] },
  { id: '3', label: 'Coffee (Arabica)', keywords: ['arabica'] },
  { id: '5', label: 'Coffee (Liberica / Barako)', keywords: ['barako', 'liberica'] },
  { id: '4', label: 'Coffee (Excelsa)', keywords: ['excelsa'] },
  { id: '6', label: 'Coffee (Robusta)', keywords: ['coffee', 'robusta'] },
  { id: '0', label: 'Abaca', keywords: ['abaca'] },
  { id: '7', label: 'Rubber', keywords: ['rubber'] },
  { id: '9', label: 'Tobacco (Native)', keywords: ['tobacco native', 'native tobacco'] },
  { id: '10', label: 'Tobacco (Virginia)', keywords: ['tobacco virginia', 'virginia tobacco'] },
  { id: '11', label: 'Tobacco (Others)', keywords: ['tobacco'] },
];

export function matchCommodity(productName) {
  const normalized = String(productName || '').toLowerCase();
  return MARKET_COMMODITIES.find((commodity) => commodity.keywords.some((keyword) => normalized.includes(keyword))) || null;
}
