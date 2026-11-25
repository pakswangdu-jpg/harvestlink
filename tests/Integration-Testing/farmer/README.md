# Farmer Integration Tests

Each Farmer integration test follows this structure:

```text
1. Import Vitest helpers.
2. Define isolated Farmer and product fixtures.
3. Mock only the Supabase/database boundary.
4. Import the real backend controller and frontend service.
5. Connect the service call to the real controller in the test adapter.
6. Execute the application-level workflow.
7. Assert request data, ownership, response serialization, and side effects.
8. Reset fixtures before every test.
9. Report the actual test result through Vitest.
```

Current test sequence:

```text
FARMER_IT001.test.js  Add product
FARMER_IT002.test.js  Retrieve products
FARMER_IT003.test.js  Edit product
FARMER_IT004.test.js  Retrieve updated product
FARMER_IT005.test.js  Search products
```

Run the Farmer integration suite with:

```bash
npx vitest run --config vitest.integration.config.js tests/Integration-Testing/farmer
```

