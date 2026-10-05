


import { getExpiryStatus, STORAGE_KEYS } from '../../utils/constants';
import { createId, migrateLegacyProducts, readStorage, writeStorage } from '../storageService';
import { getWholesalePricingErrors } from '../../../backend/shared/pricing.js';

function wholesaleFields(values, existing = null) {
  const enabled = !values.isDonation && values.sellingType !== 'wholesale'
    && (values.wholesaleEnabled ?? (existing?.wholesalePrice != null));
  if (!enabled) return { wholesalePrice: null, wholesaleMinQuantity: null };
  const fields = {
    wholesalePrice: Number(values.wholesalePrice),
    wholesaleMinQuantity: Number(values.wholesaleMinQuantity),
  };
  const errors = getWholesalePricingErrors({ ...values, ...fields }, existing);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return fields;
}



const PRICE_DEVIATION_THRESHOLD_PERCENT = 20;






function buildPriceReview(marketReference, price, previousReview, kgPerUnit = 1) {
  if (!marketReference || !marketReference.referencePrice) return null;

  const farmerPrice = Number(price);
  const referencePrice = Number(marketReference.referencePrice);
  const pricePerKg = farmerPrice / (kgPerUnit || 1);
  const deviationPct = Number((((pricePerKg - referencePrice) / referencePrice) * 100).toFixed(1));

  if (deviationPct <= PRICE_DEVIATION_THRESHOLD_PERCENT) return null;


  if (previousReview && previousReview.farmerPrice === farmerPrice && previousReview.referencePrice === referencePrice) {
    return previousReview;
  }

  const conversionNote = kgPerUnit && kgPerUnit !== 1
    ? ` — using your stated 1 unit = ${kgPerUnit}kg, this works out to ₱${pricePerKg.toFixed(2)}/kg`
    : '';

  return {
    commodityLabel: marketReference.commodityLabel,
    referencePrice,
    referenceYear: marketReference.referenceYear,
    farmerPrice,
    deviationPct,
    status: 'pending',
    reason: `Price is ${deviationPct}% above the PSA Central Visayas average of ₱${referencePrice.toFixed(2)}/kg for ${marketReference.commodityLabel} (${marketReference.referenceYear})${conversionNote} — exceeds the ${PRICE_DEVIATION_THRESHOLD_PERCENT}% fair-pricing threshold.`,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
}

export function getProducts() {
  migrateLegacyProducts();
  const products = readStorage(STORAGE_KEYS.products, []);
  return products.map((product) => ({ grade: 'A', sellingType: 'retail', ...product }));
}

export function saveProducts(products) {
  return writeStorage(STORAGE_KEYS.products, products);
}

export function getProductById(id) {
  return getProducts().find((product) => product.id === id) || null;
}

export function getActiveProducts() {
  return getProducts().filter((product) => product.status === 'active'
    && Number(product.quantity) > 0
    && getExpiryStatus(product.expirationDate) !== 'expired');
}

export function getProductsByFarmer(farmerId) {
  return getProducts().filter((product) => product.farmerId === farmerId);
}




function resolveKgPerUnit(values) {
  if (values.unit === 'kg') return 1;
  const parsed = Number(values.kgPerUnit);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function createProduct(values, farmer) {
  const now = new Date().toISOString();
  const kgPerUnit = resolveKgPerUnit(values);
  const product = {
    id: createId('prod'),
    farmerId: farmer.id,
    farmerName: farmer.name,
    name: values.name.trim(),
    category: values.category,
    grade: values.grade || 'A',
    sellingType: values.sellingType || 'retail',
    moq: values.sellingType === 'wholesale' ? Number(values.moq) : null,
    price: Number(values.price),
    ...wholesaleFields(values),
    unit: values.unit,
    kgPerUnit: values.unit === 'kg' ? null : kgPerUnit,
    quantity: Number(values.quantity),
    location: values.location.trim(),
    description: values.description.trim(),
    image: values.image || '',
    status: 'active',
    priceReview: buildPriceReview(values.marketReference, values.price, null, kgPerUnit),
    expirationDate: values.expirationDate || null,
    createdAt: now,
    updatedAt: now,
  };

  saveProducts([product, ...getProducts()]);
  return product;
}

export function updateProduct(id, values) {
  const products = getProducts();
  const kgPerUnit = resolveKgPerUnit(values);
  const updatedProducts = products.map((product) => {
    if (product.id !== id) return product;
    const quantity = Number(values.quantity);
    const { marketReference, ...rest } = values;
    const priceReview = marketReference !== undefined
      ? buildPriceReview(marketReference, values.price, product.priceReview, kgPerUnit)
      : rest.priceReview !== undefined ? rest.priceReview : product.priceReview;

    return {
      ...product,
      ...rest,
      ...wholesaleFields({ ...product, ...values }, product),
      price: Number(values.price),
      kgPerUnit: rest.unit === 'kg' ? null : kgPerUnit,
      quantity,
      moq: rest.sellingType === 'wholesale' ? Number(rest.moq) : null,
      status: values.status || (quantity > 0 ? product.status : 'inactive'),
      priceReview,
      updatedAt: new Date().toISOString(),
    };
  });

  saveProducts(updatedProducts);
  return updatedProducts.find((product) => product.id === id) || null;
}

export function deleteProduct(id) {
  saveProducts(getProducts().filter((product) => product.id !== id));
}

export function setProductStatus(id, status) {
  const product = getProductById(id);
  if (!product) throw new Error('Product was not found.');

  if (status === 'active') {
    if (Number(product.quantity) <= 0) throw new Error('This product has no remaining stock — add stock before activating it.');
    if (product.priceReview?.status === 'declined') {
      throw new Error('DTI declined this price — edit the product with a new price before activating it.');
    }
  }

  return updateProduct(id, { ...product, status });
}

export function applyDiscount(id, percent) {
  const product = getProductById(id);
  if (!product) throw new Error('Product was not found.');

  const originalPrice = product.originalPrice ?? product.price;
  const discountedPrice = Number((originalPrice * (1 - percent / 100)).toFixed(2));

  return updateProduct(id, { ...product, originalPrice, discountPercent: percent, price: discountedPrice });
}

export function removeDiscount(id) {
  const product = getProductById(id);
  if (!product) throw new Error('Product was not found.');
  if (!product.originalPrice) return product;

  return updateProduct(id, { ...product, price: product.originalPrice, originalPrice: undefined, discountPercent: undefined });
}

export function getPendingPriceReviews() {
  return getProducts().filter((product) => product.priceReview?.status === 'pending');
}

export function getDeclinedPriceReviews() {
  return getProducts().filter((product) => product.priceReview?.status === 'declined');
}

export function approvePriceReview(id) {
  const product = getProductById(id);
  if (!product) throw new Error('Product was not found.');
  if (!product.priceReview) throw new Error('This product has no pending price review.');

  return updateProduct(id, {
    ...product,
    priceReview: { ...product.priceReview, status: 'approved', decidedAt: new Date().toISOString() },
  });
}

export function declinePriceReview(id) {
  const product = getProductById(id);
  if (!product) throw new Error('Product was not found.');
  if (!product.priceReview) throw new Error('This product has no pending price review.');

  return updateProduct(id, {
    ...product,
    status: 'inactive',
    priceReview: { ...product.priceReview, status: 'declined', decidedAt: new Date().toISOString() },
  });
}




export function reactivatePriceReview(id) {
  const product = getProductById(id);
  if (!product) throw new Error('Product was not found.');
  if (product.priceReview?.status !== 'declined') throw new Error('This product does not have a declined price review.');
  if (Number(product.quantity) <= 0) throw new Error('This product has no remaining stock — add stock before reactivating it.');

  return updateProduct(id, {
    ...product,
    status: 'active',
    priceReview: { ...product.priceReview, status: 'approved', decidedAt: new Date().toISOString() },
  });
}

export function reduceProductQuantity(id, quantity) {
  const product = getProductById(id);
  if (!product) throw new Error('Product was not found.');

  const nextQuantity = Number(product.quantity) - Number(quantity);
  if (nextQuantity < 0) throw new Error('Requested quantity exceeds available stock.');

  return updateProduct(id, {
    ...product,
    quantity: nextQuantity,
    status: nextQuantity > 0 ? product.status : 'inactive',
  });
}




export function restoreProductQuantity(id, quantity) {
  const product = getProductById(id);
  if (!product) return null;

  const nextQuantity = Number(product.quantity) + Number(quantity);
  const wasAutoDeactivated = product.status === 'inactive' && Number(product.quantity) === 0;
  const isDeclined = product.priceReview?.status === 'declined';
  const shouldReactivate = wasAutoDeactivated && !isDeclined && nextQuantity > 0;

  return updateProduct(id, {
    ...product,
    quantity: nextQuantity,
    status: shouldReactivate ? 'active' : product.status,
  });
}
