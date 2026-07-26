// MARKET_COMMODITIES (src/services/marketPriceService.js) has no category field of its own —
// it's just PSA's flat list of the 43 commodities that table publishes a price for. This is a
// small, presentational grouping on top of that list purely for this page's Category filter/
// column — it has nothing to do with, and never touches, the admin-editable product catalog
// categories used elsewhere (Admin Categories, ProductForm) which classify actual listings.
const CATEGORY_BY_COMMODITY_ID = {
  // Vegetables
  28: 'Vegetables', // Cabbage
  41: 'Vegetables', // Tomato
  33: 'Vegetables', // Eggplant (Native, Long)
  34: 'Vegetables', // Eggplant (Native, Round)
  32: 'Vegetables', // Eggplant
  27: 'Vegetables', // Ampalaya
  38: 'Vegetables', // Onion (Yellow Granex)
  40: 'Vegetables', // Onion (Red Shallot)
  39: 'Vegetables', // Onion (Red Creole)
  // Root & tuber crops
  29: 'Root Crops', // Camote
  31: 'Root Crops', // Cassava (Industrial Use)
  30: 'Root Crops', // Cassava
  42: 'Root Crops', // Potato
  // Fruits
  21: 'Fruits', // Mango (Piko)
  22: 'Fruits', // Mango (Indian)
  23: 'Fruits', // Mango (Others)
  20: 'Fruits', // Mango (Carabao)
  15: 'Fruits', // Banana (Lakatan)
  16: 'Fruits', // Banana (Latundan)
  13: 'Fruits', // Banana (Bungulan)
  14: 'Fruits', // Banana (Cavendish)
  18: 'Fruits', // Banana (Others)
  17: 'Fruits', // Banana (Saba)
  19: 'Fruits', // Calamansi
  24: 'Fruits', // Pineapple (Formosa)
  25: 'Fruits', // Pineapple (Hawaiian)
  26: 'Fruits', // Pineapple (Native)
  // Legumes
  35: 'Legumes', // Mongo (Green, Labo)
  37: 'Legumes', // Mongo (Yellow)
  36: 'Legumes', // Mongo (Mungbean)
  // Cash / industrial crops
  1: 'Cash Crops', // Coconut (Mature)
  2: 'Cash Crops', // Coconut (Young / Buko)
  12: 'Cash Crops', // Cacao
  8: 'Cash Crops', // Sugarcane
  3: 'Cash Crops', // Coffee (Arabica)
  5: 'Cash Crops', // Coffee (Liberica / Barako)
  4: 'Cash Crops', // Coffee (Excelsa)
  6: 'Cash Crops', // Coffee (Robusta)
  0: 'Cash Crops', // Abaca
  7: 'Cash Crops', // Rubber
  9: 'Cash Crops', // Tobacco (Native)
  10: 'Cash Crops', // Tobacco (Virginia)
  11: 'Cash Crops', // Tobacco (Others)
};

export const COMMODITY_CATEGORIES = ['Vegetables', 'Fruits', 'Root Crops', 'Legumes', 'Cash Crops'];

export function getCommodityCategory(commodityId) {
  return CATEGORY_BY_COMMODITY_ID[commodityId] || 'Others';
}
