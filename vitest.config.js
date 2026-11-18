import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['HARVESTLINK_UNIT_TESTING/unit-tests/**/*.test.{js,mjs,jsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'HARVESTLINK_UNIT_TESTING/coverage',
      reporter: ['text', 'html', 'json-summary', 'json'],
      include: [
        'src/utils/**/*.js',
        'src/services/**/*.js',
        'backend/src/lib/**/*.js',
        'backend/src/controllers/**/*.js',
        'backend/src/middleware/**/*.js',
      ],
      exclude: ['**/*.test.*', '**/node_modules/**'],
    },
  },
});
