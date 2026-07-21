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
    avatarUrl: row.avatar_url || null,
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
    moq: row.moq == null ? null : Number(row.moq),
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
    costPrice: row.cost_price == null ? null : Number(row.cost_price),
    expirationDate: row.expiration_date,
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
    unitCostPrice: row.unit_cost_price == null ? null : Number(row.unit_cost_price),
    farmerId: row.farmer_id,
    farmerName: row.farmer_name,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    quantity: Number(row.quantity),
    deliveryFee: Number(row.delivery_fee || 0),
    // Snapshotted by the Smart Distance-Based Delivery Fee System at order creation (see
    // backend/src/lib/deliveryFee.js) — null for a buyer-pickup order, which has no
    // delivery leg to measure.
    deliveryDistanceKm: row.delivery_distance_km == null ? null : Number(row.delivery_distance_km),
    deliveryDurationMinutes: row.delivery_duration_minutes == null ? null : Number(row.delivery_duration_minutes),
    deliveryFeeTier: row.delivery_fee_tier || null,
    totalAmount: Number(row.total_amount),
    message: row.message || '',
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    // Only ever set by the demo GCash payment module (backend/src/controllers/
    // payments.controller.js) once a payment actually completes — null for a pending or
    // COD order.
    transactionId: row.transaction_id || null,
    paidAt: row.paid_at || null,
    deliveryMethod: row.delivery_method,
    deliveryStatus: row.delivery_status,
    originMunicipality: row.origin_municipality,
    deliveryMunicipality: row.delivery_municipality,
    status: row.status,
    currentLat: row.current_lat == null ? null : Number(row.current_lat),
    currentLng: row.current_lng == null ? null : Number(row.current_lng),
    currentHeading: row.current_heading == null ? null : Number(row.current_heading),
    currentSpeed: row.current_speed == null ? null : Number(row.current_speed),
    currentAccuracy: row.current_accuracy == null ? null : Number(row.current_accuracy),
    locationUpdatedAt: row.location_updated_at,
    transitStartedAt: row.transit_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    recipientId: row.recipient_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    text: row.text,
    read: row.read,
    createdAt: row.created_at,
  };
}

export function serializeRating(row) {
  if (!row) return null;
  return {
    id: row.id,
    farmerId: row.farmer_id,
    raterId: row.rater_id,
    raterRole: row.rater_role,
    orderId: row.order_id,
    rating: row.rating,
    comment: row.comment || '',
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
