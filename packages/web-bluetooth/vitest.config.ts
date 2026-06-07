import { defineConfig } from 'vitest/config';

// Transport + MeterSession touch navigator.bluetooth / EventTarget / DataView, so run under
// jsdom. (demo.ts is environment-agnostic and passes here too.)
export default defineConfig({
  test: { environment: 'jsdom' },
});
