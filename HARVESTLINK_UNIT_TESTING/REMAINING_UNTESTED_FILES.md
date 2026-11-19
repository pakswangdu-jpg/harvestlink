# Remaining Untested Files

The following categories are still below meaningful Vitest coverage.

## Controllers

The following backend controllers remain 0% in the dedicated Vitest coverage report:

- auth.controller.js
- catalog.controller.js
- deliveries.controller.js
- donations.controller.js
- forecast.controller.js
- lalamove.controller.js
- login.controller.js
- marketPriceOverrides.controller.js
- messages.controller.js
- orders.controller.js
- passwordRecovery.controller.js
- payments.controller.js
- products.controller.js
- profiles.controller.js
- ratings.controller.js
- lalamoveWebhook.controller.js

Contact and delivery-fee controllers now have meaningful dedicated tests.

## Services and External Integrations

- apiClient.js
- authService.js
- catalogService.js
- deliveryService.js
- demandForecastService.js
- geocodeService.js
- Google Maps and directions services
- Lalamove service
- liveTrackingStore.js
- marketPriceService.js
- messageService.js
- notificationService.js
- orderService.js
- paymentService.js
- placesService.js
- productService.js
- routingService.js
- uploadService.js
- Gemini service
- ReCAPTCHA
- PSA provider
- weather provider
- road routing

These require browser, network, or provider mocks and are better covered by integration/E2E tests.

## Middleware

- requireAuth.js
- requireRole.js is now tested
- apiRateLimit.js
- rateLimit.js
- requireAdminNetwork.js
- errorHandler.js
- Lalamove webhook verification

## React Components and Pages

The existing Node presentation suites cover many components, but direct V8/component coverage is minimal. Component render tests need jsdom or browser automation.

## Why 80% Is Not Verifiable

The coverage report includes 5,699 lines and 6,907 statements across utility, controller, service, and middleware files. Direct Vitest unit coverage is 10.79% lines. Controllers and external services remain partially mocked or excluded from direct execution. Claiming 80% repository coverage would be inaccurate.
