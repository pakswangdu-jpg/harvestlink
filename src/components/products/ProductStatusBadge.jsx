import { getProductStatusInfo } from '../../utils/constants';
import { Pencil } from 'lucide-react';

export default function ProductStatusBadge({ product, onEdit }) {
  const { value, label } = getProductStatusInfo(product);
  const reason = value === 'rejected' && typeof product.priceReview?.declineReason === 'string'
    ? product.priceReview.declineReason.trim() : '';
  return (
    <div className="product-approval-status">
      <span className={`badge badge-${value}`}>{label}</span>
      {value === 'needs-adjustment' && onEdit ? <button type="button" className="product-price-edit" onClick={() => onEdit(product)}><Pencil size={12} aria-hidden="true" /> Edit price</button> : null}
      {reason ? (
        <details className="product-rejection-reason">
          <summary>View reason</summary>
          <p>{reason}</p>
        </details>
      ) : null}
    </div>
  );
}
