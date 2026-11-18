# 08 - Testing Commands

Run from the project root.

```powershell
npm test
npm run test:run
npm run test:frontend
npm run test:backend
npm run test:vitest
npm run test:coverage
npm run test:all
```

## Command Behavior

- `npm test`: existing frontend Node suite.
- `npm run test:run`: existing frontend Node suite.
- `npm run test:frontend`: existing frontend Node suite.
- `npm run test:backend`: existing backend Node suite.
- `npm run test:vitest`: dedicated Vitest suites.
- `npm run test:coverage`: dedicated Vitest coverage.
- `npm run test:all`: frontend, backend, and dedicated Vitest suites continue in sequence and the process exits with failure if any suite fails.
