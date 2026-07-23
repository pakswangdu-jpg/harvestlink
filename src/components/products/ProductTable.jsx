import { Archive, ArchiveRestore, Copy, Edit3, Eye, Gift, Package, Trash2 } from 'lucide-react';
import DataTable from '../dashboard/DataTable';
import StatusBadge from '../common/StatusBadge';
import ActionMenu from './ActionMenu';
import { formatCurrency, formatDate, titleCase } from '../../utils/formatters';
import { isLowStock } from '../../utils/constants';

export default function ProductTable({ products, onView, onEdit, onDuplicate, onArchive, onDonate, onDelete }) {
  const columns = [
    {
      key: 'image',
      label: 'Image',
      render: (product) => (
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-gray-50">
          {product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <Package size={18} className="text-gray-300" />}
        </div>
      ),
    },
    { key: 'name', label: 'Product', render: (product) => <strong>{titleCase(product.name)}</strong> },
    { key: 'category', label: 'Category', render: (product) => <span className="category-pill">{product.category}</span> },
    {
      key: 'grade',
      label: 'Grade',
      render: (product) => <span className={`badge badge-grade-${(product.grade || 'A').toLowerCase()}`}>Grade {product.grade || 'A'}</span>,
    },
    { key: 'unit', label: 'Unit' },
    {
      key: 'quantity',
      label: 'Available Qty',
      render: (product) => (
        <span className="stacked-badges">
          <span>{product.quantity}</span>
          {Number(product.quantity) <= 0 ? (
            <span className="badge badge-out-of-stock">Out of stock</span>
          ) : isLowStock(product.quantity) ? (
            <span className="badge badge-low-stock">Low stock</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      render: (product) => (
        <span>
          {product.discountPercent ? <span className="muted price-original">{formatCurrency(product.originalPrice)}</span> : null}
          <strong>{formatCurrency(product.price)}</strong>
        </span>
      ),
    },
    {
      key: 'sellingType',
      label: 'Sales Type',
      render: (product) => (
        <span className={`badge ${product.sellingType === 'wholesale' ? 'badge-wholesale' : 'badge-active'}`}>
          {product.sellingType === 'wholesale' ? 'Wholesale' : 'Retail'}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (product) => <StatusBadge value={product.status} /> },
    { key: 'updatedAt', label: 'Updated', render: (product) => <span className="muted">{formatDate(product.updatedAt)}</span> },
    {
      key: 'actions',
      label: 'Actions',
      render: (product) => (
        <ActionMenu
          items={[
            { label: 'View', icon: Eye, onClick: () => onView(product) },
            { label: 'Edit', icon: Edit3, onClick: () => onEdit(product) },
            { label: 'Duplicate', icon: Copy, onClick: () => onDuplicate(product) },
            {
              label: 'Donate remaining stock',
              icon: Gift,
              onClick: () => onDonate(product),
              hidden: Number(product.quantity) <= 0,
            },
            {
              label: product.status === 'active' ? 'Archive' : 'Unarchive',
              icon: product.status === 'active' ? Archive : ArchiveRestore,
              onClick: () => onArchive(product),
              dividerBefore: true,
            },
            { label: 'Delete', icon: Trash2, onClick: () => onDelete(product), danger: true },
          ]}
        />
      ),
    },
  ];

  return <DataTable columns={columns} rows={products} emptyMessage="No matching products." />;
}
