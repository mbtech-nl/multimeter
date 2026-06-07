import { defineConfig } from 'vitest/config';

// Composables run reactivity under jsdom; the recorder engine persists to IndexedDB.
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'] },
});
