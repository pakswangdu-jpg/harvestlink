import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Gift, Image as ImageIcon, MapPin, UploadCloud,
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









function ProductImageDropzone({ imageUrl, isUploading, error, onFileSelect, onValidationError, onRemove }) {
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');

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

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOpen(false);
  };

  useEffect(() => {
    if (!isCameraOpen) return undefined;

    let cancelled = false;
    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Live camera capture is not supported here. Choose Upload Image instead.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (!cancelled) setCameraError('Camera access was blocked. You can upload an image instead.');
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [isCameraOpen]);

  const openCamera = () => {
    setCameraError('');
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      setIsCameraOpen(true);
    } else {

      cameraInputRef.current?.click();
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError('The camera is still starting. Try again in a moment.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('The photo could not be captured. Try again.');
        return;
      }
      validateAndSelect(new File([blob], `product-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      closeCamera();
    }, 'image/jpeg', 0.92);
  };

  const handleSourceSelect = (event) => {
    const source = event.target.value;
    event.target.value = '';
    if (source === 'camera') openCamera();
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
      {isCameraOpen ? createPortal(








        <div
          className="product-camera-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-camera-title"
          onClick={(event) => { if (event.target === event.currentTarget) closeCamera(); }}
        >
          <div className="product-camera-card">
            <div className="product-camera-header">
              <div>
                <p className="eyebrow">Product image</p>
                <h3 id="product-camera-title">Take a photo</h3>
              </div>
              <button type="button" className="product-camera-close" onClick={closeCamera} aria-label="Close camera">×</button>
            </div>
            {cameraError ? <p className="product-camera-error" role="alert">{cameraError}</p> : null}
            <div className="product-camera-viewfinder">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview" />
            </div>
            <div className="product-camera-actions">
              <button type="button" className="btn btn-secondary btn-md" onClick={closeCamera}>Cancel</button>
              <button type="button" className="btn btn-primary btn-md" onClick={capturePhoto} disabled={Boolean(cameraError)}>
                Capture photo
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
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
      <div
        className="product-image-empty-state"
        role="button"
        tabIndex="0"
        onClick={(event) => { if (!event.target.closest('select')) openCamera(); }}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('select')) {
            event.preventDefault();
            openCamera();
          }
        }}
      >
        <ImageIcon size={24} strokeWidth={1.8} aria-hidden="true" />
        <span>Add a clear product photo</span>
        <small>JPG, PNG, or WEBP · up to 5 MB</small>
        <select id="image" className="product-image-empty-select" defaultValue="" onChange={handleSourceSelect}>
          <option value="" disabled>Select image source</option>
          <option value="camera">Take Photo</option>
          <option value="upload">Upload Image</option>
        </select>
      </div>
      {hiddenFileInputs}
    </>
  );
}



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



    discountPercent: '',
    moq: product?.moq ?? '',
    kgPerUnit: product?.kgPerUnit ?? '',
    expirationDate: product?.expirationDate ?? '',


    markupPercent: RECOMMENDED_MARGIN_PERCENT,




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





  const fixedKgPerUnit = getFixedKgPerUnit(values.unit);
  const needsManualConversion = Boolean(values.unit) && fixedKgPerUnit == null;
  const kgPerUnitValue = fixedKgPerUnit ?? Number(values.kgPerUnit);
  const hasKgConversion = fixedKgPerUnit != null || (values.kgPerUnit !== '' && Number.isFinite(kgPerUnitValue) && kgPerUnitValue > 0);

  const pricePerKg = hasKgConversion && values.price ? Number(values.price) / kgPerUnitValue : null;
  const deviationPct = marketReference && pricePerKg != null
    ? Number((((pricePerKg - marketReference.referencePrice) / marketReference.referencePrice) * 100).toFixed(1))
    : null;



  const equivalentPsaPricePerUnit = marketReference && hasKgConversion ? marketReference.referencePrice * kgPerUnitValue : null;
  const recommendedPrice = equivalentPsaPricePerUnit != null ? getRecommendedPrice(equivalentPsaPricePerUnit) : null;
  const isOverThreshold = deviationPct != null && deviationPct > PRICE_DEVIATION_THRESHOLD_PERCENT;
  const hasTypedName = values.name.trim().length > 0;
  const isLoadingReference = Boolean(matchedCommodity) && marketResult.commodityId !== matchedCommodity.id;

  const costNum = Number(values.costPrice);







  const costPerKg = hasKgConversion && costNum > 0 ? costNum / kgPerUnitValue : null;
  const isCostImplausible = costPerKg != null && costPerKg > MAX_PLAUSIBLE_PRICE_PER_KG;





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



  const isLoadingHistorical = historicalKey != null && historicalResult.key !== historicalKey;
  const historicalAnalysis = !isLoadingHistorical && historicalResult.data?.matched ? historicalResult.data : null;






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
    <form id={formId} className="form-stack product-form" onSubmit={handleSubmit}>
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

      <div className="product-form-layout">
        <div className="product-form-column product-form-primary">
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
            {                                                                                                    }
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

        <div className="form-grid">
          <FormField
            label="Expiration date (optional)"
            name="expirationDate"
            error={errors.expirationDate}
            helper={values.isDonation ? 'Helps partner organizations prioritize pickup before it spoils.' : 'Shown to buyers; this listing disappears from the marketplace after the date.'}
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
            helper={`Your cost to grow/prepare 1 ${values.unit || 'unit'} — never shown to buyers, powers your profit figure.`}
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
        </div>

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

        {







                                      }
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

        </div>

        <div className="product-form-column product-form-secondary">

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

        </div>
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
