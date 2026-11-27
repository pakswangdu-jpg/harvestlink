import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Gift, Image as ImageIcon, MapPin, UploadCloud,
} from 'lucide-react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import ProductPriceReviewNotice from '../products/ProductPriceReviewNotice';
import PriceRecommendationBreakdown from './PriceRecommendationBreakdown';
import NoMarketDataCard from './NoMarketDataCard';
import CostBasedEstimateCard from './CostBasedEstimateCard';
import HistoricalMarketAnalysisCard from './HistoricalMarketAnalysisCard';
import SellingBelowCostWarning from './SellingBelowCostWarning';
import DiscountCalculator from './DiscountCalculator';
import NewProductDiscountField from './NewProductDiscountField';
import { CEBU_MUNICIPALITIES, PRODUCT_GRADES, SALES_TYPES } from '../../utils/constants';
import { readStorage, writeStorage } from '../../services/storageService';
import { useToast } from '../../contexts/ToastContext';
import { useCatalog } from '../../contexts/CatalogContext';
import { supabase } from '../../lib/supabaseClient';
import {
  getPriceRecommendation, MARKET_COMMODITIES, matchCommodity, RECOMMENDED_MARGIN_PERCENT,
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









const MAX_PRODUCT_IMAGES = 10;

function ProductImageDropzone({ imageUrls, isUploading, error, onFilesSelect, onValidationError, onRemove }) {
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const cameraDialogRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  const validateAndSelect = (candidates) => {
    const files = Array.from(candidates || []).filter(Boolean);
    if (!files.length) return;
    if (imageUrls.length + files.length > MAX_PRODUCT_IMAGES) {
      onValidationError(`A product can have up to ${MAX_PRODUCT_IMAGES} photos.`);
      return;
    }
    for (const candidate of files) {
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
    }
    onFilesSelect(files);
  };

  const closeCamera = () => {
    cameraDialogRef.current?.close();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOpen(false);
  };

  useEffect(() => {
    if (!isCameraOpen) return undefined;

    const dialog = cameraDialogRef.current;
    if (!dialog.open) dialog.showModal();
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
        if (!cancelled) {
          cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
          cameraStreamRef.current = null;
          setCameraReady(false);
          setCameraError('The camera could not start. Check camera permissions or upload an image.');
        }
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      dialog.close();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [isCameraOpen]);

  const openCamera = () => {
    setCameraError('');
    setCameraReady(false);
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      setIsCameraOpen(true);
    } else {

      cameraInputRef.current?.click();
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const stream = cameraStreamRef.current;
    if (!stream || !cameraReady) return;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError('The camera is still starting. Try again in a moment.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('The photo could not be captured. Try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCameraReady(false);
    setCameraError('');
    canvas.toBlob((blob) => {
      if (cameraStreamRef.current !== stream) return;
      if (!blob) {
        setCameraReady(true);
        setCameraError('The photo could not be captured. Try again.');
        return;
      }
      validateAndSelect([new File([blob], `product-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
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
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          validateAndSelect(files);
        }}
        hidden
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept={PRODUCT_IMAGE_ACCEPTED_EXTENSIONS.join(',')}
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          validateAndSelect(files);
        }}
        hidden
      />
      {isCameraOpen ? createPortal(








        <dialog
          ref={cameraDialogRef}
          className="product-camera-modal"
          aria-labelledby="product-camera-title"
          onClick={(event) => { if (event.target === event.currentTarget) closeCamera(); }}
          onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
          onCancel={(event) => {
            event.preventDefault();
            closeCamera();
          }}
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
              <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview" onPlaying={() => setCameraReady(true)} />
            </div>
            <div className="product-camera-actions">
              <button type="button" className="btn btn-secondary btn-md" onClick={closeCamera}>Cancel</button>
              {cameraError && !cameraReady ? (
                <button type="button" className="btn btn-primary btn-md" onClick={() => {
                  closeCamera();
                  uploadInputRef.current?.click();
                }}>Upload images</button>
              ) : null}
              <button type="button" className="btn btn-primary btn-md" onClick={capturePhoto} disabled={!cameraReady}>
                Capture photo
              </button>
            </div>
          </div>
        </dialog>,
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

  if (imageUrls.length) {
    return (
      <div className={`product-image-preview${error ? ' has-error' : ''}`}>
        <div className="product-image-preview-grid">
          {imageUrls.map((imageUrl, index) => (
            <div className="product-image-preview-item" key={`${imageUrl}-${index}`}>
              <img src={imageUrl} alt={`Product photo ${index + 1}`} className="product-image-preview-img" />
              {index === 0 ? <span className="product-image-primary-badge">Cover</span> : null}
              <button type="button" className="product-image-remove" onClick={() => onRemove(index)} aria-label={`Remove product photo ${index + 1}`}>×</button>
            </div>
          ))}
        </div>
        <div className="product-image-preview-actions">
          <strong>{imageUrls.length} of {MAX_PRODUCT_IMAGES} photos</strong>
          {imageUrls.length < MAX_PRODUCT_IMAGES ? (
            <select
              className="product-image-source-select"
              defaultValue=""
              onChange={handleSourceSelect}
              aria-label="Add product photos"
            >
              <option value="" disabled>Add photos</option>
              <option value="camera">Take Photo</option>
              <option value="upload">Upload Images</option>
            </select>
          ) : <span className="muted">Photo limit reached</span>}
          {error ? <p className="product-image-error" role="alert">{error}</p> : null}
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
        <span>Add product photos</span>
        <small>Up to 10 JPG, PNG, or WEBP photos · 5 MB each</small>
        <select id="image" className="product-image-empty-select" defaultValue="" onChange={handleSourceSelect}>
          <option value="" disabled>Select image source</option>
          <option value="camera">Take Photo</option>
          <option value="upload">Upload Images</option>
        </select>
      </div>
      {hiddenFileInputs}
    </>
  );
}



const FIELD_ORDER = ['name', 'category', 'grade', 'sellingType', 'moq', 'price', 'discountPercent', 'unit', 'quantity', 'expirationDate', 'expirationTime', 'costPrice', 'kgPerUnit', 'location', 'description', 'image'];

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
    unit: '',
    quantity: '',
    description: '',
    image: '',
    status: 'active',
    isDonation: false,
    ...product,
    price: product?.discountPercent > 0 && product?.originalPrice != null
      ? product.originalPrice
      : (product?.price ?? ''),
    imageUrls: Array.isArray(product?.imageUrls) && product.imageUrls.length
      ? product.imageUrls.slice(0, MAX_PRODUCT_IMAGES)
      : product?.image ? [product.image] : [],
    costPrice: product?.costPrice ?? '',



    discountPercent: product?.discountPercent != null ? String(product.discountPercent) : '',
    moq: product?.moq ?? '',
    kgPerUnit: product?.kgPerUnit ?? '',
    expirationDate: product?.expirationDate ?? '',
    expirationTime: product?.expirationTime ?? '',
    wholesaleEnabled: product?.sellingType !== 'wholesale' && product?.wholesalePrice != null,
    wholesalePrice: product?.wholesalePrice ?? '',
    wholesaleMinQuantity: product?.wholesaleMinQuantity ?? '',
    handlingCostPerOrder: '',
    targetProfitMargin: '',

    markupPercent: RECOMMENDED_MARGIN_PERCENT,




    location: currentUser?.municipality || CEBU_MUNICIPALITIES[0],
  };
}

export default function ProductForm({
  product, currentUser, onSubmit, onCancel, formId, hideActions = false, onSubmittingChange,
  onApplyDiscount, onRemoveDiscount, draftStorageKey = null,
}) {
  const { getCategoryOptions, getUnitOptions, commodities } = useCatalog();
  const { showToast } = useToast();
  const [values, setValues] = useState(() => {
    const defaults = buildDefaultValues(product, currentUser);
    if (!draftStorageKey || product) return defaults;
    const draft = readStorage(draftStorageKey, {});
    const imageUrls = Array.isArray(draft.imageUrls)
      ? draft.imageUrls.slice(0, MAX_PRODUCT_IMAGES)
      : draft.image ? [draft.image] : [];
    return {
      ...defaults,
      ...draft,
      wholesaleEnabled: false,
      wholesalePrice: '',
      wholesaleMinQuantity: '',
      imageUrls,
      image: imageUrls[0] || '',
    };
  });
  const [errors, setErrors] = useState({});
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [marketResult, setMarketResult] = useState({
    commodityId: null, reference: null, recommendation: null, loading: false, error: '',
  });
  const draftStorageFailed = useRef(false);





  const [historicalResult, setHistoricalResult] = useState({ key: null, data: null });

  useEffect(() => {
    onSubmittingChange?.(isSubmitting || isReadingImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitting, isReadingImage]);

  useEffect(() => {
    if (!draftStorageKey || product) return;
    try {
      writeStorage(draftStorageKey, values);
      draftStorageFailed.current = false;
    } catch (error) {
      if (!draftStorageFailed.current) {
        showToast({ type: 'error', message: error.message || 'Unable to save your product draft.' });
      }
      draftStorageFailed.current = true;
    }
  }, [draftStorageKey, product, values, showToast]);

  const isWholesale = values.sellingType === 'wholesale';
  const categoryOptions = getCategoryOptions(values.category);
  const availableUnits = getUnitOptions(values.unit);

  const matchedCommodity = useMemo(
    () => matchCommodity(values.name, commodities),
    [values.name, commodities],
  );
  const marketReference = matchedCommodity && marketResult.commodityId === matchedCommodity.id ? marketResult.reference : null;

  useEffect(() => {
    if (!matchedCommodity || values.isDonation) return undefined;

    let cancelled = false;
    const requestUnit = values.unit || matchedCommodity.defaultUnit || 'kg';
    const loadRecommendation = () => {
      setMarketResult((previous) => ({
        ...previous,
        commodityId: matchedCommodity.id,
        loading: true,
        error: '',
      }));
      getPriceRecommendation(matchedCommodity.id, {
        unit: requestUnit,
        kgPerUnit: values.kgPerUnit,
        quantity: values.quantity || '0',
        costPrice: values.costPrice === '' ? null : values.costPrice,
        productName: values.name.trim(),
        sellingType: values.sellingType,
        moq: values.moq === '' ? null : values.moq,
        handlingCostPerOrder: values.handlingCostPerOrder === '' ? null : values.handlingCostPerOrder,
        targetProfitMargin: values.targetProfitMargin === '' ? null : values.targetProfitMargin,
        sellingPrice: values.price === '' ? null : values.price,
        historicalAverage: historicalResult.data?.matched ? historicalResult.data.averagePrice : null,
        historicalLowest: historicalResult.data?.matched ? historicalResult.data.lowestPrice : null,
        historicalHighest: historicalResult.data?.matched ? historicalResult.data.highestPrice : null,
        historicalTrend: historicalResult.data?.matched ? historicalResult.data.trend : null,
        orderCount: historicalResult.data?.matched ? historicalResult.data.orderCount : 0,
      }).then((result) => {
        if (cancelled) return;
        const reference = result.referencePrice == null ? null : {
          commodityId: result.commodityId,
          commodityLabel: result.commodityLabel,
          referencePrice: result.referencePrice,
          referenceUnit: result.referenceUnit,
          referenceMarketType: result.referenceMarketType || values.sellingType,
          referenceYear: result.referenceYear,
          effectiveDate: result.effectiveDate,
          source: result.source,
          supportingReference: result.supportingReference,
          isOverride: result.source !== 'psa',
        };
        setMarketResult({
          commodityId: matchedCommodity.id,
          reference,
          recommendation: result.available ? {
            salesType: result.salesType || values.sellingType,
            price: result.recommendedUnitPrice,
            retailRecommendedPrice: result.retailRecommendedPrice,
            pricingBasis: result.pricingBasis,
            wholesaleMarketDataAvailable: result.wholesaleMarketDataAvailable,
            insufficientMarketData: result.insufficientMarketData,
            estimatedTotal: result.estimatedTotal,
            unit: result.requestedUnit,
            priceRange: result.priceRange,
            marketTrend: result.marketTrend,
            marketTrendPercent: result.marketTrendPercent,
            adjustmentPercent: result.adjustmentPercent,
            costPrice: result.costPrice,
            handlingCostPerOrder: result.handlingCostPerOrder,
            handlingCostPerUnit: result.handlingCostPerUnit,
            totalCostPerUnit: result.totalCostPerUnit,
            breakEvenCost: result.breakEvenCost,
            targetProfitMargin: result.targetProfitMargin,
            moq: result.moq,
            moqExceedsStock: result.moqExceedsStock,
            minimumOrderTotal: result.minimumOrderTotal,
            estimatedStockValue: result.estimatedStockValue,
            totalExpenses: result.totalExpenses,
            estimatedGrossProfit: result.estimatedGrossProfit,
            estimatedProfit: result.estimatedProfit,
            profitMargin: result.profitMargin,
            isBelowBreakEven: result.isBelowBreakEven,
            isEnteredPriceBelowBreakEven: result.isEnteredPriceBelowBreakEven,
            belowMarketFloor: result.belowMarketFloor,
            aboveMarketCeiling: result.aboveMarketCeiling,
            whyThisPrice: result.whyThisPrice,
            wholesaleVsRetailExplanation: result.wholesaleVsRetailExplanation,
            formulaLines: result.formulaLines,
            dataSource: result.dataSource,
            dataUpdatedAt: result.dataUpdatedAt,
            aiSummary: result.aiSummary,
            aiRecommendation: result.aiRecommendation,
            recommendationMethod: result.recommendationMethod,
          } : null,
          unavailableReason: result.reason || '',
          unavailableMessage: !result.available ? (result.whyThisPrice || '') : '',
          loading: false,
          error: '',
        });
      }).catch((error) => {
        if (cancelled) return;
        setMarketResult({
          commodityId: matchedCommodity.id,
          reference: null,
          recommendation: null,
          loading: false,
          error: error.message || 'Could not load the current reference price.',
        });
      });
    };

    const timeout = window.setTimeout(loadRecommendation, 220);
    const channel = supabase
      .channel(`farmer-reference-${matchedCommodity.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'market_price_overrides',
        filter: `commodity_id=eq.${matchedCommodity.id}`,
      }, loadRecommendation)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'commodity_catalog',
        filter: `id=eq.${matchedCommodity.id}`,
      }, loadRecommendation)
      .subscribe();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [
    matchedCommodity,
    values.isDonation,
    values.unit,
    values.kgPerUnit,
    values.quantity,
    values.costPrice,
    values.name,
    values.sellingType,
    values.moq,
    values.handlingCostPerOrder,
    values.targetProfitMargin,
    values.price,
    historicalResult,
  ]);





  const fixedKgPerUnit = getFixedKgPerUnit(values.unit);
  const needsManualConversion = Boolean(values.unit) && fixedKgPerUnit == null;
  const kgPerUnitValue = fixedKgPerUnit ?? Number(values.kgPerUnit);
  const hasKgConversion = fixedKgPerUnit != null || (values.kgPerUnit !== '' && Number.isFinite(kgPerUnitValue) && kgPerUnitValue > 0);

  const pricePerKg = hasKgConversion && values.price ? Number(values.price) / kgPerUnitValue : null;
  const referencePricePerKg = marketReference
    ? marketReference.referenceUnit === 'kg'
      ? marketReference.referencePrice
      : marketReference.referenceUnit === values.unit && hasKgConversion
        ? marketReference.referencePrice / kgPerUnitValue
        : null
    : null;
  const deviationPct = referencePricePerKg != null && pricePerKg != null
    ? Number((((pricePerKg - referencePricePerKg) / referencePricePerKg) * 100).toFixed(1))
    : null;



  const recommendedPrice = marketResult.commodityId === matchedCommodity?.id ? marketResult.recommendation : null;
  const isOverThreshold = deviationPct != null && deviationPct > PRICE_DEVIATION_THRESHOLD_PERCENT;
  const hasTypedName = values.name.trim().length > 0;
  const isLoadingReference = Boolean(matchedCommodity)
    && (marketResult.commodityId !== matchedCommodity.id || marketResult.loading);

  const costNum = Number(values.costPrice);







  const costPerKg = hasKgConversion && costNum > 0 ? costNum / kgPerUnitValue : null;
  const isCostImplausible = costPerKg != null && costPerKg > MAX_PLAUSIBLE_PRICE_PER_KG;





  const wantsHistoricalLookup = !values.isDonation && hasTypedName && Boolean(values.unit);
  const historicalKey = wantsHistoricalLookup
    ? `${values.name.trim().toLowerCase()}::${values.unit}::${values.costPrice || ''}::${values.quantity || ''}`
    : null;

  useEffect(() => {
    if (!historicalKey || historicalResult.key === historicalKey) return undefined;

    let cancelled = false;
    getHistoricalPriceAnalysis(values.name.trim(), values.unit, {
      costPrice: values.costPrice,
      quantity: values.quantity,
    })
      .then((data) => { if (!cancelled) setHistoricalResult({ key: historicalKey, data }); })
      .catch(() => { if (!cancelled) setHistoricalResult({ key: historicalKey, data: null }); });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalKey]);



  const isLoadingHistorical = historicalKey != null && historicalResult.key !== historicalKey;
  const historicalAnalysis = !isLoadingHistorical && historicalResult.data?.matched ? historicalResult.data : null;






  const breakEvenCostNum = recommendedPrice?.breakEvenCost ?? (costNum > 0 ? costNum : null);
  const moqExceedsStockInline = isWholesale
    && Number(values.moq) > 0
    && Number(values.quantity) > 0
    && Number(values.moq) > Number(values.quantity);

  const isReferenceRecommendationLoss = Boolean(marketReference) && Boolean(recommendedPrice) && breakEvenCostNum != null && recommendedPrice.price < breakEvenCostNum;
  const isHistoricalRecommendationLoss = Boolean(historicalAnalysis) && costNum > 0 && historicalAnalysis.recommendedPrice < costNum;

  const updateField = (field, value) => {
    setValues((previous) => ({
      ...previous,
      [field]: value,
      ...((field === 'sellingType' && value === 'wholesale') || (field === 'isDonation' && value)
        ? { wholesaleEnabled: false, wholesalePrice: '', wholesaleMinQuantity: '' } : {}),
    }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleProductNameChange = (event) => {
    const name = event.target.value;
    const selectedCommodity = matchCommodity(name, commodities);
    setValues((previous) => ({
      ...previous,
      name,
      ...(selectedCommodity?.isCustom ? {
        category: selectedCommodity.category,
        unit: selectedCommodity.unit,
        kgPerUnit: '',
      } : {}),
    }));
    setErrors((previous) => ({ ...previous, name: undefined }));
  };

  const handleUnitChange = (event) => {
    updateField('unit', event.target.value);
    updateField('kgPerUnit', '');
  };

  const handleImageSelect = async (file) => {
    if (!file?.length) return;
    setErrors((previous) => ({ ...previous, image: undefined }));

    try {
      setIsReadingImage(true);
      for (const imageFile of file) {
        const url = await uploadProductImage(imageFile, currentUser.id);
        setValues((previous) => {
          const imageUrls = [...(previous.imageUrls || []), url].slice(0, MAX_PRODUCT_IMAGES);
          return { ...previous, imageUrls, image: imageUrls[0] || '' };
        });
      }
    } catch {
      setErrors((previous) => ({ ...previous, image: 'Unable to upload one or more images. Keep the uploaded photos and try again.' }));
    } finally {
      setIsReadingImage(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const nextErrors = validateProductForm(values, availableUnits, product);
    if (nextErrors.wholesalePrice && !nextErrors.price && product?.wholesalePrice != null) {
      nextErrors.price = `This listing has an existing bulk price of ${formatCurrency(product.wholesalePrice)} for ${product.wholesaleMinQuantity}+ ${product.unit}. Retail price must remain above the saved bulk price.`;
      delete nextErrors.wholesalePrice;
    }
    if (nextErrors.wholesaleMinQuantity && !nextErrors.quantity && product?.wholesaleMinQuantity != null) {
      nextErrors.quantity = `Quantity available must remain at least ${product.wholesaleMinQuantity} ${product.unit} to preserve this listing's existing bulk pricing.`;
      delete nextErrors.wholesaleMinQuantity;
    }
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit({ ...values, marketReference });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form id={formId} className="form-stack product-form" onSubmit={handleSubmit}>
      <ProductPriceReviewNotice product={product} showSubmitted />
      {hasErrors(errors) ? (
        <div className="form-alert error">
          <strong>Please fill up first.</strong>
        </div>
      ) : null}

      <div className="product-form-layout">
        <div className="product-form-column product-form-primary">
      <div className="form-section">
        <p className="form-section-heading">Basic information</p>
        <div className={`form-grid${values.isDonation ? ' two' : ''}`}>
          <FormField label="Category" name="category" error={errors.category}>
            <select id="category" value={values.category} onChange={(event) => updateField('category', event.target.value)}>
              {categoryOptions.map((category) => <option key={category}>{category}</option>)}
            </select>
          </FormField>
          <FormField label="Product" name="name" error={errors.name}>
            <input id="name" list="farmer-commodity-options" value={values.name} onChange={handleProductNameChange} placeholder="e.g. Cabbage" />
            <datalist id="farmer-commodity-options">
              {[...MARKET_COMMODITIES.map((commodity) => commodity.label), ...commodities.map((commodity) => commodity.label)]
                .filter(Boolean)
                .filter((label, index, list) => list.indexOf(label) === index)
                .map((label) => <option key={label} value={label} />)}
            </datalist>
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
          <>
            <FormField
              label="Minimum Order Quantity (MOQ)"
              name="moq"
              error={errors.moq || (moqExceedsStockInline ? 'MOQ cannot exceed the quantity available.' : undefined)}
              helper={`Buyers must order at least this much ${values.unit || 'unit'} to purchase.`}
            >
              <input
                id="moq"
                type="number"
                min="0"
                step="0.01"
                value={values.moq}
                onChange={(event) => updateField('moq', event.target.value)}
                placeholder="e.g. 50"
              />
            </FormField>
            <div className="form-grid">
              <FormField
                label="Handling cost per order (₱)"
                name="handlingCostPerOrder"
                error={errors.handlingCostPerOrder}
                helper="Optional packaging, sorting, or transport cost per wholesale order — divided across MOQ."
              >
                <input
                  id="handlingCostPerOrder"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.handlingCostPerOrder}
                  onChange={(event) => updateField('handlingCostPerOrder', event.target.value)}
                  placeholder="e.g. 250.00"
                />
              </FormField>
              <FormField
                label="Target profit margin (%)"
                name="targetProfitMargin"
                error={errors.targetProfitMargin}
                helper="Desired gross margin (0%–99.9%) for cost-based wholesale price estimates."
              >
                <input
                  id="targetProfitMargin"
                  type="number"
                  min="0"
                  max="99.9"
                  step="0.1"
                  value={values.targetProfitMargin}
                  onChange={(event) => updateField('targetProfitMargin', event.target.value)}
                  placeholder="e.g. 20"
                />
              </FormField>
            </div>
          </>
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

        <div className={`form-grid${values.isDonation ? ' two donation-expiration-grid' : ''}`}>
          <FormField
            label={values.isDonation ? 'Expiration date' : 'Expiration date (optional)'}
            name="expirationDate"
            error={errors.expirationDate}
            helper={values.isDonation ? 'Helps partner organizations prioritize pickup before it spoils.' : 'Shown to buyers; this listing disappears from the marketplace after the date.'}
            className={values.isDonation ? 'donation-expiration-field' : ''}
          >
            <input
              id="expirationDate"
              type="date"
              value={values.expirationDate}
              onChange={(event) => updateField('expirationDate', event.target.value)}
            />
          </FormField>

          {values.isDonation ? (
            <FormField
              label="Expiration time"
              name="expirationTime"
              error={errors.expirationTime}
              helper="Uses Philippines time (Asia/Manila)."
              className="donation-expiration-field"
            >
              <input
                id="expirationTime"
                type="time"
                value={values.expirationTime}
                onChange={(event) => updateField('expirationTime', event.target.value)}
              />
            </FormField>
          ) : null}

          {!values.isDonation ? (
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
              />
            </FormField>
          ) : null}
        </div>

        {values.isDonation ? <p className="form-helper">The donation becomes unavailable automatically when this expiration time is reached.</p> : null}

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
          ) : isReferenceRecommendationLoss ? (
            <SellingBelowCostWarning
              costPrice={breakEvenCostNum}
              unit={values.unit}
              marketPriceLabel={isWholesale ? 'Recommended wholesale price' : 'Reference price'}
              marketPriceValue={recommendedPrice.price}
              marketPriceUnit={values.unit}
              recommendedPrice={recommendedPrice}
              currentPrice={values.price}
            />
          ) : marketReference || (isWholesale && recommendedPrice) ? (
            <div className={`price-analysis-card${isOverThreshold ? ' warning' : ''}`}>
              {marketReference ? (
                <>
                  <p className="price-analysis-card-title">
                    <span>
                      {marketReference.source === 'psa'
                        ? 'PSA farmgate reference'
                        : isWholesale
                          ? 'Effective wholesale reference'
                          : 'Effective retail reference'}: {formatCurrency(marketReference.referencePrice)}/{marketReference.referenceUnit}
                    </span>
                    {marketReference.source === 'admin_entered' ? <span className="badge badge-verified price-hint-badge">Admin-entered</span> : null}
                    {marketReference.source === 'verified_local_market' ? <span className="badge badge-verified price-hint-badge">Verified local survey</span> : null}
                  </p>
                  <p className="price-analysis-card-desc">
                    {marketReference.commodityLabel}
                    {marketReference.source === 'psa' ? `, Central Visayas (${marketReference.referenceYear})` : ` · Effective ${marketReference.effectiveDate}`}
                    {marketReference.supportingReference ? ` · ${marketReference.supportingReference}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="price-analysis-card-title">Cost-Based Wholesale Price Estimate</p>
                  <p className="price-analysis-card-desc">
                    No verified wholesale reference price is available for {matchedCommodity?.label || values.name}. This estimate is calculated from your production cost, handling cost per order, MOQ, and target profit margin (retail reference prices are never substituted).
                  </p>
                </>
              )}
              {recommendedPrice ? (
                <PriceRecommendationBreakdown
                  unit={values.unit}
                  referenceUnit={marketReference?.referenceUnit || values.unit}
                  referencePrice={marketReference?.referencePrice ?? null}
                  recommendedPrice={recommendedPrice}
                  estimatedTotal={recommendedPrice.estimatedTotal}
                  priceRange={recommendedPrice.priceRange}
                  quantity={values.quantity}
                  marketTrend={recommendedPrice.marketTrend}
                  adjustmentPercent={recommendedPrice.adjustmentPercent}
                  costPrice={recommendedPrice.costPrice}
                  estimatedProfit={recommendedPrice.estimatedProfit}
                  profitMargin={recommendedPrice.profitMargin}
                  whyThisPrice={recommendedPrice.whyThisPrice}
                  dataSource={recommendedPrice.dataSource}
                  dataUpdatedAt={recommendedPrice.dataUpdatedAt}
                  aiSummary={recommendedPrice.aiSummary}
                  aiRecommendation={recommendedPrice.aiRecommendation}
                  recommendationMethod={recommendedPrice.recommendationMethod}
                  salesType={values.sellingType}
                  currentPrice={values.price}
                  onUsePrice={(price) => updateField('price', String(price))}
                />
              ) : (
                <p className="price-analysis-prompt">A recommendation is unavailable for {values.unit || 'this unit'}. Choose the registered commodity unit or enter a manual conversion where applicable.</p>
              )}
              {isOverThreshold ? (
                <p className="price-analysis-warning-note">
                  Your price is {deviationPct}% above this reference — it will be sent to an Admin for review when saved.
                </p>
              ) : null}
            </div>
          ) : matchedCommodity ? (
            <div className="price-analysis-card">
              <p className="price-analysis-card-title">
                {isWholesale ? 'Wholesale reference price unavailable' : 'Reference price unavailable'}
              </p>
              <p className="price-analysis-card-desc">
                {marketResult.error
                  ? `Could not load current pricing data: ${marketResult.error}`
                  : marketResult.unavailableMessage
                    || (isWholesale
                      ? 'No active wholesale reference price is available for this commodity. Enter your production cost, MOQ, and target profit margin to calculate a cost-based wholesale estimate, or enter your own wholesale selling price.'
                      : 'There is no active admin reference or PSA price for this commodity. You can still enter your own selling price.')}
              </p>
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
              sellingType={values.sellingType}
              analysis={historicalAnalysis}
              unit={values.unit}
              onUsePrice={(price) => updateField('price', String(price))}
              wholesaleEnabled={false}
              costPrice={values.costPrice}
              availableQuantity={values.quantity}
            />
          ) : costNum > 0 ? (
            <CostBasedEstimateCard
              costPrice={costNum}
              unit={values.unit}
              markupPercent={values.markupPercent}
              onMarkupChange={(value) => updateField('markupPercent', value)}
              isImplausible={isCostImplausible}
              costPerKg={costPerKg}
              wholesaleEnabled={false}
              availableQuantity={values.quantity}
              sellingType={values.sellingType}
              moq={values.moq}
              handlingCostPerOrder={values.handlingCostPerOrder}
              targetProfitMargin={values.targetProfitMargin}
              currentPrice={values.price}
              onUsePrice={(price) => updateField('price', String(price))}
            />
          ) : (
            <NoMarketDataCard />
          )
        ) : null}

        {product && !values.isDonation ? (
          <FormField label="Discount" name="discount" helper="Optional promotional discount visible to buyers.">
            <DiscountCalculator
              product={product}
              currentPrice={values.price}
              costPrice={values.costPrice}
              onApplyDiscount={onApplyDiscount}
              onRemoveDiscount={onRemoveDiscount}
              onDiscountChange={(value) => updateField('discountPercent', value)}
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

        <FormField label="Description (optional)" name="description" error={errors.description}>
          <textarea
            id="description"
            rows="6"
            value={values.description || ''}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Describe freshness, harvest date, storage condition, pickup notes, or additional information."
          />
        </FormField>
      </div>

      <div className="form-section">
        <p className="form-section-heading">Product photos</p>
        <FormField label="Product photos" name="image" error={errors.image} helper={values.imageUrls.length ? 'The first photo is the marketplace cover. Remove it to use the next photo as the cover.' : 'Add up to 10 photos; the first photo is shown as the cover in the marketplace.'}>
          <ProductImageDropzone
            imageUrls={values.imageUrls || []}
            isUploading={isReadingImage}
            error={errors.image}
            onFilesSelect={handleImageSelect}
            onValidationError={(message) => setErrors((previous) => ({ ...previous, image: message }))}
            onRemove={(index) => {
              const imageUrls = values.imageUrls.filter((_, imageIndex) => imageIndex !== index);
              updateField('imageUrls', imageUrls);
              updateField('image', imageUrls[0] || '');
            }}
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
