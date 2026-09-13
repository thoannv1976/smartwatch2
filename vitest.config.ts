import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a build-time guard for the Next.js bundler; under
      // Vitest it would throw on import, so it resolves to a no-op here. The
      // guard still protects the real build.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
