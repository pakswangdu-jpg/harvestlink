import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/Integration-Testing/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
