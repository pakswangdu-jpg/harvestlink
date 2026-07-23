import { useEffect, useState } from 'react';
import { Gift, Info, Tag, TriangleAlert } from 'lucide-react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { CEBU_MUNICIPALITIES, matchMunicipality, PRODUCT_GRADES, SALES_TYPES } from '../../utils/constants';
import { useCatalog } from '../../contexts/CatalogContext';
import { fetchAnnualPriceTrend, getRecommendedPrice, matchCommodity } from '../../services/marketPriceService';
import { uploadProductImage } from '../../services/uploadService';
import { formatCurrency } from '../../utils/formatters';
import { hasErrors, validateProductForm } from '../../utils/validators';

const PRICE_DEVIATION_THRESHOLD_PERCENT = 20;

// Farmer types the exact percent they want (rather than picking from presets) and sees the
// resulting price live before committing — moved here (from FarmerProducts.jsx) so the
// discount control lives inside the same Pricing card as everything else price-related.
function DiscountControl({ product, onApply }) {
  const [percent, setPercent] = useState('');
  const draftPercent = Number(percent);
  const isValid = percent !== '' && Number.isFinite(draftPercent) && draftPercent > 0 && draftPercent < 100;
  const previewPrice = isValid ? Number((product.price * (1 - draftPercent / 100)).toFixed(2)) : null;

  return (
    <div className="discount-picker">
      <div className="discount-input-wrap">
        <input
          type="number"
          min="1"
          max="99"
          step="1"
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
          placeholder="20"
        />
        <span>%</span>
      </div>
      {previewPrice != null ? (
        <span className="discount-preview">
          <span className="price-original">{formatCurrency(product.price)}</span>
          {' → '}
          <strong>{formatCurrency(previewPrice)}</strong>
        </span>
      ) : null}
      <Button type="button" size="sm" variant="secondary" disabled={!isValid} onClick={() => onApply(draftPercent)}>
        <Tag size={15} /> Apply discount
      </Button>
    </div>
  );
}

// Order matches the form's visual top-to-bottom layout, so the first error found here
// is always the first one the farmer would encounter while scrolling down.
const FIELD_ORDER = ['name', 'category', 'grade', 'sellingType', 'moq', 'price', 'unit', 'quantity', 'expirationDate', 'costPrice', 'kgPerUnit', 'location', 'description', 'image'];

const FIELD_LABELS = {
  name: 'Product',
  category: 'Category',
  grade: 'Grade',
  sellingType: 'Sales type',
  moq: 'Minimum Order Quantity (MOQ)',
  price: 'Price',
  unit: 'Unit',
  quantity: 'Quantity available',
  expirationDate: 'Expiration date',
  costPrice: 'Cost per unit',
  kgPerUnit: 'Unit weight in kg',
  location: 'Location',
  description: 'Description',
  image: 'Product image',
};

function focusFirstError(errors) {
  const firstField = FIELD_ORDER.find((field) => errors[field]);
  const element = firstField && document.getElementById(firstField);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element?.focus();
}

function buildDefaultValues(product, currentUser) {
  return {
    name: '',
    category: 'Vegetables',
    grade: 'A',
    sellingType: 'retail',
    price: '',
    unit: '',
    quantity: '',
    location: currentUser?.municipality || CEBU_MUNICIPALITIES[0],
    description: '',
    image: '',
    status: 'active',
    isDonation: false,
    ...product,
    costPrice: product?.costPrice ?? '',
    moq: product?.moq ?? '',
    kgPerUnit: product?.kgPerUnit ?? '',
    expirationDate: product?.expirationDate ?? '',
    ...(product ? { location: matchMunicipality(product.location) } : {}),
  };
}

