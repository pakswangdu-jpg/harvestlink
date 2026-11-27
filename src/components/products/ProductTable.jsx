import {
  Archive, ArchiveRestore, Eye, Gift, MessageSquareText, Package, Trash2,
} from 'lucide-react';
import DataTable from '../dashboard/DataTable';
import Button from '../common/Button';
import EditSquareIcon from '../icons/EditSquareIcon';
import ActionMenu from './ActionMenu';
import ZoomableImage from '../common/ZoomableImage';
import { formatCurrency, formatDate, titleCase } from '../../utils/formatters';
import { getProductExpirationInfo } from '../../utils/constants';
import ProductStatusBadge from './ProductStatusBadge';
import ProductPriceReviewNotice from './ProductPriceReviewNotice';

function hasValidDiscount(product) {
  return Number(product.discountPercent) > 0
    && Number.isFinite(Number(product.originalPrice))
    && Number.isFinite(Number(product.price))
    && Number(product.originalPrice) > Number(product.price);
}

function ExpirationCell({ expirationDate }) {
  const expiry = getProductExpirationInfo(expirationDate);
  if (expiry.status === 'none') {
    return <span className="muted">Not specified</span>;
  }
  const indicatorClass = expiry.isExpired
    ? 'product-expiry-expired'
    : expiry.isExpiringSoon
      ? 'product-expiry-soon'
      : 'product-expiry-fresh';
  const indicatorText = expiry.isExpired
    ? 'Expired'
    : expiry.isExpiringSoon
      ? `Expiring Soon · ${expiry.detailText}`
      : expiry.detailText;

  return (
    <div className="product-expiry-cell">
      <span className="product-expiry-date">{expiry.formattedDate}</span>
      <span className={`product-expiry-indicator ${indicatorClass}`}>{indicatorText}</span>
    </div>
  );
}

export default function ProductTable({ products, onView, onReviews, onEdit, onArchive, onDonate, onDelete }) {
  const columns = [
    {
      key: 'name',
      label: 'Product',
      width: '24%',
      render: (product) => (
        <div className="flex items-center gap-3">
          <div className="product-row-thumb">
            {product.image ? (
              <ZoomableImage src={product.image} alt={product.name} fallbackMessage="Image unavailable" />
            ) : (
              <Package size={16} className="text-[var(--text-faint)]" />
            )}
          </div>
          <div className="min-w-0">
            <strong className="block truncate">{titleCase(product.name)}</strong>
            <span className="muted text-[12.5px]">
              <span className="product-grade-label">Grade {product.grade || 'A'}</span> · per {product.unit}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'sellingType',
      label: 'Sales Type',
      width: '10%',
      render: (product) => (
        <span className="product-sales-type-label">
          {product.sellingType === 'wholesale' ? 'Wholesale' : 'Retail'}
        </span>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      width: '14%',
      render: (product) => {
        const isWholesale = product.sellingType === 'wholesale';
        const showDiscount = hasValidDiscount(product);
        const moq = Number(product.moq);
        return (
          <div>
            {product.priceReview?.status === 'needs_adjustment' ? <small className="product-price-label">Your price</small> : null}
            {showDiscount ? <span className="muted price-original">{formatCurrency(product.originalPrice)}</span> : null}
            <strong>{formatCurrency(product.price)}</strong>/{product.unit}
            {isWholesale && Number.isFinite(moq) && moq > 0 ? (
              <span className="muted block text-[12.5px]">Min. order: {moq} {product.unit}</span>
            ) : null}
            <ProductPriceReviewNotice product={product} showSubmitted={['pending', 'needs_adjustment'].includes(product.priceReview?.status)} />
          </div>
        );
      },
    },
    {
      key: 'quantity',
      label: 'Stock',
      width: '10%',
      render: (product) => <span>{product.quantity} {product.unit}</span>,
    },
    {
      key: 'expirationDate',
      label: 'Expiration Date',
      width: '14%',
      render: (product) => <ExpirationCell expirationDate={product.expirationDate} />,
    },
    {
      key: 'status',
      label: 'Status',
      width: '11%',
      render: (product) => <ProductStatusBadge product={product} onEdit={onEdit} />,
    },
    { key: 'updatedAt', label: 'Updated', width: '9%', render: (product) => <span className="muted">{formatDate(product.updatedAt)}</span> },
    {
      key: 'actions',
      label: 'Action',
      width: '8%',
      render: (product) => (
        <div className="table-actions product-table-actions">
          <Button size="sm" variant="secondary" className="btn-icon-only" onClick={() => onEdit(product)} aria-label="Edit product" title="Edit product">
            <EditSquareIcon size={24} />
          </Button>
          <ActionMenu
            items={[
              { label: 'View', icon: Eye, onClick: () => onView(product) },
              { label: 'Reviews', icon: MessageSquareText, onClick: () => onReviews(product) },
              {
                label: 'Donate remaining stock',
                icon: Gift,
                onClick: () => onDonate(product),
                hidden: Number(product.quantity) <= 0,
              },
              {
                label: product.status === 'active' ? 'Deactivate Listing' : 'Reactivate Listing',
                icon: product.status === 'active' ? Archive : ArchiveRestore,
                onClick: () => onArchive(product),
                dividerBefore: true,
              },
              { label: 'Delete Product', icon: Trash2, onClick: () => onDelete(product), danger: true },
            ]}
          />
        </div>
      ),
    },
  ];

  return <DataTable columns={columns} rows={products} emptyMessage="No matching products." />;
}

const SKELETON_WIDTHS = ['70%', '50%', '45%', '35%', '60%', '55%', '50%', '40%'];

export function ProductTableSkeleton({ rows = 4 }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Sales Type</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Expiration Date</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={`skeleton-row-${rowIndex}`} className="product-skeleton-row">
              {SKELETON_WIDTHS.map((width, columnIndex) => (
                <td key={`skeleton-cell-${columnIndex}`}>
                  <div className="product-skeleton-block" style={{ width }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
