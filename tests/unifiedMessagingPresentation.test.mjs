import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

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
  assert.match(productDetails, /<ProductReviewsFeed farmerId=\{product\.farmerId\} className="panel" \/>/);
  assert.match(productDetails, /function getFarmerInquirySnapshot\(context, id, currentUser\)/);
  assert.match(productDetails, /context\?\.productId !== id \|\| context\.farmerId !== currentUser\.id/);
  assert.match(productDetails, /useState\(\(\) => getFarmerInquirySnapshot\(location\.state\?\.productContext, id, currentUser\)\)/);
  assert.match(productDetails, /setProduct\(snapshot\);\s*setLoadedId\(id\);/);
  assert.match(productDetails, /isInquirySnapshot: true/);
  assert.match(productDetails, /Showing the listing details saved when the buyer sent the inquiry/);
  assert.match(productDetails, /Loading product listing…/);
  assert.match(productDetails, /Unable to view product/);
  assert.match(productDetails, /error instanceof Error \? error\.message/);
  assert.match(productDetails, /Try again/);
  assert.match(productDetails, /currentUser\.role\)\s*&& currentUser\.id !== product\.farmerId[\s\S]*?product\.status === 'active'[\s\S]*?Number\(product\.quantity\) > 0/);
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
});

test('completed order summary keeps its full status visible with readable typography', async () => {
  const [orderCard, styles] = await Promise.all([
    readFile(new URL('../src/components/messages/OrderContextCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8'),
  ]);
  assert.match(orderCard, /messages-order-status[^"]*rounded-full/);
  assert.match(orderCard, /order\.status === 'completed' \? <CheckCircle2 size=\{15\}/);
  assert.doesNotMatch(orderCard, /order\.status === 'completed' \? <span className="inline-flex items-center gap-1"><CheckCircle2 size=\{13\} \/> Completed/);
  assert.match(styles, /\.messages-page \.messages-order-context > div:first-child > div:first-child > \.messages-order-product-image/);
  assert.doesNotMatch(styles, /\.messages-page \.messages-order-context > div:first-child > span/);
  assert.match(styles, /\.messages-page \.messages-order-context \.messages-order-status\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*max-content;[^}]*height:\s*auto;[^}]*white-space:\s*nowrap;/);
  assert.match(styles, /\.messages-page \.messages-order-context \.messages-order-product-name\s*\{[^}]*font-size:\s*15px;[^}]*font-weight:\s*600;/);
  assert.match(styles, /\.messages-page \.messages-order-context\s*\{[^}]*font-family:\s*var\(--font-ui\)/);
});

test('order context keeps Track delivery without a duplicate order-details action', async () => {
  const orderCard = await readFile(new URL('../src/components/messages/OrderContextCard.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(orderCard, /View order details/);
  assert.match(orderCard, /order\.deliveryMethod !== 'buyer_pickup'[\s\S]*?Track delivery/);
});

test('message migration persists unique pair conversations and participant-only realtime reads', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261101_unified_listing_messaging.sql', import.meta.url), 'utf8');
  assert.match(migration, /constraint direct_conversations_pair_unique unique \(participant_one_id, participant_two_id\)/);
  assert.match(migration, /messages_select_participant[\s\S]*?conversation\.participant_one_id, conversation\.participant_two_id/);
  assert.match(migration, /after insert or update of status on public\.donation_claims/i);
  assert.match(migration, /message_type in \('text', 'image', 'file', 'system'\)/);
  assert.match(migration, /alter publication supabase_realtime add table public\.messages/i);
});
