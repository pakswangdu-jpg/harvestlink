import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2, FileText, Loader2, UploadCloud, X, XCircle,
} from 'lucide-react';
import PaymentProgressTracker from '../../components/orders/PaymentProgressTracker';
import StatusBadge from '../../components/common/StatusBadge';
import { getGcashCheckout, submitPaymentProof } from '../../services/paymentService';
import { uploadPaymentReceipt } from '../../services/uploadService';
import { formatCurrency, formatDate, shortOrderId } from '../../utils/formatters';
import logo from '../../assets/logo.png';

const RECEIPT_ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const RECEIPT_ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const RECEIPT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A local datetime string ("2026-07-29T14:30") suitable for an <input type="datetime-local">
// default value — the buyer's own clock, not UTC, so it reads as "right now" to them.
function nowForDatetimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

// Same drag-and-drop pattern as AuthPage.jsx's VerificationDocumentUpload — kept local here
// since the accepted types/labels are payment-receipt specific.
function ReceiptDropzone({ file, error, onFileSelect, onValidationError, onRemove }) {
  const [isDragging, setIsDragging] = useState(false);
  const isImage = file instanceof File && file.type.startsWith('image/');
  const isPdf = file instanceof File && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

  const previewUrl = useMemo(() => (isImage ? URL.createObjectURL(file) : ''), [file, isImage]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const validateAndSelect = (candidate) => {
    if (!candidate) return;
    const extension = `.${candidate.name.split('.').pop()?.toLowerCase() || ''}`;
    const isAcceptedType = RECEIPT_ACCEPTED_TYPES.includes(candidate.type) || RECEIPT_ACCEPTED_EXTENSIONS.includes(extension);
    if (!isAcceptedType) {
      onValidationError('Only PDF, JPG, JPEG, or PNG files are accepted.');
      return;
    }
    if (candidate.size > RECEIPT_MAX_SIZE_BYTES) {
      onValidationError('File size must be under 10 MB.');
      return;
    }
    onFileSelect(candidate);
  };

  if (file instanceof File) {
    return (
      <div className={`verification-upload-preview${error ? ' has-error' : ''}`}>
        {isImage ? (
          <img src={previewUrl} alt="" className="verification-upload-thumb" />
        ) : (
          <span className="verification-upload-icon"><FileText size={22} /></span>
        )}
        <div className="verification-upload-meta">
          <strong>{file.name}</strong>
          <span>{isPdf ? 'PDF document' : 'Image'} · {formatFileSize(file.size)}</span>
        </div>
        <button type="button" className="verification-upload-remove" onClick={onRemove} aria-label="Remove file">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`verification-upload-dropzone${isDragging ? ' dragging' : ''}${error ? ' has-error' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        validateAndSelect(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        id="paymentReceiptFile"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={(event) => validateAndSelect(event.target.files?.[0])}
        className="verification-upload-input"
        aria-label="Upload GCash payment receipt"
      />
      <UploadCloud size={24} className="verification-upload-cloud" />
      <p><strong>Drag and drop</strong> your receipt here, or click to browse</p>
      <span className="verification-upload-hint">JPG, JPEG, PNG, or PDF — up to 10 MB</span>
    </div>
  );
}

// Step 2 (Confirm Your Payment) and Step 3 (Payment Submitted Successfully) of the GCash
// flow — reached from GcashPaymentPage once the buyer says they've paid in their own GCash
// app. Collects proof of payment and hands it to submitPaymentProof, which puts the order
// into paymentVerificationStatus: 'pending' for the farmer to approve/reject (see
// FarmerOrders.jsx's Payment Verification panel).
export default function ConfirmGcashPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // 'loading' | 'form' | 'submitting' | 'success' | 'error'
  const [stage, setStage] = useState('loading');
  const [checkout, setCheckout] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [submittedOrder, setSubmittedOrder] = useState(null);

  const [receiptFile, setReceiptFile] = useState(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [senderName, setSenderName] = useState('');
  const [paymentDatetime, setPaymentDatetime] = useState(nowForDatetimeLocal);
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getGcashCheckout(id)
      .then((result) => {
        if (cancelled) return;
        if (result.order.paymentVerificationStatus === 'pending') {
          navigate(`/orders/${id}`, { replace: true, state: { notice: 'Your payment is already submitted and awaiting verification.' } });
          return;
        }
        setCheckout(result);
        setStage('form');
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.message?.toLowerCase().includes('already been paid')) {
          navigate(`/orders/${id}`, { replace: true });
          return;
        }
        setLoadError(error.message || 'Could not load this payment.');
        setStage('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const handleSubmit = async () => {
    const errors = {};
    if (!receiptFile) errors.receiptFile = 'Upload your payment receipt.';
    if (!referenceNumber.trim()) errors.referenceNumber = 'Enter the GCash reference number.';
    if (!senderName.trim()) errors.senderName = 'Enter the sender name on the payment.';
    if (!paymentDatetime) errors.paymentDatetime = 'Enter the date and time you paid.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setStage('submitting');
    setSubmitError('');
    try {
      const receiptUrl = await uploadPaymentReceipt(receiptFile, checkout.order.buyerId);
      const order = await submitPaymentProof(id, {
        receiptUrl,
        referenceNumber: referenceNumber.trim(),
        senderName: senderName.trim(),
        paymentDatetime: new Date(paymentDatetime).toISOString(),
        notes: notes.trim(),
      });
      setSubmittedOrder(order);
      setStage('success');
    } catch (error) {
      setSubmitError(error.message || 'Payment could not be submitted.');
      setStage('form');
    }
  };

  return (
    <main className="gcash-payment-page">
      <div className="gcash-payment-wrap">
        <Link to="/" className="gcash-payment-brand">
          <img src={logo} alt="" />
          <span>HarvestLink</span>
        </Link>

        <div className="panel gcash-payment-card">
          {stage === 'loading' ? (
            <div className="gcash-payment-status">
              <Loader2 className="animate-spin" size={24} />
              <span>Loading payment details…</span>
            </div>
          ) : null}

          {stage === 'error' ? (
            <div className="gcash-payment-status">
              <XCircle size={28} className="gcash-status-icon error" />
              <p>{loadError}</p>
              <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
            </div>
          ) : null}

          {(stage === 'form' || stage === 'submitting') && checkout ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Confirm your payment</p>
                  <h2>Order #{shortOrderId(checkout.order.id)}</h2>
                </div>
              </div>
              <p className="muted">Thanks for paying! Upload your receipt so {checkout.order.farmerName} can verify it and confirm your order.</p>

              {submitError ? <div className="form-alert error">{submitError}</div> : null}

              <div className="form-stack">
                <div className="form-field">
                  <span>GCash receipt</span>
                  <ReceiptDropzone
                    file={receiptFile}
                    error={fieldErrors.receiptFile}
                    onFileSelect={(file) => { setReceiptFile(file); setFieldErrors((prev) => ({ ...prev, receiptFile: undefined })); }}
                    onValidationError={(message) => setFieldErrors((prev) => ({ ...prev, receiptFile: message }))}
                    onRemove={() => setReceiptFile(null)}
                  />
                  {fieldErrors.receiptFile ? <small className="field-error">{fieldErrors.receiptFile}</small> : null}
                </div>

                <div className="form-field">
                  <span>GCash reference number</span>
                  <input
                    value={referenceNumber}
                    onChange={(event) => { setReferenceNumber(event.target.value); setFieldErrors((prev) => ({ ...prev, referenceNumber: undefined })); }}
                    placeholder="e.g. 1234 5678 9012"
                  />
                  {fieldErrors.referenceNumber ? <small className="field-error">{fieldErrors.referenceNumber}</small> : null}
                </div>

                <div className="form-field">
                  <span>Sender name</span>
                  <input
                    value={senderName}
                    onChange={(event) => { setSenderName(event.target.value); setFieldErrors((prev) => ({ ...prev, senderName: undefined })); }}
                    placeholder="Name on the GCash account you paid from"
                  />
                  {fieldErrors.senderName ? <small className="field-error">{fieldErrors.senderName}</small> : null}
                </div>

                <div className="form-field">
                  <span>Payment date &amp; time</span>
                  <input
                    type="datetime-local"
                    value={paymentDatetime}
                    onChange={(event) => { setPaymentDatetime(event.target.value); setFieldErrors((prev) => ({ ...prev, paymentDatetime: undefined })); }}
                  />
                  {fieldErrors.paymentDatetime ? <small className="field-error">{fieldErrors.paymentDatetime}</small> : null}
                </div>

                <div className="form-field">
                  <span>Notes (optional)</span>
                  <textarea
                    rows="2"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Anything the farmer should know about this payment"
                  />
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-primary btn-md" onClick={handleSubmit} disabled={stage === 'submitting'}>
                    {stage === 'submitting' ? 'Submitting…' : 'Submit Payment'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-md" onClick={() => navigate(`/orders/${id}/pay/gcash`)} disabled={stage === 'submitting'}>
                    Cancel
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {stage === 'success' && submittedOrder ? (
            <div className="gcash-payment-status payment-submitted-status">
              <CheckCircle2 size={28} className="gcash-status-icon success" />
              <p className="gcash-success-title">Payment Submitted Successfully</p>
              <p className="muted">{checkout.order.farmerName} will review your payment shortly.</p>

              <PaymentProgressTracker order={submittedOrder} />

              <dl className="gcash-detail-list payment-submitted-summary">
                <div>
                  <dt>Order #</dt>
                  <dd>{shortOrderId(submittedOrder.id)}</dd>
                </div>
                <div>
                  <dt>Amount paid</dt>
                  <dd className="gcash-amount">{formatCurrency(submittedOrder.totalAmount)}</dd>
                </div>
                <div>
                  <dt>Date submitted</dt>
                  <dd>{formatDate(submittedOrder.paymentSubmittedAt)}</dd>
                </div>
                <div>
                  <dt>Payment status</dt>
                  <dd><StatusBadge value={submittedOrder.paymentVerificationStatus || 'pending'} type="paymentVerificationStatus" /></dd>
                </div>
              </dl>

              <button type="button" className="btn btn-primary btn-md" onClick={() => navigate(`/orders/${id}`)}>
                View Order Status
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
