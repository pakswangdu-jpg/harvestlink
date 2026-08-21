import { useEffect, useRef, useState } from 'react';
import {
  Gift, MapPin, UploadCloud,
} from 'lucide-react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import PriceRecommendationBreakdown from './PriceRecommendationBreakdown';
import NoMarketDataCard from './NoMarketDataCard';
import CostBasedEstimateCard from './CostBasedEstimateCard';
import HistoricalMarketAnalysisCard from './HistoricalMarketAnalysisCard';
import SellingBelowCostWarning from './SellingBelowCostWarning';
import DiscountCalculator from './DiscountCalculator';
import NewProductDiscountField from './NewProductDiscountField';
import { CEBU_MUNICIPALITIES, PRODUCT_GRADES, SALES_TYPES } from '../../utils/constants';
import { useCatalog } from '../../contexts/CatalogContext';
import {
  fetchAnnualPriceTrend, getRecommendedPrice, matchCommodity, RECOMMENDED_MARGIN_PERCENT,
} from '../../services/marketPriceService';
import { getHistoricalPriceAnalysis } from '../../services/productService';
import { uploadProductImage } from '../../services/uploadService';
import { formatCurrency } from '../../utils/formatters';
import { hasErrors, MAX_PLAUSIBLE_PRICE_PER_KG, validateProductForm } from '../../utils/validators';
import { getFixedKgPerUnit } from '../../utils/unitConversion';

const PRICE_DEVIATION_THRESHOLD_PERCENT = 20;

const PRODUCT_IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PRODUCT_IMAGE_ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const PRODUCT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

// A compact <select> — not a big custom picker — that just routes to whichever hidden file
// input matches the farmer's choice: capture="environment" for the camera one (native camera
// on mobile, plain file picker where a device has no camera to speak of, e.g. desktop), no
// capture attribute for the plain "pick an existing file" one. The select is reset back to
// its placeholder after every pick (it's a one-shot trigger, not a stored selection) so it's
// ready to route another pick the next time. Client-side type/size checks are just an
// immediate, friendly first pass — the upload itself (and its own validation) is still
// whatever uploadProductImage/the storage bucket already enforced.
function ProductImageDropzone({ imageUrl, isUploading, error, onFileSelect, onValidationError, onRemove }) {
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const validateAndSelect = (candidate) => {
    if (!candidate) return;
    const extension = `.${candidate.name.split('.').pop()?.toLowerCase() || ''}`;
    const isAcceptedType = PRODUCT_IMAGE_ACCEPTED_TYPES.includes(candidate.type) || PRODUCT_IMAGE_ACCEPTED_EXTENSIONS.includes(extension);
    if (!isAcceptedType) {
      onValidationError('Only JPG, PNG, or WEBP images are accepted.');
      return;
    }
    if (candidate.size > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
      onValidationError('Image size must be under 5 MB.');
      return;
    }
    onFileSelect(candidate);
  };

  const handleSourceSelect = (event) => {
    const source = event.target.value;
    event.target.value = '';
    if (source === 'camera') cameraInputRef.current?.click();
    else if (source === 'upload') uploadInputRef.current?.click();
  };

  const hiddenFileInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => validateAndSelect(event.target.files?.[0])}
        hidden
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept={PRODUCT_IMAGE_ACCEPTED_EXTENSIONS.join(',')}
        onChange={(event) => validateAndSelect(event.target.files?.[0])}
        hidden
      />
    </>
  );

  if (isUploading) {
    return (
      <div className="verification-upload-dropzone">
        <span className="verification-upload-icon"><UploadCloud size={22} className="animate-pulse" /></span>
        <p>Uploading image…</p>
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className={`product-image-preview${error ? ' has-error' : ''}`}>
        <img src={imageUrl} alt="" className="product-image-preview-img" />
        <div className="product-image-preview-actions">
          <select
            className="product-image-source-select"
            defaultValue=""
            onChange={handleSourceSelect}
            aria-label="Change product image"
          >
            <option value="" disabled>Change image</option>
            <option value="camera">Take Photo</option>
            <option value="upload">Upload Image</option>
          </select>
          <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>Remove</button>
        </div>
        {hiddenFileInputs}
      </div>
    );
  }

  return (
    <>
      <select id="image" defaultValue="" onChange={handleSourceSelect}>
        <option value="" disabled>Select image source</option>
        <option value="camera">Take Photo</option>
        <option value="upload">Upload Image</option>
      </select>
      {hiddenFileInputs}
    </>
  );
}

