# 01 - Complete System Analysis

## Scope

The analysis covers the complete HarvestLink workspace:

- Frontend: `src/` with React pages, components, hooks, contexts, services, utilities, and routes.
- Backend: `backend/src/` with Express routes, controllers, middleware, Supabase integration, Lalamove integration, Gemini integration, email delivery, and realtime sockets.
- Database: `supabase/` migrations and schema.
- Existing tests: `tests/` and `backend/tests/`.
- QA: `HARVESTLINK_QA/`.

Generated directories such as `node_modules/`, `dist/`, `.git/`, and coverage output were excluded from source inventory and test discovery.

## Architecture

- Frontend framework: React with Vite.
- Frontend existing runner: Node's built-in test runner with `.test.mjs`.
- Backend runner: Node's built-in test runner with module mocks and PGlite SQL tests.
- Dedicated runner added: Vitest.
- Backend framework: Express.
- Authentication/database: Supabase Auth and Supabase Postgres.
- Email: Resend.
- AI: Gemini API through `backend/src/lib/geminiService.js`.
- Maps: Google Maps and road-routing integrations.
- Delivery: Lalamove integration plus existing live tracking.
- Payments: GCash and COD workflows.

## Roles

The system implements Buyer, Farmer/Seller, Stakeholder, and Admin roles. Authorization is enforced through `requireAuth`, `requireRole`, and route-specific backend checks.
