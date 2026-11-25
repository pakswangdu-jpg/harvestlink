# HarvestLink Integration Testing Structure

Integration tests connect real HarvestLink application modules while mocking only external boundaries such as Supabase, payment providers, Google Maps, email, and realtime transport.

| Test ID | Module | Integration Boundary | Main Roles |
|---|---|---|---|
| IT-001 | Farmer Product Management | Add Product form → product service → products controller → database adapter | Farmer |
| IT-002 | Farmer Product Retrieval | Product service → products controller → Farmer listing | Farmer |
| IT-003 | Farmer Product Editing | Edit Product → update service → products controller → database adapter | Farmer |
| IT-004 | Farmer Listing Refresh | Updated product service → listing controller → Farmer listing | Farmer |
| IT-005 | Farmer Product Deletion | Delete action → delete service → products controller → Farmer/Marketplace visibility | Farmer, Buyer |
| IT-006 | Marketplace | Approved products → marketplace controller → Buyer marketplace | Buyer, Farmer |
| IT-007 | Order Creation | Cart/checkout → order service → orders controller → Farmer orders | Buyer, Farmer |
| IT-008 | Order Confirmation | Farmer order action → order transition service → Buyer order history | Farmer, Buyer |
| IT-009 | Delivery Preparation | Farmer delivery action → delivery transition → Buyer tracking status | Farmer, Buyer |
| IT-010 | Delivery Start | Start delivery → order location/tracking access → Buyer tracking | Farmer, Buyer |
| IT-011 | Live Location | Farmer location service → order location controller → tracking store/map state | Farmer, Buyer |
| IT-012 | Ratings and Reviews | Buyer feedback → ratings controller → Farmer review retrieval | Buyer, Farmer |
| IT-013 | Authentication | Login form → auth service → backend authentication | All roles |
| IT-014 | Password Recovery | Forgot Password → recovery service → Supabase recovery boundary | All roles |
| IT-015 | Account Verification | Signup document upload → verification service → Admin review | Farmer, Stakeholder, Admin |
| IT-016 | Donations | Farmer donation → donation service → stakeholder marketplace | Farmer, Stakeholder |
| IT-017 | Donation Claims | Stakeholder claim → donation controller → Farmer claim management | Stakeholder, Farmer |
| IT-018 | Payments | Checkout payment → payment service → payment controller | Buyer, Farmer, Admin |
| IT-019 | Messaging | Message form → message service → conversation retrieval | Farmer, Buyer, Stakeholder |
| IT-020 | Notifications | Domain event → notification service → notification bell | All roles |
| IT-021 | Price Review | Farmer price change → price-review service → Admin decision → marketplace price | Farmer, Admin, Buyer |
| IT-022 | Forecasting | Product/order history → forecast service → forecast presentation | Farmer, Admin |
| IT-023 | Market Prices | Market data → price service → reference-price display | Farmer, Admin |
| IT-024 | Admin Users | Admin action → profile controller → account status/access control | Admin |
| IT-025 | Catalog Management | Admin catalog action → catalog controller → product validation | Admin, Farmer |

## Test Rules

- Use JavaScript and Vitest.
- Use real internal services, controllers, serializers, and validation logic.
- Mock only external Supabase/database and third-party service boundaries.
- Never use production credentials or production records.
- Keep each test in the matching module folder.
- Verify ownership, authorization, duplicate prevention, and failure handling.
- Report `BLOCKED` when the application does not implement the requested integration.

## Current Implemented Farmer Tests

The current repository contains IT-001 through IT-005 under `tests/Integration-Testing/farmer/`. Each test was executed through the integration Vitest configuration.
