# 03 - Unit Test Cases

## Existing Test Suites

- Frontend: 112 existing test files under `tests/`.
- Backend: 54 existing test files under `backend/tests/`.
- Dedicated Vitest: 49 test files under `HARVESTLINK_UNIT_TESTING/unit-tests/`.

## Dedicated Test Files

### Frontend

- `login.test.js`
- `registration.test.js`
- `productManagement.test.js`
- `marketInsights.test.js`
- `aiPriceRecommendation.test.js`
- `cartCheckout.test.js`
- `orderManagement.test.js`
- `liveTracking.test.js`
- `notifications.test.js`
- `adminDashboard.test.js`
- `contactUs.test.js`
- `coreUtilities.test.js`
- `profileAndLocation.test.js`
- `vehicleAndTracking.test.js`
- `notificationAndBrowser.test.js`
- `constantsAndFormatters.test.js`
- `geoAndDevice.test.js`
- `authDestination.test.js`
- `catalogManagement.test.js`
- `profileManagement.test.js`
- `messaging.test.js`
- `donations.test.js`
- `paymentValidation.test.js`

### Backend

- `authSecurity.test.js`
- `passwordReset.test.js`
- `productManagement.test.js`
- `marketInsights.test.js`
- `aiPriceRecommendation.test.js`
- `checkout.test.js`
- `contactEmail.test.js`
- `adminAccount.test.js`
- `deliveryAndPricing.test.js`
- `forecastAndMarket.test.js`
- `donationAndArrival.test.js`
- `paymentAndMobile.test.js`
- `authRegistrationController.test.js`
- `loginController.test.js`
- `ordersPayments.test.js`
- `passwordRecoveryController.test.js`
- `profileAndLocation.test.js`
- `profileManagement.test.js`
- `contactController.test.js`
- `deliveryFeeController.test.js`
- `notificationController.test.js`
- `ratingsController.test.js`
- `checkoutQuote.test.js`
- `roleAndAccount.test.js`
- `forecastEngine.test.js`
- `donationArrival.test.js`
- `tripTelemetry.test.js`
- `lalamoveStatus.test.js`

## Case Categories

Each executable feature suite covers, where applicable:

- Successful operations
- Invalid/missing inputs
- Boundary values
- Role and account authorization
- Rate limits
- Price and stock calculations
- Unit conversion
- Email recipient/reply-to behavior
- Account deactivation and reactivation
- Illegal listing keyword checks
- Live-coordinate invalid-input handling

Existing Node suites add presentation, SQL/PGlite, mocks, and controller coverage for the broader feature inventory.
