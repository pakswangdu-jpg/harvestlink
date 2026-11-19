# Feature Unit Test Coverage

## Unit-Tested Features

| Feature | Existing Node Tests | Dedicated Vitest | Status |
|---|---|---|---|
| Authentication/role checks | Yes | Yes | Unit-tested |
| Registration validation | Yes | Yes | Unit-tested |
| Login validation | Yes | Partial | Unit-tested, success integration mocked separately |
| Password recovery/reset | Yes | Yes | Unit-tested |
| Product validation/status | Yes | Yes | Unit-tested |
| Checkout quote | Yes | Yes | Unit-tested |
| COD/GCash validation | Yes | Yes | Unit-tested |
| Market Insights matching | Yes | Yes | Unit-tested |
| AI/rule-based price recommendation | Yes | Yes | Unit-tested |
| Order lifecycle/delivery sequence | Yes | Yes | Unit-tested |
| Live GPS/trip telemetry | Yes | Yes | Unit-tested |
| Buyer/stakeholder pickup | Yes | Yes | Unit-tested |
| Donation rules/arrival | Yes | Yes | Unit-tested |
| Notifications | Yes | Yes | Unit-tested |
| Unified messaging validation/presentation | Yes | Partial | Unit + presentation |
| Ratings/reviews | Yes | Partial | Unit + existing Node tests |
| Admin users/history | Yes | Partial | Unit/presentation |
| Admin price monitoring | Yes | Partial | Unit/presentation |
| Catalog/status/expiry | Yes | Yes | Unit-tested |
| Contact Us | Yes | Yes | Unit-tested |
| ReCAPTCHA | Yes | Existing Node tests | Provider-mocked |
| Lalamove status | Yes | Yes | Unit-tested |

## Integration/E2E-Only Areas

These features are not safely unit-tested directly because they require real browser or provider state:

- Supabase database writes and auth sessions
- Resend email delivery
- Gemini API responses
- Google Maps and real geocoding
- GCash/Lalamove external transactions
- Real Socket.io connection behavior
- Camera capture and device orientation
- Live GPS browser permissions
- React component rendering in a real browser

These areas are covered partly by existing Node mocks/PGlite tests and should be verified by integration/E2E tests.
