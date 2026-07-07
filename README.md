# HarvestLink

HarvestLink is a frontend-only React prototype for a Cebu farm-to-market marketplace. It connects farmers and buyers through produce listings, buyer purchase requests, farmer request review, and a simple admin dashboard.

The current prototype uses `localStorage` instead of a backend API or database.

## Features

- Farmer and buyer registration/login
- Admin shortcut login
- Farmer product listing management
- Buyer marketplace browsing
- Product detail pages
- Buyer purchase requests
- Cash or Online payment method selection
- Farmer confirm/reject flow
- Buyer request status history
- Admin dashboard for users, products, requests, and reports placeholder
- Responsive UI for desktop and mobile

## Scripts

- `npm run dev` - start the local Vite dev server
- `npm run build` - create a production build
- `npm run lint` - run ESLint checks

## Run Locally

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open the local URL shown by Vite, usually:

```text
http://127.0.0.1:5173/
```

## Test Accounts

Create farmer and buyer accounts from `/register`.

Admin shortcut:

```text
Email: admin@harvestlink.com
Password: admin
```

## How To Test The Main Flow

1. Register as a farmer.
2. Go to `Products`.
3. Add a product with name, category, price, unit, quantity, location, description, and optional image.
4. Logout.
5. Register as a buyer.
6. Go to `Marketplace`.
7. Open the farmer product.
8. Enter a request quantity.
9. Choose `Cash` or `Online payment`.
10. Send the purchase request.
11. Logout as buyer.
12. Login as the farmer.
13. Go to `Requests`.
14. Confirm or reject the buyer request.
15. Logout as farmer.
16. Login as the buyer again.
17. Go to `Requests` and verify the status is `confirmed` or `rejected`.

## LocalStorage Keys

The prototype stores data in these keys:

- `harvestlink_users`
- `harvestlink_products`
- `harvestlink_purchase_requests`
- `harvestlink_current_user`

To reset demo data, clear site data in the browser or remove these keys from DevTools.

## Project Structure

```text
src/
  app/
  components/
  features/
  services/
  styles/
  utils/
```

Business logic lives in `src/services`. UI screens and role-specific flows live in `src/features`.
