// Maps snake_case Postgres rows to the exact camelCase shape the frontend already expects
// (the same field names the old localStorage-backed services used) — keeping this mapping
// in one place means every controller returns a consistent, frontend-ready shape.

export function serializeProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    name: row.name,
    contactNumber: row.contact_number,
    address: row.address,
    zipCode: row.zip_code,
    municipality: row.municipality,
    accountStatus: row.account_status,
    farmName: row.farm_name,
    birthday: row.birthday,
    govIdFile: row.gov_id_file_url,
    verificationStatus: row.verification_status,
    verificationAcknowledged: row.verification_acknowledged,
    verifiedAt: row.verified_at,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    contactPerson: row.contact_person,
    accreditationFile: row.accreditation_file_url,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// farmerName isn't a column on products (deliberately not denormalized — see
// supabase/schema.sql) — callers resolve it via a profiles lookup and pass it in.
export function serializeProduct(row, farmerName = null) {
  if (!row) return null;
  return {
    id: row.id,
    farmerId: row.farmer_id,
    farmerName,
    name: row.name,
    category: row.category,
    grade: row.grade,
    sellingType: row.selling_type,
    bulkMinQuantity: row.bulk_min_quantity == null ? null : Number(row.bulk_min_quantity),
    price: Number(row.price),
    unit: row.unit,
    kgPerUnit: row.kg_per_unit == null ? null : Number(row.kg_per_unit),
    quantity: Number(row.quantity),
    location: row.location,
    description: row.description,
    image: row.image_url || '',
    status: row.status,
    originalPrice: row.original_price == null ? null : Number(row.original_price),
    discountPercent: row.discount_percent == null ? null : Number(row.discount_percent),
    priceReview: row.price_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    farmerId: row.farmer_id,
    farmerName: row.farmer_name,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    quantity: Number(row.quantity),
    deliveryFee: Number(row.delivery_fee || 0),
    totalAmount: Number(row.total_amount),
    message: row.message || '',
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    deliveryMethod: row.delivery_method,
    deliveryStatus: row.delivery_status,
    originMunicipality: row.origin_municipality,
    deliveryMunicipality: row.delivery_municipality,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    text: row.text,
    read: row.read,
    createdAt: row.created_at,
  };
}

export function serializeNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    read: row.read,
    createdAt: row.created_at,
  };
}
