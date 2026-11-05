import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeMessage } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { ApiError } from '../lib/ApiError.js';

const DEFAULT_PAGE_SIZE = 30;
const MESSAGE_SCHEMA_ERROR_CODES = new Set(['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883']);

function throwMessageStorageError(error) {
  if (MESSAGE_SCHEMA_ERROR_CODES.has(error.code)) {
    throw new ApiError(
      'Messaging database setup is incomplete. Apply the messaging migrations in supabase/migrations/README.md to the Supabase project configured for the backend, then retry.',
      503,
      'MESSAGING_MIGRATION_REQUIRED',
    );
  }
  throw new ApiError(error.message, 400);
}

async function assertDirectRecipient(recipientId, senderId) {
  if (recipientId === senderId) throw new ApiError('You cannot message yourself.', 400);
  const { data, error } = await supabaseAdmin.from('profiles')
    .select('id, role, verification_status')
    .eq('id', recipientId)
    .single();
  if (error || !data) throw new ApiError('Recipient was not found.', 404);
  if (data.role === 'admin') throw new ApiError('You cannot message an admin account.', 400);
  return data;
}

function orderedParticipants(userIdA, userIdB) {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

async function getConversationId(userIdA, userIdB, create = false) {
  const [participantOneId, participantTwoId] = orderedParticipants(userIdA, userIdB);
  if (create) {
    const { data, error } = await supabaseAdmin.rpc('ensure_direct_conversation', {
      user_a: participantOneId,
      user_b: participantTwoId,
    });
    if (error) throwMessageStorageError(error);
    return data;
  }
  const { data, error } = await supabaseAdmin.from('direct_conversations')
    .select('id')
    .eq('participant_one_id', participantOneId)
    .eq('participant_two_id', participantTwoId)
    .maybeSingle();
  if (error) throwMessageStorageError(error);
  return data?.id || null;
}

async function hasListingInquiry(listingColumn, listingId, senderId, recipientId) {
  const { data, error } = await supabaseAdmin.from('messages')
    .select('id')
    .eq(listingColumn, listingId)
    .eq('sender_id', senderId)
    .eq('recipient_id', recipientId)
    .limit(1)
    .maybeSingle();
  if (error) throwMessageStorageError(error);
  return Boolean(data);
}

async function loadProductContext(productId, req, recipient) {
  const { data: product, error: productError } = await supabaseAdmin.from('products')
    .select('id, farmer_id, name, category, image_url, unit, price, quantity, status, price_review, expiration_date')
    .eq('id', productId)
    .maybeSingle();
  if (productError || !product) throw new ApiError('That product is no longer available for this conversation.', 400);

  if (req.profile.role === 'farmer') {
    if (product.farmer_id !== req.profile.id || !['buyer', 'stakeholder'].includes(recipient.role)
      || !await hasListingInquiry('context_product_id', product.id, recipient.id, req.profile.id)) {
      throw new ApiError('You can only reply to an inquiry about your own product.', 403);
    }
  } else {
    if (!['buyer', 'stakeholder'].includes(req.profile.role) || recipient.role !== 'farmer'
      || product.farmer_id !== recipient.id) {
      throw new ApiError('You can only contact the farmer about their own product.', 403);
    }
    const quantity = Number(product.quantity);
    const isOutOfStock = Number.isFinite(quantity) && quantity <= 0;
    const isActiveListing = product.status === 'active' && quantity > 0;
    const reviewStatus = product.price_review?.status;
    const hasUnapprovedPrice = ['pending', 'declined', 'needs_adjustment'].includes(reviewStatus);
    const isExpired = product.expiration_date
      && product.expiration_date < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if ((!isActiveListing && !(isOutOfStock && !hasUnapprovedPrice)) || isExpired) {
      throw new ApiError('This product listing is no longer available.', 409);
    }
  }

  const { data: farmer, error: farmerError } = await supabaseAdmin.from('profiles')
    .select('id, name, farm_name')
    .eq('id', product.farmer_id)
    .maybeSingle();
  if (farmerError) throw new ApiError(farmerError.message, 400);
  return {
    context_product_id: product.id,
    context_product_name: product.name,
    context_product_image_url: product.image_url || null,
    context_product_category: product.category || null,
    context_product_farmer_id: product.farmer_id,
    context_product_farmer_name: farmer?.farm_name || farmer?.name || null,
    context_product_quantity: product.quantity == null ? null : Number(product.quantity),
    context_product_status: product.status || null,
    context_product_unit: product.unit,
    context_product_price: product.price,
  };
}

function isDonationExpired(donation) {
  if (donation.expiration_at) return new Date(donation.expiration_at) <= new Date();
  return Boolean(donation.expiration_date
    && donation.expiration_date < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
}

async function loadDonationContext(donationId, req, recipient) {
  const { data: donation, error } = await supabaseAdmin.from('donations')
    .select('id, product_id, product_name, description, unit, quantity, available_quantity, location, image_url, expiration_date, expiration_at, farmer_id, farmer_name, status')
    .eq('id', donationId)
    .maybeSingle();
  if (error || !donation) throw new ApiError('That donation is no longer available for this conversation.', 400);

  if (req.profile.role === 'farmer') {
    if (donation.farmer_id !== req.profile.id || recipient.role !== 'stakeholder'
      || !await hasListingInquiry('context_donation_id', donation.id, recipient.id, req.profile.id)) {
      throw new ApiError('You can only reply to an inquiry about your own donation.', 403);
    }
  } else {
    if (req.profile.role !== 'stakeholder' || req.profile.verification_status !== 'verified'
      || recipient.role !== 'farmer' || donation.farmer_id !== recipient.id) {
      throw new ApiError('Only a verified stakeholder can contact the farmer about a donation.', 403);
    }
    if (donation.status !== 'available' || Number(donation.available_quantity ?? donation.quantity) <= 0
      || isDonationExpired(donation)) {
      throw new ApiError('This donation is no longer available.', 409);
    }
  }

  return {
    context_donation_id: donation.id,
    context_donation_name: donation.product_name,
    context_donation_image_url: donation.image_url || null,
    context_donation_description: donation.description || null,
    context_donation_quantity: Number(donation.available_quantity ?? donation.quantity),
    context_donation_unit: donation.unit,
    context_donation_location: donation.location,
    context_donation_expiration_at: donation.expiration_at || null,
    context_donation_expiration_date: donation.expiration_date || null,
    context_donation_farmer_id: donation.farmer_id,
    context_donation_farmer_name: donation.farmer_name,
    context_donation_status: donation.status,
  };
}
export async function listMessages(req, res) {
  const { otherUserId, before, limit } = req.query;
  if (!otherUserId) throw new ApiError('otherUserId is required.', 400);
  await assertDirectRecipient(otherUserId, req.profile.id);
  const conversationId = await getConversationId(req.profile.id, otherUserId);
  if (!conversationId) return res.json({ messages: [], hasMore: false, conversationId: null });
  const pageSize = Math.min(Number(limit) || DEFAULT_PAGE_SIZE, 100);
  let query = supabaseAdmin.from('messages').select('*').eq('conversation_id', conversationId);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(pageSize);
  if (error) throwMessageStorageError(error);
  res.json({ messages: data.reverse().map(serializeMessage), hasMore: data.length === pageSize, conversationId });
}
export async function listDirectThreads(req, res) {
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, tracking_id, buyer_id, farmer_id, product_id, product_id_snapshot, product_name, product_image_url, quantity, unit, status, payment_status, delivery_method, delivery_status, total_amount, created_at, updated_at')
    .or(`buyer_id.eq.${req.profile.id},farmer_id.eq.${req.profile.id}`);
  if (ordersError) throw new ApiError(ordersError.message, 400);

  const counterpartByOrderId = new Map();
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const completedOrderByPartnerId = new Map();
  const orderIds = orders.map((order) => {
    const partnerId = order.buyer_id === req.profile.id ? order.farmer_id : order.buyer_id;
    counterpartByOrderId.set(order.id, partnerId);
    if (order.status === 'completed') {
      const current = completedOrderByPartnerId.get(partnerId);
      if (!current || new Date(order.updated_at || order.created_at) > new Date(current.updated_at || current.created_at)) {
        completedOrderByPartnerId.set(partnerId, order);
      }
    }
    return order.id;
  });

  const filters = [
    `and(order_id.is.null,sender_id.eq.${req.profile.id})`,
    `and(order_id.is.null,recipient_id.eq.${req.profile.id})`,
  ];
  if (orderIds.length) filters.push(`order_id.in.(${orderIds.join(',')})`);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .or(filters.join(','))
    .order('created_at', { ascending: false });
  if (error) throwMessageStorageError(error);

  const rowsByPartnerId = new Map();
  data.forEach((row) => {
    const partnerId = row.order_id
      ? counterpartByOrderId.get(row.order_id)
      : (row.sender_id === req.profile.id ? row.recipient_id : row.sender_id);
    if (!partnerId) return;
    if (!rowsByPartnerId.has(partnerId)) rowsByPartnerId.set(partnerId, []);
    rowsByPartnerId.get(partnerId).push(row);
  });

  const partnerIds = [...rowsByPartnerId.keys()];
  if (!partnerIds.length) return res.json([]);

  const { data: partners } = await supabaseAdmin
    .from('profiles')
    .select('id, name, role, farm_name, organization_name, avatar_url, last_active_at, verification_status')
    .in('id', partnerIds);
  const partnerById = new Map((partners || []).map((partner) => [partner.id, partner]));

  const threads = partnerIds.map((partnerId) => {
    const rows = rowsByPartnerId.get(partnerId);
    const partner = partnerById.get(partnerId);
    const orderMessage = rows.find((row) => row.order_id || row.context_order_id);
    const lastOrderId = orderMessage?.order_id || orderMessage?.context_order_id;
    const lastOrder = lastOrderId ? orderById.get(lastOrderId) : null;
    const completedOrder = completedOrderByPartnerId.get(partnerId);
    const unreadCount = rows.filter((row) => row.sender_id !== req.profile.id && !row.read).length;
    return {
      otherUserId: partnerId,
      conversationId: rows[0].conversation_id || null,


      otherUserName: partner ? (partner.organization_name || partner.farm_name || partner.name) : 'Former user',
      otherUserRole: partner?.role || null,
      otherUserAvatarUrl: partner?.avatar_url || null,
      otherUserLastActiveAt: partner?.last_active_at || null,
      otherUserVerified: partner?.verification_status === 'verified',
      lastMessage: serializeMessage(rows[0]),
      lastOrder: lastOrder ? {
        id: lastOrder.id,
        trackingId: lastOrder.tracking_id || null,
        productId: lastOrder.product_id_snapshot || lastOrder.product_id,
        buyerId: lastOrder.buyer_id,
        farmerId: lastOrder.farmer_id,
        productName: lastOrder.product_name,
        productImageUrl: lastOrder.product_image_url || null,
        quantity: lastOrder.quantity,
        unit: lastOrder.unit,
        status: lastOrder.status,
        paymentStatus: lastOrder.payment_status,
        deliveryMethod: lastOrder.delivery_method,
        deliveryStatus: lastOrder.delivery_status,
        totalAmount: lastOrder.total_amount,
      } : null,
      completedOrder: completedOrder ? {
        id: completedOrder.id,
        productId: completedOrder.product_id_snapshot || completedOrder.product_id,
        farmerId: completedOrder.farmer_id,
        farmerName: partner?.farm_name || partner?.name || null,
        productName: completedOrder.product_name,
        quantity: completedOrder.quantity,
        unit: completedOrder.unit,
        status: completedOrder.status,
        totalAmount: completedOrder.total_amount,
      } : null,
      unreadCount,
    };
  });

  threads.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
  res.json(threads);
}
export async function sendMessage(req, res) {
  const {
    recipientId, text, messageType, imageUrl, fileUrl, fileName, replyToId, productContext, donationContext,
  } = req.body;
  if (!recipientId) throw new ApiError('recipientId is required.', 400);
  const trimmed = String(text || '').trim();
  const type = messageType === 'image' || messageType === 'file' ? messageType : 'text';
  if (type === 'text' && !trimmed) throw new ApiError('Enter a message before sending.', 400);
  if (type === 'image' && !imageUrl) throw new ApiError('imageUrl is required for an image message.', 400);
  if (type === 'file' && !fileUrl) throw new ApiError('fileUrl is required for a file message.', 400);
  if (req.profile.role === 'admin') throw new ApiError('Admin accounts cannot send messages.', 403);

  const recipient = await assertDirectRecipient(recipientId, req.profile.id);
  if (productContext?.productId && donationContext?.donationId) {
    throw new ApiError('A message can only refer to one listing.', 400);
  }
  let context = {};
  if (productContext?.productId) {
    context = await loadProductContext(productContext.productId, req, recipient);
  } else if (donationContext?.donationId) {
    context = await loadDonationContext(donationContext.donationId, req, recipient);
  }
  const conversationId = await getConversationId(req.profile.id, recipientId, true);
  const { data, error } = await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    recipient_id: recipientId,
    sender_id: req.profile.id,
    sender_name: req.profile.name,
    sender_role: req.profile.role,
    text: trimmed,
    message_type: type,
    image_url: type === 'image' ? imageUrl : null,
    file_url: type === 'file' ? fileUrl : null,
    file_name: type === 'file' ? (fileName || null) : null,
    reply_to_id: replyToId || null,
    ...context,
  }).select().single();
  if (error) throwMessageStorageError(error);

  const preview = type === 'image'
    ? 'Sent a photo'
    : type === 'file'
      ? `Sent a file: ${fileName || 'attachment'}`
      : trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
  await createNotification({
    userId: recipientId,
    type: 'message',
    title: `New message from ${req.profile.name}`,
    message: preview,
    link: `/messages/direct/${req.profile.id}`,
  });

  res.status(201).json(serializeMessage(data));
}

