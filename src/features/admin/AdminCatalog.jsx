import { useEffect, useState } from 'react';
import { Layers, Plus, RotateCcw, Ruler, Sprout, Star, Trash2 } from 'lucide-react';
import DataTable from '../../components/dashboard/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import {
  addProductUnit, createCatalogProduct, createCategory, createUnit,
  deleteCatalogProduct, deleteCategory, deleteUnit, getCatalog, removeProductUnit,
  updateCatalogProduct, updateCategory, updateProductUnit, updateUnit,
} from '../../services/catalogService';
import { useCatalog } from '../../contexts/CatalogContext';

function statusValue(isActive) {
  return isActive ? 'Active' : 'Inactive';
}

// The admin-facing management screen for the Category -> Product -> Unit catalog that backs
// the product form's cascading dropdowns everywhere else in the app (see CatalogContext.jsx).
// Adding, renaming, deactivating, or deleting a category/product/unit here takes effect
// immediately for every farmer without any code change or deploy.
export default function AdminCatalog() {
  const { refresh: refreshSharedCatalog } = useCatalog();
  const [catalog, setCatalog] = useState({ categories: [], units: [] });
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [newProductName, setNewProductName] = useState('');
  const [productDrafts, setProductDrafts] = useState({});
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitAbbreviation, setNewUnitAbbreviation] = useState('');
  const [unitDrafts, setUnitDrafts] = useState({});
  const [attachUnitId, setAttachUnitId] = useState('');

  const reload = () => {
    getCatalog({ includeInactive: true }).then(setCatalog).catch((loadError) => setError(loadError.message));
  };

  useEffect(reload, []);

  // Every other page's catalog (ProductForm, Marketplace, FarmerProducts,
  // FarmerDemandForecast) is fed by CatalogContext's own single fetch-once cache — refresh
  // it too after any mutation here so an admin's change is visible elsewhere without those
  // pages needing a hard refresh.
  const afterMutation = async (message) => {
    setError('');
    setNotice(message);
    reload();
    await refreshSharedCatalog();
  };

  const selectedCategory = catalog.categories.find((category) => category.id === selectedCategoryId) || null;
  const selectedProduct = selectedCategory?.products.find((product) => product.id === selectedProductId) || null;
  const attachableUnits = selectedProduct
    ? catalog.units.filter((unit) => !selectedProduct.units.some((attached) => attached.id === unit.id))
    : [];

  const handleFail = (mutationError) => {
    setNotice('');
    setError(mutationError.message);
  };

  // ---- Categories ----

  const handleAddCategory = async (event) => {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await createCategory({ name, sortOrder: catalog.categories.length });
      setNewCategoryName('');
      await afterMutation(`${name} added to the category list.`);
    } catch (addError) {
      handleFail(addError);
    }
  };

  const handleRenameCategory = async (category) => {
    const draft = categoryDrafts[category.id]?.trim();
    if (!draft || draft === category.name) return;
    try {
      await updateCategory(category.id, { name: draft });
      setCategoryDrafts((previous) => ({ ...previous, [category.id]: undefined }));
      await afterMutation(`Category renamed to ${draft}.`);
    } catch (renameError) {
      handleFail(renameError);
    }
  };

  const handleToggleCategory = async (category) => {
    try {
      await updateCategory(category.id, { isActive: !category.isActive });
      await afterMutation(`${category.name} ${category.isActive ? 'deactivated' : 'reactivated'}.`);
    } catch (toggleError) {
      handleFail(toggleError);
    }
  };

  const handleDeleteCategory = async (category) => {
    try {
      await deleteCategory(category.id);
      if (selectedCategoryId === category.id) {
        setSelectedCategoryId(null);
        setSelectedProductId(null);
      }
      await afterMutation(`${category.name} deleted.`);
    } catch (deleteError) {
      handleFail(deleteError);
    }
  };

  // ---- Catalog products ----

  const handleAddProduct = async (event) => {
    event.preventDefault();
    const name = newProductName.trim();
    if (!name || !selectedCategory) return;
    try {
      await createCatalogProduct(selectedCategory.id, { name, sortOrder: selectedCategory.products.length });
      setNewProductName('');
      await afterMutation(`${name} added to ${selectedCategory.name}.`);
    } catch (addError) {
      handleFail(addError);
    }
  };

  const handleRenameProduct = async (product) => {
    const draft = productDrafts[product.id]?.trim();
    if (!draft || draft === product.name) return;
    try {
      await updateCatalogProduct(product.id, { name: draft });
      setProductDrafts((previous) => ({ ...previous, [product.id]: undefined }));
      await afterMutation(`Product renamed to ${draft}.`);
    } catch (renameError) {
      handleFail(renameError);
    }
  };

  const handleToggleProduct = async (product) => {
    try {
      await updateCatalogProduct(product.id, { isActive: !product.isActive });
      await afterMutation(`${product.name} ${product.isActive ? 'deactivated' : 'reactivated'}.`);
    } catch (toggleError) {
      handleFail(toggleError);
    }
  };

  const handleDeleteProduct = async (product) => {
    try {
      await deleteCatalogProduct(product.id);
      if (selectedProductId === product.id) setSelectedProductId(null);
      await afterMutation(`${product.name} deleted.`);
    } catch (deleteError) {
      handleFail(deleteError);
    }
  };

  // ---- Master unit list ----

  const handleAddUnit = async (event) => {
    event.preventDefault();
    const name = newUnitName.trim();
    if (!name) return;
    try {
      await createUnit({ name, abbreviation: newUnitAbbreviation.trim() || null });
      setNewUnitName('');
      setNewUnitAbbreviation('');
      await afterMutation(`${name} added to the unit list.`);
    } catch (addError) {
      handleFail(addError);
    }
  };

  const handleSaveUnit = async (unit) => {
    const draft = unitDrafts[unit.id];
    if (!draft) return;
    const name = draft.name?.trim();
    if (!name) return;
    try {
      await updateUnit(unit.id, { name, abbreviation: draft.abbreviation?.trim() || null });
      setUnitDrafts((previous) => ({ ...previous, [unit.id]: undefined }));
      await afterMutation(`${name} updated.`);
    } catch (saveError) {
      handleFail(saveError);
    }
  };

  const handleDeleteUnit = async (unit) => {
    try {
      await deleteUnit(unit.id);
      await afterMutation(`${unit.name} removed from the unit list.`);
    } catch (deleteError) {
      handleFail(deleteError);
    }
  };

  // ---- Product <-> unit associations ----

  const handleAttachUnit = async (event) => {
    event.preventDefault();
    if (!attachUnitId || !selectedProduct) return;
    try {
      await addProductUnit(selectedProduct.id, { unitId: attachUnitId, isDefault: selectedProduct.units.length === 0 });
      setAttachUnitId('');
      await afterMutation('Unit attached.');
    } catch (attachError) {
      handleFail(attachError);
    }
  };

  const handleSetDefaultUnit = async (unit) => {
    try {
      await updateProductUnit(selectedProduct.id, unit.id, { isDefault: true });
      await afterMutation(`${unit.name} set as the default unit for ${selectedProduct.name}.`);
    } catch (updateError) {
      handleFail(updateError);
    }
  };

  const handleDetachUnit = async (unit) => {
    try {
      await removeProductUnit(selectedProduct.id, unit.id);
      await afterMutation(`${unit.name} detached from ${selectedProduct.name}.`);
    } catch (detachError) {
      handleFail(detachError);
    }
  };

  return (
    <>
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Product catalog</p>
            <h2>Categories</h2>
          </div>
          <Layers size={22} />
        </div>

        <form className="table-actions" onSubmit={handleAddCategory}>
          <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category name" />
          <Button type="submit" size="sm" disabled={!newCategoryName.trim()}>
            <Plus size={15} /> Add category
          </Button>
        </form>

        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Category',
              render: (row) => (
                <div className="table-actions">
                  <button type="button" className="link-button" onClick={() => { setSelectedCategoryId(row.id); setSelectedProductId(null); }}>
                    {row.name}
                  </button>
                </div>
              ),
            },
            {
              key: 'rename',
              label: 'Rename',
              render: (row) => (
                <div className="table-actions">
                  <input
                    className="reference-price-input"
                    placeholder={row.name}
                    value={categoryDrafts[row.id] ?? ''}
                    onChange={(event) => setCategoryDrafts((previous) => ({ ...previous, [row.id]: event.target.value }))}
                  />
                  <Button size="sm" variant="secondary" disabled={!categoryDrafts[row.id]?.trim()} onClick={() => handleRenameCategory(row)}>Save</Button>
                </div>
              ),
            },
            { key: 'products', label: 'Products', render: (row) => row.products.length },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge value={statusValue(row.isActive)} /> },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="table-actions">
                  <Button size="sm" variant="secondary" onClick={() => { setSelectedCategoryId(row.id); setSelectedProductId(null); }}>
                    <Sprout size={15} /> Manage products
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleToggleCategory(row)}>
                    <RotateCcw size={15} /> {row.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={row.products.length > 0}
                    title={row.products.length > 0 ? 'Remove or reassign this category’s products before deleting it.' : undefined}
                    onClick={() => handleDeleteCategory(row)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ),
            },
          ]}
          rows={catalog.categories}
          emptyMessage="No categories yet — add one above."
        />
      </section>

      {selectedCategory ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{selectedCategory.name}</p>
              <h2>Products</h2>
            </div>
            <Sprout size={22} />
          </div>

          <form className="table-actions" onSubmit={handleAddProduct}>
            <input value={newProductName} onChange={(event) => setNewProductName(event.target.value)} placeholder={`New product in ${selectedCategory.name}`} />
            <Button type="submit" size="sm" disabled={!newProductName.trim()}>
              <Plus size={15} /> Add product
            </Button>
          </form>

          <DataTable
            columns={[
              {
                key: 'name',
                label: 'Product',
                render: (row) => (
                  <button type="button" className="link-button" onClick={() => setSelectedProductId(row.id)}>
                    {row.name}
                  </button>
                ),
              },
              {
                key: 'rename',
                label: 'Rename',
                render: (row) => (
                  <div className="table-actions">
                    <input
                      className="reference-price-input"
                      placeholder={row.name}
                      value={productDrafts[row.id] ?? ''}
                      onChange={(event) => setProductDrafts((previous) => ({ ...previous, [row.id]: event.target.value }))}
                    />
                    <Button size="sm" variant="secondary" disabled={!productDrafts[row.id]?.trim()} onClick={() => handleRenameProduct(row)}>Save</Button>
                  </div>
                ),
              },
              { key: 'units', label: 'Units', render: (row) => row.units.length },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={statusValue(row.isActive)} /> },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <div className="table-actions">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedProductId(row.id)}>
                      <Ruler size={15} /> Manage units
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleProduct(row)}>
                      <RotateCcw size={15} /> {row.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteProduct(row)}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={selectedCategory.products}
            emptyMessage="No products in this category yet — add one above."
          />
        </section>
      ) : null}

      {selectedProduct ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{selectedProduct.name}</p>
              <h2>Units</h2>
            </div>
            <Ruler size={22} />
          </div>

          <form className="table-actions" onSubmit={handleAttachUnit}>
            <select value={attachUnitId} onChange={(event) => setAttachUnitId(event.target.value)}>
              <option value="">Attach a unit…</option>
              {attachableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</option>)}
            </select>
            <Button type="submit" size="sm" disabled={!attachUnitId}>
              <Plus size={15} /> Attach
            </Button>
          </form>

          <DataTable
            columns={[
              { key: 'name', label: 'Unit' },
              { key: 'abbreviation', label: 'Abbreviation', render: (row) => row.abbreviation || '—' },
              { key: 'default', label: 'Default', render: (row) => (row.isDefault ? <StatusBadge value="Default" /> : '—') },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <div className="table-actions">
                    {!row.isDefault ? (
                      <Button size="sm" variant="secondary" onClick={() => handleSetDefaultUnit(row)}>
                        <Star size={15} /> Set default
                      </Button>
                    ) : null}
                    <Button size="sm" variant="danger" onClick={() => handleDetachUnit(row)}>
                      <Trash2 size={15} /> Detach
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={selectedProduct.units}
            emptyMessage="No units attached to this product yet — attach one above."
          />
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Master list</p>
            <h2>All units</h2>
          </div>
          <Ruler size={22} />
        </div>

        <form className="table-actions" onSubmit={handleAddUnit}>
          <input value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} placeholder="New unit name (e.g. Punnet)" />
          <input value={newUnitAbbreviation} onChange={(event) => setNewUnitAbbreviation(event.target.value)} placeholder="Abbreviation (optional)" />
          <Button type="submit" size="sm" disabled={!newUnitName.trim()}>
            <Plus size={15} /> Add unit
          </Button>
        </form>

        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Name',
              render: (row) => (
                <input
                  className="reference-price-input"
                  value={unitDrafts[row.id]?.name ?? row.name}
                  onChange={(event) => setUnitDrafts((previous) => ({ ...previous, [row.id]: { abbreviation: row.abbreviation, ...previous[row.id], name: event.target.value } }))}
                />
              ),
            },
            {
              key: 'abbreviation',
              label: 'Abbreviation',
              render: (row) => (
                <input
                  className="reference-price-input"
                  value={unitDrafts[row.id]?.abbreviation ?? row.abbreviation ?? ''}
                  onChange={(event) => setUnitDrafts((previous) => ({ ...previous, [row.id]: { name: row.name, ...previous[row.id], abbreviation: event.target.value } }))}
                />
              ),
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="table-actions">
                  <Button size="sm" variant="secondary" disabled={!unitDrafts[row.id]} onClick={() => handleSaveUnit(row)}>Save</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDeleteUnit(row)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              ),
            },
          ]}
          rows={catalog.units}
          emptyMessage="No units yet — add one above."
        />
      </section>
    </>
  );
}