// Order matches the form's visual top-to-bottom layout, so the first error found here
// is always the first one the farmer would encounter while scrolling down.
const FIELD_ORDER = ['name', 'category', 'grade', 'sellingType', 'moq', 'price', 'discountPercent', 'unit', 'quantity', 'expirationDate', 'costPrice', 'kgPerUnit', 'location', 'description', 'image'];

const FIELD_LABELS = {
  name: 'Product',
  category: 'Category',
  grade: 'Grade',
  sellingType: 'Sales type',
  moq: 'Minimum Order Quantity (MOQ)',
  price: 'Price',
  discountPercent: 'Discount',
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
    description: '',
    image: '',
    status: 'active',
    isDonation: false,
    ...product,
    costPrice: product?.costPrice ?? '',
    // Only ever read/submitted while creating a brand-new listing (see the Discount field
    // below) — editing an existing product uses DiscountCalculator's own live save against
    // product.discountPercent instead, so this always starts blank there.
    discountPercent: '',
    moq: product?.moq ?? '',
    kgPerUnit: product?.kgPerUnit ?? '',
    expirationDate: product?.expirationDate ?? '',
    // Never persisted (see CostBasedEstimateCard.jsx) — only ever drives the live Cost-Based
    // Price Estimate preview, so it always starts at the spec default, edit mode or not.
    markupPercent: RECOMMENDED_MARGIN_PERCENT,
    // Always the farmer's own registered municipality (see the static Location field below)
    // — placed after the ...product spread so it wins even when editing an older listing
    // whose saved location predates a since-updated profile, keeping every listing in sync
    // with the farmer's current account rather than possibly going stale.
    location: currentUser?.municipality || CEBU_MUNICIPALITIES[0],
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
  // Third pricing tier — only fetched once PSA has already answered (see the effect below)
  // so a PSA-covered crop, the common case, never pays for a wasted historical-price query.
  // No separate loading flag — "loading" is derived below by comparing this against the key
  // the current name/unit actually want, the same pattern marketResult/isLoadingReference
  // above already uses.
  const [historicalResult, setHistoricalResult] = useState({ key: null, data: null });

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
            isOverride: Boolean(latest.isOverride),
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

  // PSA's price is always per kg, but a farmer can list by sack/bundle/piece/crate — so any
  // comparison against PSA (deviation check, recommendation) has to go through a kg-per-unit
  // conversion. Units with one universal weight (kg/g/t/L/mL — see unitConversion.js) convert
  // automatically; everything else needs the farmer's own "How many kg is 1 X?" answer.
  const fixedKgPerUnit = getFixedKgPerUnit(values.unit);
  const needsManualConversion = Boolean(values.unit) && fixedKgPerUnit == null;
  const kgPerUnitValue = fixedKgPerUnit ?? Number(values.kgPerUnit);
  const hasKgConversion = fixedKgPerUnit != null || (values.kgPerUnit !== '' && Number.isFinite(kgPerUnitValue) && kgPerUnitValue > 0);

  const pricePerKg = hasKgConversion && values.price ? Number(values.price) / kgPerUnitValue : null;
  const deviationPct = marketReference && pricePerKg != null
    ? Number((((pricePerKg - marketReference.referencePrice) / marketReference.referencePrice) * 100).toFixed(1))
    : null;
  // Convert PSA's per-kg price into the farmer's selling unit FIRST (basePrice = psaPricePerKg
  // × unitWeightKg), then let getRecommendedPrice apply the margin and round once — see that
  // function's own comment for why converting before marking up (rather than after) matters.
  const equivalentPsaPricePerUnit = marketReference && hasKgConversion ? marketReference.referencePrice * kgPerUnitValue : null;
  const recommendedPrice = equivalentPsaPricePerUnit != null ? getRecommendedPrice(equivalentPsaPricePerUnit) : null;
  const isOverThreshold = deviationPct != null && deviationPct > PRICE_DEVIATION_THRESHOLD_PERCENT;
  const hasTypedName = values.name.trim().length > 0;
  const isLoadingReference = Boolean(matchedCommodity) && marketResult.commodityId !== matchedCommodity.id;

  const costNum = Number(values.costPrice);
  // Sanity bound on any cost-based figure, normalized to per-kg (same conversion the PSA
  // comparison above already computes) so it holds a sack-priced and a kg-priced listing to
  // the same real-world bar. Without this, a mistyped cost (an extra digit, or the total
  // cost of a whole harvest typed into a per-unit field) could still produce an equally
  // absurd Cost-Based estimate — the exact bug this catches. Same MAX_PLAUSIBLE_PRICE_PER_KG
  // the submit-blocking validator in validators.js uses, so what's flagged here always
  // matches what submission actually rejects.
  const costPerKg = hasKgConversion && costNum > 0 ? costNum / kgPerUnitValue : null;
  const isCostImplausible = costPerKg != null && costPerKg > MAX_PLAUSIBLE_PRICE_PER_KG;

  // Third pricing tier — real HarvestLink transaction history for this exact product name +
  // unit, platform-wide (see historicalPriceService.js), consulted only once PSA itself has
  // definitively come back with nothing (never both at once — PSA always wins when it has an
  // answer, per the tier order the whole feature is built around).
  const wantsHistoricalLookup = !values.isDonation && hasTypedName && Boolean(values.unit) && !isLoadingReference && !marketReference;
  const historicalKey = wantsHistoricalLookup ? `${values.name.trim().toLowerCase()}::${values.unit}` : null;

  useEffect(() => {
    if (!historicalKey || historicalResult.key === historicalKey) return undefined;

    let cancelled = false;
    getHistoricalPriceAnalysis(values.name.trim(), values.unit)
      .then((data) => { if (!cancelled) setHistoricalResult({ key: historicalKey, data }); })
      .catch(() => { if (!cancelled) setHistoricalResult({ key: historicalKey, data: null }); });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalKey]);

  // Loading whenever we want an answer for this exact key but don't have one yet — the same
  // "derive it, don't store it" style isLoadingReference above uses.
  const isLoadingHistorical = historicalKey != null && historicalResult.key !== historicalKey;
  const historicalAnalysis = !isLoadingHistorical && historicalResult.data?.matched ? historicalResult.data : null;

  // General rule: never recommend selling below production cost — checked against BOTH AI
  // tiers, not just PSA, since the rule itself isn't PSA-specific. Only evaluated once a cost
  // is actually on file (costNum > 0) — with no cost yet there's nothing to compare against,
  // so the normal recommendation still shows (this is what lets a farmer see a PSA/historical
  // price before they've even gotten to the cost field).
  const isPsaRecommendationLoss = Boolean(marketReference) && hasKgConversion && Boolean(recommendedPrice) && costNum > 0 && recommendedPrice.price <= costNum;
  const isHistoricalRecommendationLoss = Boolean(historicalAnalysis) && costNum > 0 && historicalAnalysis.recommendedPrice <= costNum;

  const updateField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleUnitChange = (event) => {
    updateField('unit', event.target.value);
    updateField('kgPerUnit', '');
  };

  const handleImageSelect = async (file) => {
    if (!file) return;
    setErrors((previous) => ({ ...previous, image: undefined }));

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
          ? {
            commodityId: matchedCommodity.id,
            commodityLabel: matchedCommodity.label,
            referencePrice: latest.price,
            referenceYear: latest.year,
            isOverride: Boolean(latest.isOverride),
          }
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
          <div className="donation-toggle-wrap">
            <label className="donation-toggle">
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
            {values.isDonation ? (
              <p className="donation-toggle-note">This product will be donated instead of sold through the marketplace.</p>
            ) : null}
          </div>
        ) : null}

        <FormField label="Sales type" name="sellingType" error={errors.sellingType}>
          <div className={`segmented-control${values.isDonation ? ' is-disabled' : ''}`} role="radiogroup" aria-label="Sales type" aria-disabled={values.isDonation}>
            {SALES_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                disabled={values.isDonation}
                className={values.sellingType === type.value ? 'active' : ''}
                onClick={() => updateField('sellingType', type.value)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </FormField>

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

        <div className="form-grid three">
          <FormField label={isWholesale ? 'Wholesale price' : 'Price'} name="price" error={errors.price}>
            <input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              onChange={(event) => updateField('price', event.target.value)}
              placeholder="55.00"
              disabled={values.isDonation}
            />
          </FormField>
          <FormField label="Unit" name="unit" error={errors.unit}>
            <select id="unit" value={values.unit} onChange={handleUnitChange}>
              <option value="">Select a unit</option>
              {availableUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </FormField>
          <FormField label="Quantity available" name="quantity" error={errors.quantity}>
            {/* step="any" — a fractional step made the spinner's first click jump to "0.01" before any typing */}
            <input id="quantity" type="number" min="0" step="any" value={values.quantity} onChange={(event) => updateField('quantity', event.target.value)} placeholder="100" />
          </FormField>
        </div>

        {!product && !values.isDonation ? (
          <FormField
            label="Discount (optional)"
            name="discountPercent"
            error={errors.discountPercent}
            helper="Optional promotional discount visible to buyers — leave blank to list at full price."
          >
            <NewProductDiscountField
              percent={values.discountPercent}
              onChange={(value) => updateField('discountPercent', value)}
              price={values.price}
              unit={values.unit}
            />
          </FormField>
        ) : null}

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

        <FormField
          label="Cost per unit"
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
            disabled={values.isDonation}
          />
        </FormField>

        {!values.isDonation && needsManualConversion ? (
          <FormField
            label={`Weight of one ${values.unit} (kg)`}
            name="kgPerUnit"
            error={errors.kgPerUnit}
            helper="PSA market prices are per kg — this converts them to a fair price for your unit. Depends on what you're selling, so we never guess it for you."
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

        {/* Tier order is the whole point of this feature: PSA > HarvestLink's own verified
            transaction history > a plain cost+markup estimate that's explicitly labeled as
            NOT an AI recommendation > an honest "we have nothing" card. Never more than one
            tier renders at once, and a lower tier is only ever reached once every tier above
            it has definitively come back empty — see the effects above for how PSA and
            historical data are each fetched. Either AI tier is further replaced outright by
            SellingBelowCostWarning the moment its own recommendation would sell at a loss —
            never shown alongside/nested in the normal card, since there's nothing safe to
            recommend in that case. */}
        {!values.isDonation && hasTypedName ? (
          isLoadingReference || isLoadingHistorical ? (
            <div className="price-analysis-card">
              <p className="price-analysis-card-title">Checking market data…</p>
            </div>
          ) : isPsaRecommendationLoss ? (
            <SellingBelowCostWarning
              costPrice={costNum}
              unit={values.unit}
              marketPriceLabel="PSA Price"
              marketPriceValue={marketReference.referencePrice}
              marketPriceUnit="kg"
              recommendedPrice={recommendedPrice}
              currentPrice={values.price}
            />
          ) : marketReference ? (
            <div className={`price-analysis-card tone-ai${isOverThreshold ? ' warning' : ''}`}>
              <p className="price-analysis-card-title">
                <span>
                  {marketReference.isOverride ? 'Reference price' : 'PSA farmgate reference'}: {formatCurrency(marketReference.referencePrice)}/kg
                </span>
                {marketReference.isOverride ? <span className="badge badge-verified price-hint-badge">Set by admin</span> : null}
              </p>
              <p className="price-analysis-card-desc">
                {marketReference.commodityLabel}, Central Visayas ({marketReference.referenceYear})
                {marketReference.isOverride ? ', overriding the PSA figure for this year' : ''}
              </p>
              {hasKgConversion ? (
                <PriceRecommendationBreakdown
                  unit={values.unit}
                  kgPerUnitValue={kgPerUnitValue}
                  referencePrice={marketReference.referencePrice}
                  equivalentPsaPricePerUnit={equivalentPsaPricePerUnit}
                  recommendedPrice={recommendedPrice}
                  costPrice={values.costPrice}
                  onUsePrice={(price) => updateField('price', String(price))}
                />
              ) : (
                <p className="price-analysis-prompt">
                  Enter how many kg 1 {values.unit} is above to see a recommended price for your unit.
                </p>
              )}
              {isOverThreshold ? (
                <p className="price-analysis-warning-note">
                  Your price is {deviationPct}% above this reference — it will be sent to DTI for review when saved.
                </p>
              ) : null}
            </div>
          ) : isHistoricalRecommendationLoss ? (
            <SellingBelowCostWarning
              costPrice={costNum}
              unit={values.unit}
              marketPriceLabel="Historical Average Price"
              marketPriceValue={historicalAnalysis.averagePrice}
              marketPriceUnit={values.unit}
              recommendedPrice={{ price: historicalAnalysis.recommendedPrice }}
              currentPrice={values.price}
            />
          ) : historicalAnalysis ? (
            <HistoricalMarketAnalysisCard
              analysis={historicalAnalysis}
              unit={values.unit}
              onUsePrice={(price) => updateField('price', String(price))}
            />
          ) : costNum > 0 ? (
            <CostBasedEstimateCard
              costPrice={costNum}
              unit={values.unit}
              markupPercent={values.markupPercent}
              onMarkupChange={(value) => updateField('markupPercent', value)}
              isImplausible={isCostImplausible}
              costPerKg={costPerKg}
            />
          ) : (
            <NoMarketDataCard />
          )
        ) : null}

        {product && !values.isDonation ? (
          <FormField label="Discount" name="discount" helper="Optional promotional discount visible to buyers.">
            <DiscountCalculator
              product={product}
              costPrice={values.costPrice}
              onApplyDiscount={onApplyDiscount}
              onRemoveDiscount={onRemoveDiscount}
            />
          </FormField>
        ) : null}
      </div>

      <div className="form-section">
        <p className="form-section-heading">Location &amp; description</p>
        <FormField
          label="Location"
          name="location"
          error={errors.location}
          helper="Set from your registered farm municipality — update it in your profile to change this."
        >
          <div id="location" className="static-field location-badge">
            <MapPin size={15} />
            {values.location}
          </div>
        </FormField>

        <FormField label="Description" name="description" error={errors.description}>
          <textarea
            id="description"
            rows="6"
            value={values.description}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Describe freshness, harvest date, storage condition, pickup notes, or additional information."
          />
        </FormField>
      </div>

      <div className="form-section">
        <p className="form-section-heading">Product image</p>
        <FormField label="Product image" name="image" error={errors.image} helper={!values.image ? 'Visible to every buyer browsing the marketplace.' : undefined}>
          <ProductImageDropzone
            imageUrl={values.image}
            isUploading={isReadingImage}
            error={errors.image}
            onFileSelect={handleImageSelect}
            onValidationError={(message) => setErrors((previous) => ({ ...previous, image: message }))}
            onRemove={() => updateField('image', '')}
          />
        </FormField>
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
