# Browser Automation Command Reference

The browser smoke test is available and runs against the local frontend. Role-specific browser tests remain blocked until isolated test accounts and a non-production Supabase environment are configured.

## Browser commands

| Feature | Test file | Command |
|---|---|---|
| Landing page smoke test | `unit-testing/tests/smoke.spec.js` | `npm.cmd run test:e2e:smoke` |
| Login | `unit-testing/tests/auth/login.spec.js` | `npm.cmd run test:e2e:login` |
| Registration | `unit-testing/tests/auth/registration.spec.js` | `npm.cmd run test:e2e:registration` |
| Logout/protected access | `unit-testing/tests/auth/logout.spec.js` | `npm.cmd run test:e2e:logout` |
| Password recovery | `unit-testing/tests/auth/password-recovery.spec.js` | `npm.cmd run test:e2e:password-recovery` |
| Buyer marketplace | `unit-testing/tests/buyer/marketplace.spec.js` | `npm.cmd run test:e2e:buyer-marketplace` |
| Buyer checkout protection | `unit-testing/tests/buyer/checkout.spec.js` | `npm.cmd run test:e2e:buyer-checkout` |
| Farmer products | `unit-testing/tests/farmer/products.spec.js` | `npm.cmd run test:e2e:farmer-products` |
| Farmer donations | `unit-testing/tests/farmer/donations.spec.js` | `npm.cmd run test:e2e:farmer-donations` |
| Stakeholder donations | `unit-testing/tests/stakeholder/donations.spec.js` | `npm.cmd run test:e2e:stakeholder-donations` |
| Admin dashboard protection | `unit-testing/tests/admin/dashboard.spec.js` | `npm.cmd run test:e2e:admin-dashboard` |
| Role account login checks | `unit-testing/tests/roles/login-roles.spec.js` | `npm.cmd run test:e2e:role-logins` |
| Buyer login | `unit-testing/tests/roles/login-roles.spec.js` | `npm.cmd run test:e2e:buyer-login` |
| Farmer login | `unit-testing/tests/roles/login-roles.spec.js` | `npm.cmd run test:e2e:farmer-login` |
| Stakeholder login | `unit-testing/tests/roles/login-roles.spec.js` | `npm.cmd run test:e2e:stakeholder-login` |
| Admin login | `unit-testing/tests/roles/login-roles.spec.js` | `npm.cmd run test:e2e:admin-login` |
| All discovered browser tests | all `unit-testing/tests/**/*.spec.js` files | `npm.cmd run test:e2e:all` |
| HTML report | Playwright report | `npm.cmd run test:e2e:report` |

## Current executable automated suites

| Suite | Command |
|---|---|
| Frontend tests | `npm.cmd test` |
| Backend tests | `npm.cmd run test:backend` |
| Frontend and backend tests | `npm.cmd run test:all` |

## Required setup before browser commands can be added

```powershell
npm install --save-dev @playwright/test
npx playwright install chromium
```

The test environment must then provide isolated accounts and a non-production Supabase project. After that setup, each real Playwright `.spec` file can receive one matching `npm run test:e2e:<feature>` command.