async function fetchOwnMessageOr404(messageId, senderId) {
  const { data, error } = await supabaseAdmin.from('messages').select('*').eq('id', messageId).single();
  if (error || !data) throw new ApiError('Message was not found.', 404);
  if (data.sender_id !== senderId) throw new ApiError('You can only edit or delete your own messages.', 403);
  if (data.message_type === 'system' || data.sender_role === 'system') {
    throw new ApiError('System messages cannot be changed.', 403);
  }
  if (data.deleted) throw new ApiError('This message was already deleted.', 400);
  return data;
}



export async function editMessage(req, res) {
  const message = await fetchOwnMessageOr404(req.params.messageId, req.profile.id);
  if (message.message_type !== 'text') throw new ApiError('Only text messages can be edited.', 400);
  const trimmed = String(req.body.text || '').trim();
  if (!trimmed) throw new ApiError('Enter a message before sending.', 400);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({ text: trimmed, edited: true })
    .eq('id', message.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeMessage(data));
}




export async function deleteMessage(req, res) {
  const message = await fetchOwnMessageOr404(req.params.messageId, req.profile.id);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({
      deleted: true, text: '', image_url: null, file_url: null, file_name: null,
    })
    .eq('id', message.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeMessage(data));
}




export async function markDirectThreadRead(req, res) {
  const { otherUserId } = req.params;
  await assertDirectRecipient(otherUserId, req.profile.id);
  const conversationId = await getConversationId(req.profile.id, otherUserId);
  if (!conversationId) return res.status(204).end();

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .eq('recipient_id', req.profile.id)
    .eq('sender_id', otherUserId)
    .eq('read', false);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}
