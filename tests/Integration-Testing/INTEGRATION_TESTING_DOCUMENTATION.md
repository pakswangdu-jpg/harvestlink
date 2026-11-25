# HarvestLink Integration Testing Documentation

## Table 32 — Integration Testing

| Proponent | Test Case ID | Module 1 | Integration Process | Module 2 | Pre-condition | Expected Result | Result | Remarks |
|---|---|---|---|---|---|---|---|---|
| Jeyward Orias | INT-001 | Farmer Product Management | Farmer adds a product through the product service and backend controller | Product Database Adapter | Valid Farmer identity and product data | Product is stored once with correct Farmer ownership | Performed as expected | Passed |
| Jeyward Orias | INT-002 | Farmer Product Management | Farmer product retrieval passes through the backend listing service | Farmer Product Listing | Farmer product records exist | Correct product details appear in the listing | Performed as expected | Passed |
| Jeyward Orias | INT-003 | Farmer Product Management | Farmer edits a product through the update service and backend controller | Product Database Adapter | Existing Farmer-owned product | Updated product information is saved correctly | Performed as expected | Passed |
| Jeyward Orias | INT-004 | Farmer Product Management | Updated product retrieval runs after the edit workflow | Farmer Product Listing | Product update completed | Latest product information appears without duplicates | Performed as expected | Passed |
| Jeyward Orias | INT-005 | Farmer Product Management | Farmer deletes a product through the delete service and backend controller | Farmer and Marketplace Listings | Farmer owns the selected product | Product is removed from active listings and marketplace visibility | Performed as expected | Passed |

## Verified Execution

```text
Test Files  5 passed (5)
Tests       13 passed (13)
Outcome     PASS
```

Command:

```bash
npx vitest run --config vitest.integration.config.js tests/Integration-Testing
```

## Integration Boundaries

- Application services, controllers, serializers, and validation logic are exercised directly.
- Supabase/database operations are mocked at the external adapter boundary.
- Production database records are not accessed or modified.
- Farmer ownership and authorization checks are included where supported.
- Product creation, retrieval, editing, refresh, and deletion workflows are covered.

## Current Scope

The documented tests cover Farmer Product Management. Buyer marketplace, orders, payments, donations, messaging, notifications, delivery tracking, ratings, forecasting, and Admin workflows are documented as future integration areas and require separate implemented tests.

