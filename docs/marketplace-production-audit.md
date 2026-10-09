# Marketplace Production Audit

Reviewed on 2026-10-10. This is an implementation inventory, not a claim that
all production requirements are complete. No live migration was applied.

## Implemented In This Pass

- Checkout: server-computed quote, visible before-savings subtotal, savings,
  applied unit price, subtotal, delivery fee, final total and payment/delivery
  selection. A buyer must acknowledge the current review before placing an order.
- Submission: synchronous double-click lock, disabled in-flight controls,
  stable buyer-scoped retry key, unique database index and changed-total checks.
- Inventory: confirmation and eligible cancellation use one database transaction
  with order/product row locks. Cancellation restores stock once. Expired produce
  cannot be ordered or confirmed. Stock/quantity inputs reject non-finite and
  over-precise values. Cart updates preserve decimal produce quantities.
- Lifecycle: frontend and backend delivery sequences/labels share one module.
  Existing pickup rules remain unchanged. Delivery advancement uses conditional
  writes so a stale update cannot revive a cancelled order or advance twice.
- Pricing: all quotes/order creation reuse the existing wholesale pricing helper.
  Courier checkout uses a real provider quotation instead of charging a different
  municipality-tier delivery fee from the one displayed.
- Notifications: packed orders notify the buyer; cancellations notify the farmer.
- Reasons: buyer cancellation and farmer rejection capture a reason in history
  and dedicated order fields. Other reasons require short details.

## Existing Features Preserved

- Retail with an optional wholesale tier is already supported across product
  cards, cart, checkout, saved order prices and receipt totals.
- Completed buyer orders already have Buy Again. ProductDetails checks current
  availability before checkout; no new product records are created.
- Farmer storefronts already display name, farm, verification, location, rating
  and available products. Public profile reads reject suspended farmers.
- Manual GCash proof submission, approval/rejection and COD already exist.
  This pass adds no merchant API or automatic payment approval.
- Delivery events, live tracking, new-order/message notifications, stakeholder
  donation notifications and completed-order ratings already exist.
- Receipts use saved order values; the grand total is not recomputed from live
  product prices.
- Account suspension already blocks authenticated API activity and preserves
  transaction history. No account deletion or automatic verification was added.
- Images are lazy loaded. API GET reads already have account-scoped caching and
  in-flight request deduplication. Messages already support server-side limits.

## Remaining Work

- Saved products/favorites need a persistent buyer-owned store and UI. Existing
  Buy Again should also hide gracefully when an original product was deleted.
- Marketplace search currently downloads active listings every four seconds and
  filters locally. Replace with bounded server-side search/pagination, including
  rating/distance sorts, while retaining existing filters and farmer links.
- Orders, users, reviews, notifications and reports still require bounded
  server-side reads. Existing UI pagination does not limit database downloads.
- Buyer/Farmer history currently groups Packed under Preparing. Shared history
  labels/filter presentation need a separate compatibility-tested change.
- Some views still show only payment pending/paid; standardize presentation from
  the existing proof and verification fields without inventing payment stages.
- Admin transaction/receipt access needs an explicit read-only frontend route;
  the backend already authorizes admin order reads.
- Extend reports with real operational aggregates: period sales, payment and
  delivery methods, reason distributions, active farmers and listing stock.
  Existing paid-order revenue rules must stay authoritative.
- A general immutable actor-aware audit history is still needed. Existing order
  events and price override history are useful but are not a complete audit log.
- Several pages return blank loading screens or hide network failures. Add
  retryable loading/error states, preserving already loaded content on refresh.
- Broader authenticated end-to-end tests and real multi-connection PostgreSQL
  contention tests are still needed before claiming production readiness.

## Deployment

Run `supabase/migrations/20261010_order_integrity.sql` before deploying these
backend/frontend changes. It is service-role-only and does not delete accounts,
orders or products. Review it in the actual project's SQL editor first.

The stock transaction tests run against local PGlite PostgreSQL. Browser UI
checks use fixture products and intercepted quotes, not live purchases/payments.
