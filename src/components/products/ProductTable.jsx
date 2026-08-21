import { Archive, ArchiveRestore, Copy, Eye, Gift, Package, Trash2 } from 'lucide-react';
import DataTable from '../dashboard/DataTable';
import Button from '../common/Button';
import ActionMenu from './ActionMenu';
import ZoomableImage from '../common/ZoomableImage';
import { formatCurrency, formatDate, titleCase } from '../../utils/formatters';
import { getProductStatusInfo } from '../../utils/constants';

export default function ProductTable({ products, onView, onEdit, onDuplicate, onArchive, onDonate, onDelete }) {
  const columns = [
    {
      key: 'name',
      label: 'Product',
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
            <span className="muted text-[12.5px]">Grade {product.grade || 'A'} · per {product.unit}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      render: (product) => (
        <span>
          {product.discountPercent ? <span className="muted price-original">{formatCurrency(product.originalPrice)}</span> : null}
          <strong>{formatCurrency(product.price)}</strong>/{product.unit}
        </span>
      ),
    },
    {
      key: 'quantity',
      label: 'Stock',
      render: (product) => <span>{product.quantity} {product.unit}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (product) => {
        const { value, label } = getProductStatusInfo(product);
        return <span className={`badge badge-${value}`}>{label}</span>;
      },
    },
    { key: 'updatedAt', label: 'Updated', render: (product) => <span className="muted">{formatDate(product.updatedAt)}</span> },
    {
      key: 'actions',
      label: 'Action',
      render: (product) => (
        <div className="table-actions">
          <Button size="sm" variant="secondary" onClick={() => onEdit(product)}>Edit</Button>
          <ActionMenu
            items={[
              { label: 'View', icon: Eye, onClick: () => onView(product) },
              { label: 'Duplicate', icon: Copy, onClick: () => onDuplicate(product) },
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

const SKELETON_WIDTHS = ['70%', '45%', '35%', '55%', '50%', '40%'];

// Column-shaped loading rows — a farmer opening this page mid-fetch should see "this is still
// loading," not a flash of "No products yet" (see FarmerProducts.jsx's isLoading branch).
export function ProductTableSkeleton({ rows = 4 }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
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
