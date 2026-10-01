




const CATEGORY_BY_COMMODITY_ID = {

  28: 'Vegetables',
  41: 'Vegetables',
  33: 'Vegetables',
  34: 'Vegetables',
  32: 'Vegetables',
  27: 'Vegetables',
  38: 'Vegetables',
  40: 'Vegetables',
  39: 'Vegetables',

  29: 'Root Crops',
  31: 'Root Crops',
  30: 'Root Crops',
  42: 'Root Crops',

  21: 'Fruits',
  22: 'Fruits',
  23: 'Fruits',
  20: 'Fruits',
  15: 'Fruits',
  16: 'Fruits',
  13: 'Fruits',
  14: 'Fruits',
  18: 'Fruits',
  17: 'Fruits',
  19: 'Fruits',
  24: 'Fruits',
  25: 'Fruits',
  26: 'Fruits',

  35: 'Legumes',
  37: 'Legumes',
  36: 'Legumes',

  1: 'Cash Crops',
  2: 'Cash Crops',
  12: 'Cash Crops',
  8: 'Cash Crops',
  3: 'Cash Crops',
  5: 'Cash Crops',
  4: 'Cash Crops',
  6: 'Cash Crops',
  0: 'Cash Crops',
  7: 'Cash Crops',
  9: 'Cash Crops',
  10: 'Cash Crops',
  11: 'Cash Crops',
};

export const COMMODITY_CATEGORIES = ['Vegetables', 'Fruits', 'Root Crops', 'Legumes', 'Cash Crops'];

export function getCommodityCategory(commodityId) {
  return CATEGORY_BY_COMMODITY_ID[commodityId] || 'Others';
}
