import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Numbered CASE files are the maintained unit-test inventory. Legacy
    // unnumbered fixtures are kept in the tree but are not part of the suite.
    include: ['tests/Unit-Testing/**/CASE-*.test.{js,jsx}'],
    environment: 'node',
  },
});
