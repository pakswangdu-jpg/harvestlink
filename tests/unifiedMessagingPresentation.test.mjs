import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isLowStock } from '../src/utils/constants.js';

test('low-stock inquiry threshold matches inventory status', () => {
  assert.equal(isLowStock(10), true);
  assert.equal(isLowStock(1), true);
  assert.equal(isLowStock(11), false);
  assert.equal(isLowStock(0), false);
});

test('product and donation listings provide their own authorized messaging context and suggestions', async () => {
  const productDetails = await readFile(new URL('../src/features/marketplace/ProductDetails.jsx', import.meta.url), 'utf8');
  const productContext = await readFile(new URL('../src/components/messages/ProductContextCard.jsx', import.meta.url), 'utf8');
  const messagesPage = await readFile(new URL('../src/features/messages/MessagesPage.jsx', import.meta.url), 'utf8');
  const donations = await readFile(new URL('../src/features/stakeholder/StakeholderDonations.jsx', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/app/routes.jsx', import.meta.url), 'utf8');

  assert.match(messagesPage, /allowUnavailableListing=\{currentUser\.role === 'farmer' && currentUser\.id === conversationProductContext\?\.farmerId\}/);
  assert.match(messagesPage, /farmerReviewPopup=\{currentUser\.role === 'farmer' && currentUser\.id === conversationProductContext\?\.farmerId\}/);
  assert.match(productContext, /canViewListing = showListingLink && context\.productId[\s\S]*?\(context\.status === 'active' \|\| allowUnavailableListing\)/);
  assert.match(productContext, /View listing/);
  assert.match(productContext, /Review product/);
  assert.match(productContext, /<dialog[\s\S]*?aria-labelledby=\{`product-review-title-\$\{context\.productId\}`\}/);
  assert.match(productContext, /<h2 id=\{`product-review-title-\$\{context\.productId\}`\}[^>]*>\{listingName\}<\/h2>/);
  assert.match(productContext, /getProductById\(context\.productId\)/);
  assert.match(productContext, /product\.id !== context\.productId \|\| product\.farmerId !== context\.farmerId/);
  assert.match(productContext, /This is the specific product attached to the buyer’s inquiry/);
  assert.doesNotMatch(productContext, /ProductReviewsFeed/);
  assert.match(productContext, /dialog\.showModal\(\)/);
  assert.match(productContext, /to=\{`\/products\/\$\{context\.productId\}`\}/);
  assert.match(productContext, /state=\{\{ productContext: context \}\}/);
  assert.match(productDetails, /const isFarmerOwner = currentUser\.role === 'farmer' && currentUser\.id === product\.farmerId/);
  assert.match(productDetails, /Review your listing details and customer feedback/);
  assert.match(productDetails, /aria-labelledby="own-product-listing-title"/);
  assert.match(productDetails, /import \{ formatCurrency \} from '\.\.\/\.\.\/utils\/formatters';/);
  assert.match(productDetails, /<dd className="mt-0\.5 font-medium text-\[var\(--text\)\]">\{formatCurrency\(product\.price\)\}/);
  assert.match(productDetails, /<ProductReviewsFeed productId=\{product\.id\} productName=\{product\.name\} className="panel" \/>/);
  assert.match(productDetails, /function getFarmerInquirySnapshot\(context, id, currentUserId, currentUserRole\)/);
  assert.match(productDetails, /context\?\.productId !== id \|\| context\.farmerId !== currentUserId/);
  assert.match(productDetails, /const farmerInquirySnapshot = getFarmerInquirySnapshot\(location\.state\?\.productContext, id, currentUser\.id, currentUser\.role\)/);
  assert.match(productDetails, /setStoredProduct\(snapshot\);\s*setLiveListingUnavailable\(true\);\s*setLoadedId\(id\);/);
  assert.match(productDetails, /isInquirySnapshot: true/);
  assert.match(productDetails, /Showing the listing details saved when the buyer sent the inquiry/);
  assert.match(productDetails, /Loading product listing…/);
  assert.match(productDetails, /Unable to view product/);
  assert.match(productDetails, /error instanceof Error \? error\.message/);
  assert.match(productDetails, /Try again/);
  assert.match(productDetails, /const canMessageFarmer = \['buyer', 'stakeholder'\]\.includes\(currentUser\.role\)\s*&& currentUser\.id !== product\.farmerId/);
  assert.match(productDetails, /const isLowStockQuantity = isLowStock\(product\.quantity\)/);
  assert.match(productDetails, /isOutOfStock\s*\?\s*OUT_OF_STOCK_MESSAGE_SUGGESTIONS\s*:\s*isLowStockQuantity\s*\?\s*LOW_STOCK_MESSAGE_SUGGESTIONS/);
  assert.match(productDetails, /import \{[^}]*isLowStock[^}]*\} from '\.\.\/\.\.\/utils\/constants';/);
  assert.match(productDetails, /LOW_STOCK_MESSAGE_SUGGESTIONS = \[/);
  assert.match(productDetails, /productContext:\s*\{[\s\S]*?productId: product\.id/);
  for (const suggestion of [
    'Hi! Is this product still available?',
    'How many units are currently available?',
    'Can I order this quantity?',
    'Do you offer bulk pricing?',
    'Do you offer delivery?',
    'Can you provide more information about the product quality?',
  ]) assert.ok(productDetails.includes(suggestion));

  assert.match(donations, /donationContext:\s*\{[\s\S]*?donationId: donation\.id/);
  assert.match(donations, /canMessage=\{canRequestDonations\}/);
  for (const suggestion of [
    'Hi! Is this donation still available?',
    'We are interested in claiming this donation.',
    'Is the available quantity still accurate?',
    'Can we claim only a portion of the quantity?',
    'What is the pickup location?',
    'Can we arrange a pickup schedule?',
  ]) assert.ok(donations.includes(suggestion));
  assert.match(routes, /allowedRoles=\{\['stakeholder'\]\}[\s\S]*?path="\/stakeholder-donations"/);
});

test('message composer suggestions are editable and donation previews retain listing details', async () => {
  const input = await readFile(new URL('../src/components/messages/MessageInput.jsx', import.meta.url), 'utf8');
  const donationCard = await readFile(new URL('../src/components/messages/DonationContextCard.jsx', import.meta.url), 'utf8');
  const orderCard = await readFile(new URL('../src/components/messages/OrderContextCard.jsx', import.meta.url), 'utf8');
  const messagesPage = await readFile(new URL('../src/features/messages/MessagesPage.jsx', import.meta.url), 'utf8');

  assert.match(input, /setDraft\(suggestion\)/);
  assert.doesNotMatch(input, /onClick=\{\(\) => onSendText\(suggestion\)\}/);
  assert.match(input, /messages-suggestion-list[^"]*flex flex-wrap/);
  assert.match(input, /messages-suggestion shrink-0/);
  assert.match(input, /messages-send-button/);
  const styles = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(styles, /\.messages-page \.messages-suggestion\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*normal;/);
  assert.match(styles, /\.messages-composer \.messages-send-button\s*\{[^}]*width:\s*40px;/);
  assert.doesNotMatch(styles, /\.messages-composer button:last-child/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.messages-page \.messages-suggestion-list\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.messages-page \.messages-suggestion\s*\{[^}]*max-width:\s*calc\(100vw - 64px\);/);
  assert.match(orderCard, /<details[\s\S]*?defaultOpen=\{!isMobile\}[\s\S]*?messages-buy-again-mobile-toggle/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.messages-page \.messages-buy-again-mobile-toggle\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*42px;/);
  assert.match(donationCard, /context\.donationName/);
  assert.match(donationCard, /context\.availableQuantity/);
  assert.match(donationCard, /context\.description/);
  assert.match(donationCard, /context\.expirationAt/);
  assert.match(messagesPage, /donationContext:\s*inquiryDonationContext/);
  assert.match(messagesPage, /getListingContextMessageIds\(messages\)/);
  assert.match(messagesPage, /showProductContext=\{listingContextMessageIds\.has\(message\.id\)\}/);
  assert.match(messagesPage, /filter: `sender_id=eq\.\$\{otherPartyId\}`/);
  assert.match(messagesPage, /<div ref=\{messageListRef\} onScroll=\{handleScroll\} className="messages-conversation-scroll">[\s\S]*?<OrderContextCard[\s\S]*?<div className="messages-message-list/);
});

test('order chat summary shows the other participant and current status together', async () => {
  const [orderCard, styles] = await Promise.all([
    readFile(new URL('../src/components/messages/OrderContextCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8'),
  ]);
  assert.match(orderCard, /messages-order-status[^"]*rounded-full/);
  assert.match(orderCard, /viewerRole === 'farmer' && viewerId === orderItem\.farmerId[\s\S]*?orderItem\.buyerName[\s\S]*?orderItem\.farmerFarmName/);
  assert.match(orderCard, /function orderActivityStatus\(order\)/);
  assert.match(orderCard, /order\.deliveryStatus === 'out_for_delivery'\) return 'in_transit'/);
  assert.match(orderCard, /statusLabel\(activityStatus\)/);
  assert.match(orderCard, /orderCards\.map\(\(orderItem\)/);
  assert.doesNotMatch(orderCard, /messages-order-status shrink-0/);
  assert.doesNotMatch(orderCard, /Tracking ID:|Courier booking:|Official courier tracking|Track delivery/);
  assert.doesNotMatch(orderCard, /Payment<\/p>|Delivery<\/p>|Method<\/p>/);
  assert.match(styles, /\.messages-page \.messages-order-context > div:first-child > div:first-child > \.messages-order-product-image/);
  assert.doesNotMatch(styles, /\.messages-page \.messages-order-context > div:first-child > span/);
  assert.match(styles, /\.messages-page \.messages-order-context \.messages-order-status\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*max-content;[^}]*height:\s*auto;[^}]*min-height:\s*0;/);
  assert.match(styles, /\.messages-page \.messages-order-context \.messages-order-product-name\s*\{[^}]*font-size:\s*15px;[^}]*font-weight:\s*600;/);
  assert.match(styles, /\.messages-page \.messages-order-context\s*\{[^}]*font-family:\s*var\(--font-ui\)/);
});

test('message product inquiry preview follows the compact chat reference layout', async () => {
  const [productDetails, productContext, chatHeader, styles] = await Promise.all([
    readFile(new URL('../src/features/marketplace/ProductDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/messages/ProductContextCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/messages/ChatHeader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8'),
  ]);
  assert.match(productDetails, /farmerFarmName: product\.farmerFarmName/);
  assert.match(productContext, /context\.farmerFarmName \|\| context\.farmerName/);
  assert.match(productContext, /messages-product-context-image/);
  assert.match(productContext, /Review product/);
  assert.match(chatHeader, /activityOrder \? \([\s\S]*?View Activity/);
  assert.match(styles, /\.messages-page \.messages-header-activity-link\s*\{[^}]*color:\s*#fff;/);
  assert.match(styles, /\.messages-page \.messages-product-context-main\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*1fr\)\s*minmax\(220px,\s*1fr\)\s*auto/);
  assert.match(styles, /\.messages-page \.messages-product-context-image\s*\{[^}]*width:\s*42px;[^}]*height:\s*42px/);
});

test('only the current tracking order appears with header activity action', async () => {
  const [orderCard, chatHeader, messagesPage, orderTracking] = await Promise.all([
    readFile(new URL('../src/components/messages/OrderContextCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/messages/ChatHeader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/messages/MessagesPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/orders/OrderTracking.jsx', import.meta.url), 'utf8'),
  ]);
  const messagesController = await readFile(new URL('../backend/src/controllers/messages.controller.js', import.meta.url), 'utf8');
  assert.match(orderCard, /orderCards\.map\(\(orderItem\)/);
  assert.doesNotMatch(orderCard, /View Activity|messages-order-activity-link/);
  assert.match(chatHeader, /activityOrder \? \([\s\S]*?to=\{`\/orders\/\$\{activityOrder\.id\}`\}[\s\S]*?View Activity/);
  assert.match(messagesPage, /conversationOrderIds = useMemo\(\(\) => \[\.\.\.new Set/);
  assert.match(messagesPage, /getOrderById\(id\)/);
  assert.match(messagesPage, /viewerRole=\{currentUser\.role\}/);
  assert.match(messagesPage, /currentTransactionId = explicitlyOpenedOrder\?\.id \|\| activeThread\?\.lastOrder\?\.id \|\| conversationOrderIds\[0\]/);
  assert.match(messagesPage, /currentTransaction = participantOrders\.find\(\(order\) => order\.id === currentTransactionId\)/);
  assert.match(messagesPage, /messagesLoadedFor === messagesScopeKey/);
  assert.match(messagesPage, /conversationOrderState\.key === conversationOrdersKey/);
  assert.match(messagesPage, /activityOrder=\{currentTrackingOrder\}/);
  assert.match(messagesPage, /orders=\{currentTrackingOrder \? \[currentTrackingOrder\] : \[\]\}/);
  assert.match(messagesController, /lastOrder: lastOrder \? \{[\s\S]*?buyerId: lastOrder\.buyer_id,[\s\S]*?farmerId: lastOrder\.farmer_id/);
  assert.doesNotMatch(orderCard, /messages-order-select|Selected|Select/);
  assert.doesNotMatch(chatHeader, /activityOrderNeedsSelection/);
  assert.match(orderTracking, /returnToChat/);
  assert.match(orderTracking, /Back to chat/);
  assert.doesNotMatch(chatHeader, /Track delivery|View order details/);
});

test('order activity timeline renders recorded events and actual timestamps', async () => {
  const [orderTracker, courierTimeline, orderTracking] = await Promise.all([
    readFile(new URL('../src/components/orders/OrderTracker.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/orders/CourierDeliveryTimeline.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/orders/OrderTracking.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(orderTracker, /order\.deliveryEvents/);
  assert.match(orderTracker, /event\.occurredAt/);
  assert.match(courierTimeline, /recordedEvents\.map/);
  assert.match(courierTimeline, /event\.occurredAt/);
  assert.match(orderTracking, /deliveryEvents: current\?\.id === id \? current\.deliveryEvents \|\| \[\] : \[\]/);
});

test('live delivery map never uses a saved farm coordinate as the moving vehicle marker', async () => {
  const map = await readFile(new URL('../src/components/orders/LiveDeliveryMap.jsx', import.meta.url), 'utf8');
  assert.match(map, /transit\.isInTransit && livePosition && isFreshLivePosition\(livePosition\) \? livePosition : null/);
  assert.match(map, /const vehiclePosition = currentPosition;/);
  assert.match(map, /Live location is not available yet\./);
  assert.match(map, /currentPosition && !navigation\.stale && googleRoute\?\.durationMinutes/);
  assert.doesNotMatch(map, /transit\.isInTransit && !isPickup && !isCourier \? origin/);
  const navigation = await readFile(new URL('../src/services/trafficNavigation.js', import.meta.url), 'utf8');
  assert.match(navigation, /Showing the route from the saved farm location until GPS is available\./);
});

test('buyers can cancel only pending orders in both frontend and backend', async () => {
  const [frontendOrderService, backendDeliverySequence, controller, trackingPage, detailsStyles] = await Promise.all([
    readFile(new URL('../src/services/orderService.js', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/lib/deliverySequence.js', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/controllers/orders.controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/orders/OrderTracking.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/orders/OrderDetails.css', import.meta.url), 'utf8'),
  ]);
  assert.match(frontendOrderService, /export function isCancellable\(order\) \{\s*return order\.status === 'pending';/);
  assert.match(backendDeliverySequence, /export function isCancellable\(order\) \{\s*return order\.status === 'pending';/);
  assert.match(controller, /if \(!isCancellable\(existing\)\) throw new ApiError\('This order can no longer be cancelled\.'/);
  assert.match(trackingPage, /isBuyer && isCancellable\(order\)/);
  assert.match(trackingPage, /isBuyer && order\.status === 'confirmed'[\s\S]*?can no longer be changed or cancelled here/);
  assert.match(trackingPage, /Use the message button above to contact the farmer/);
  assert.match(detailsStyles, /\.ot-cancellation-policy-note\s*\{/);
});

test('product inquiry previews link to their exact listing', async () => {
  const messageBubble = await readFile(new URL('../src/components/messages/MessageBubble.jsx', import.meta.url), 'utf8');
  assert.match(messageBubble, /<Link[\s\S]*?to=\{`\/products\/\$\{message\.productContext\.productId\}`\}[\s\S]*?state=\{\{ productContext: message\.productContext \}\}[\s\S]*?productInquiryPreview/);
});

test('message migration persists unique pair conversations and participant-only realtime reads', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261101_unified_listing_messaging.sql', import.meta.url), 'utf8');
  assert.match(migration, /constraint direct_conversations_pair_unique unique \(participant_one_id, participant_two_id\)/);
  assert.match(migration, /messages_select_participant[\s\S]*?conversation\.participant_one_id, conversation\.participant_two_id/);
  assert.match(migration, /after insert or update of status on public\.donation_claims/i);
  assert.match(migration, /message_type in \('text', 'image', 'file', 'system'\)/);
  assert.match(migration, /alter publication supabase_realtime add table public\.messages/i);
});