export default function ProductForm({
  product, currentUser, onSubmit, onCancel, formId, hideActions = false, onSubmittingChange,
  onApplyDiscount, onRemoveDiscount,
}) {
  const { getCategoryOptions, getUnitOptions } = useCatalog();
  const [values, setValues] = useState(() => buildDefaultValues(product, currentUser));
  const [errors, setErrors] = useState({});
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [marketResult, setMarketResult] = useState({ commodityId: null, reference: null });

  useEffect(() => {
    onSubmittingChange?.(isSubmitting || isReadingImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitting, isReadingImage]);

  const isWholesale = values.sellingType === 'wholesale';
  const categoryOptions = getCategoryOptions(values.category);
  const availableUnits = getUnitOptions(values.unit);

  const matchedCommodity = matchCommodity(values.name);
  const marketReference = matchedCommodity && marketResult.commodityId === matchedCommodity.id ? marketResult.reference : null;

  useEffect(() => {
    if (!matchedCommodity || values.isDonation) return undefined;

    let cancelled = false;
    fetchAnnualPriceTrend(matchedCommodity.id, 3)
      .then((points) => {
        if (cancelled) return;
        const latest = [...points].reverse().find((point) => point.price != null);
        setMarketResult({
          commodityId: matchedCommodity.id,
          reference: latest ? {
            commodityId: matchedCommodity.id,
            commodityLabel: matchedCommodity.label,
            referencePrice: latest.price,
            referenceYear: latest.year,
          } : null,
        });
      })
      .catch(() => {
        if (!cancelled) setMarketResult({ commodityId: matchedCommodity.id, reference: null });
      });

    return () => {
      cancelled = true;
    };
  }, [matchedCommodity, values.isDonation]);

  // PSA's price is always per kg, but a farmer can list by sack/bundle/piece/crate — so
  // any comparison against PSA (deviation check, recommendation) has to go through a
  // kg-per-unit conversion the farmer supplies, except when the unit already is kg.
  const isKgUnit = values.unit === 'kg';
  const kgPerUnitValue = isKgUnit ? 1 : Number(values.kgPerUnit);
  const hasKgConversion = isKgUnit || (values.kgPerUnit !== '' && Number.isFinite(kgPerUnitValue) && kgPerUnitValue > 0);

  const pricePerKg = hasKgConversion && values.price ? Number(values.price) / kgPerUnitValue : null;
  const deviationPct = marketReference && pricePerKg != null
    ? Number((((pricePerKg - marketReference.referencePrice) / marketReference.referencePrice) * 100).toFixed(1))
    : null;
  const recommendedPricePerKg = marketReference ? getRecommendedPrice(marketReference.referencePrice) : null;
  const recommendedPrice = recommendedPricePerKg && hasKgConversion
    ? { ...recommendedPricePerKg, price: Math.ceil(recommendedPricePerKg.price * kgPerUnitValue * 2) / 2 }
    : null;
  const isOverThreshold = deviationPct != null && deviationPct > PRICE_DEVIATION_THRESHOLD_PERCENT;
  const hasTypedName = values.name.trim().length > 0;
  const isLoadingReference = Boolean(matchedCommodity) && marketResult.commodityId !== matchedCommodity.id;

  // Self-reported fallback for when PSA has no data at all for this product — the farmer's
  // own cost is already in their chosen selling unit, so the margin applies directly with
  // no kg conversion needed.
  const costNum = Number(values.costPrice);
  const manualRecommendation = costNum > 0 ? getRecommendedPrice(costNum) : null;

  const updateField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  // Reuses the persisted "Cost per unit" field below (see the form-grid three block) rather
  // than asking for cost a second time here — this section just reacts to it.
  const costRecommendationSection = manualRecommendation ? (
    <p className="price-recommendation">
      <strong>Recommended price: ₱{manualRecommendation.price.toFixed(2)}/{values.unit}</strong>
      <span> — {manualRecommendation.marginPercent}% above your stated cost, since there's no PSA reference to compare against for this product.</span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => updateField('price', String(manualRecommendation.price))}
      >
        Use this price
      </Button>
    </p>
  ) : (
    <p className="price-recommendation">Enter your cost per {values.unit} below to see a recommended price for this product.</p>
  );

  const handleUnitChange = (event) => {
    updateField('unit', event.target.value);
    updateField('kgPerUnit', '');
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsReadingImage(true);
      const url = await uploadProductImage(file, currentUser.id);
      updateField('image', url);
    } catch {
      setErrors((previous) => ({ ...previous, image: 'Unable to upload this image.' }));
    } finally {
      setIsReadingImage(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateProductForm(values, availableUnits);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setIsSubmitting(true);
    let reference = marketReference;
    // If the background PSA check for this commodity hasn't resolved yet, fetch it
    // directly here (bounded by fetchAnnualPriceTrend's own timeout) so the price-review
    // decision still uses real data — without ever making the farmer wait before they
    // can even click submit.
    if (!values.isDonation && matchedCommodity && marketResult.commodityId !== matchedCommodity.id) {
      try {
        const points = await fetchAnnualPriceTrend(matchedCommodity.id, 3);
        const latest = [...points].reverse().find((point) => point.price != null);
        reference = latest
          ? { commodityId: matchedCommodity.id, commodityLabel: matchedCommodity.label, referencePrice: latest.price, referenceYear: latest.year }
          : null;
      } catch {
        reference = null;
      }
    }

    setIsSubmitting(false);
    onSubmit({ ...values, marketReference: reference });
    if (!product) setValues(buildDefaultValues(null, currentUser));
  };

  return (
    <form id={formId} className="form-stack" onSubmit={handleSubmit}>
      {hasErrors(errors) ? (
        <div className="form-alert error">
          <strong>{Object.keys(errors).filter((key) => errors[key]).length > 1 ? 'Fix these before adding:' : 'Fix this before adding:'}</strong>
          <ul>
            {FIELD_ORDER.filter((field) => errors[field]).map((field) => (
              <li key={field}>{FIELD_LABELS[field] || field}: {errors[field]}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="form-section">
        <p className="form-section-heading">Basic information</p>
        <div className="form-grid">
          <FormField label="Category" name="category" error={errors.category}>
            <select id="category" value={values.category} onChange={(event) => updateField('category', event.target.value)}>
              {categoryOptions.map((category) => <option key={category}>{category}</option>)}
            </select>
          </FormField>
          <FormField label="Product" name="name" error={errors.name}>
            <input id="name" value={values.name} onChange={(event) => updateField('name', event.target.value)} placeholder="e.g. Cabbage" />
          </FormField>
        </div>

        <FormField label="Grade" name="grade" error={errors.grade}>
          <div className="segmented-control" role="radiogroup" aria-label="Product grade">
            {PRODUCT_GRADES.map((grade) => (
              <button
                key={grade.value}
                type="button"
                className={values.grade === grade.value ? 'active' : ''}
                onClick={() => updateField('grade', grade.value)}
              >
                {grade.label}
              </button>
            ))}
          </div>
        </FormField>
      </div>

      <div className="form-section">
        <p className="form-section-heading">Pricing</p>

        {!product ? (
          <label className="price-hint donation-toggle">
            <input
              type="checkbox"
              checked={values.isDonation}
              onChange={(event) => updateField('isDonation', event.target.checked)}
            />
            <div>
              <strong><Gift size={15} /> Donate this listing</strong>
              <span> — Skips pricing and goes straight to partner organizations (orphanages, elder-care homes, NGOs, food banks) instead of the marketplace.</span>
            </div>
          </label>
        ) : null}

        {!values.isDonation ? (
          <FormField label="Sales type" name="sellingType" error={errors.sellingType}>
            <div className="segmented-control" role="radiogroup" aria-label="Sales type">
              {SALES_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  className={values.sellingType === type.value ? 'active' : ''}
                  onClick={() => updateField('sellingType', type.value)}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </FormField>
        ) : null}

        {!values.isDonation && isWholesale ? (
          <FormField
            label="Minimum Order Quantity (MOQ)"
            name="moq"
            error={errors.moq}
            helper={`Buyers must order at least this much ${values.unit} to purchase.`}
          >
            <input
              id="moq"
              type="number"
              min="0"
              step="0.01"
              value={values.moq}
              onChange={(event) => updateField('moq', event.target.value)}
              placeholder="50"
            />
          </FormField>
        ) : null}

        <div className={values.isDonation ? 'form-grid' : 'form-grid three'}>
          {!values.isDonation ? (
            <FormField label={isWholesale ? 'Wholesale price' : 'Price'} name="price" error={errors.price}>
              <input id="price" type="number" min="0" step="0.01" value={values.price} onChange={(event) => updateField('price', event.target.value)} placeholder="55.00" />
            </FormField>
          ) : null}
          <FormField label="Unit" name="unit" error={errors.unit}>
            <select id="unit" value={values.unit} onChange={handleUnitChange}>
              <option value="">Select a unit</option>
              {availableUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </FormField>
          <FormField label="Quantity available" name="quantity" error={errors.quantity}>
            <input id="quantity" type="number" min="0" step="0.01" value={values.quantity} onChange={(event) => updateField('quantity', event.target.value)} placeholder="100" />
          </FormField>
        </div>

        <FormField
          label="Expiration date (optional)"
          name="expirationDate"
          error={errors.expirationDate}
          helper={values.isDonation ? 'Helps partner organizations prioritize pickup before it spoils.' : 'Shows an expiring-soon warning on your listing as the date approaches.'}
        >
          <input
            id="expirationDate"
            type="date"
            value={values.expirationDate}
            onChange={(event) => updateField('expirationDate', event.target.value)}
          />
        </FormField>

        {!values.isDonation ? (
          <FormField
            label="Cost per unit (optional)"
            name="costPrice"
            error={errors.costPrice}
            helper={`Your own cost to grow/prepare 1 ${values.unit} (harvesting, inputs, labor) — never shown to buyers. Powers the profit figure on your dashboard.`}
          >
            <input
              id="costPrice"
              type="number"
              min="0"
              step="0.01"
              value={values.costPrice}
              onChange={(event) => updateField('costPrice', event.target.value)}
              placeholder="e.g. 30.00"
            />
          </FormField>
        ) : null}

        {!values.isDonation && !isKgUnit && values.unit ? (
          <FormField
            label={`How many kg is 1 ${values.unit}?`}
            name="kgPerUnit"
            error={errors.kgPerUnit}
            helper="PSA market prices are per kg — this converts them to a fair price for your unit."
          >
            <input
              id="kgPerUnit"
              type="number"
              min="0"
              step="0.01"
              value={values.kgPerUnit}
              onChange={(event) => updateField('kgPerUnit', event.target.value)}
              placeholder="e.g. 2"
            />
          </FormField>
        ) : null}

        {!values.isDonation && hasTypedName ? (
          <div className={`price-hint ${isOverThreshold ? 'warning' : ''}`}>
            {isOverThreshold ? <TriangleAlert size={16} /> : <Info size={16} />}
            <div>
              {isLoadingReference ? (
                <strong>Checking PSA market prices…</strong>
              ) : marketReference ? (
                <>
                  <strong>PSA farmgate reference: ₱{marketReference.referencePrice.toFixed(2)}/kg</strong>
                  <span> — {marketReference.commodityLabel}, Central Visayas ({marketReference.referenceYear})</span>
                  {recommendedPrice ? (
                    <p className="price-recommendation">
                      <strong>Recommended price: ₱{recommendedPrice.price.toFixed(2)}/{values.unit}</strong>
                      <span>
                        {' '}— {recommendedPrice.marginPercent}% above the PSA farmgate reference (converted using your
                        1 {values.unit} = {kgPerUnitValue}kg). That reference is what a trader would pay you, not what a
                        buyer pays; local wholesale/retail markups over it commonly run 40-60%+, so this keeps you
                        profitable after harvesting, packing, and delivery while still pricing below typical retail.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => updateField('price', String(recommendedPrice.price))}
                      >
                        Use this price
                      </Button>
                    </p>
                  ) : !isKgUnit ? (
                    <p className="price-recommendation">
                      Enter how many kg 1 {values.unit} is above to see a recommended price for your unit.
                    </p>
                  ) : null}
                  {isOverThreshold ? (
                    <p>Your price is {deviationPct}% above this reference — it will be sent to DTI for review when saved.</p>
                  ) : null}
                </>
              ) : matchedCommodity ? (
                <>
                  <strong>No recent PSA price data</strong>
                  <span> — {matchedCommodity.label} has no published farmgate price for Central Visayas in the last few years.</span>
                  {costRecommendationSection}
                </>
              ) : (
                <>
                  <strong>No PSA market reference available</strong>
                  <span> — "{values.name.trim()}" isn't in PSA's tracked crop list yet.</span>
                  {costRecommendationSection}
                </>
              )}
            </div>
          </div>
        ) : null}

        {product && !values.isDonation ? (
          <FormField label="Discount" name="discount" helper="Discounts are visible to every buyer browsing the marketplace.">
            {product.discountPercent ? (
              <div className="discount-picker">
                <span className="badge badge-sale">-{product.discountPercent}%</span>
                <span className="discount-preview">
                  <span className="price-original">{formatCurrency(product.originalPrice)}</span>
                  {' → '}
                  <strong>{formatCurrency(product.price)}</strong>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={onRemoveDiscount}>Remove discount</Button>
              </div>
            ) : (
              <DiscountControl product={product} onApply={onApplyDiscount} />
            )}
          </FormField>
        ) : null}
      </div>

      <div className="form-section">
        <p className="form-section-heading">Location &amp; description</p>
        <FormField label="Location" name="location" error={errors.location} helper="Cebu municipality where this product is available.">
          <select id="location" value={values.location} onChange={(event) => updateField('location', event.target.value)}>
            {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
          </select>
        </FormField>

        <FormField label="Description" name="description" error={errors.description}>
          <textarea id="description" rows="4" value={values.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Describe freshness, harvest date, pickup notes, or handling requirements." />
        </FormField>
      </div>

      <div className="form-section">
        <p className="form-section-heading">Product image</p>
        <FormField label="Product image" name="image" error={errors.image} helper="Visible to every buyer browsing the marketplace.">
          <input id="image" type="file" accept="image/*" onChange={handleImageChange} />
        </FormField>

        {values.image ? (
          <div className="image-preview">
            <img src={values.image} alt="Product preview" />
            <Button variant="ghost" onClick={() => updateField('image', '')}>Remove image</Button>
          </div>
        ) : null}
      </div>

      {!hideActions ? (
        <div className="form-actions">
          {onCancel ? <Button variant="secondary" onClick={onCancel}>Cancel</Button> : null}
          <Button type="submit" disabled={isReadingImage || isSubmitting}>
            {isSubmitting ? 'Adding…' : product ? 'Save changes' : values.isDonation ? 'List as donation' : 'Add product'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
