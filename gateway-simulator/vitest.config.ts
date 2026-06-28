import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@protocol': resolve(__dirname, 'src/protocol'),
      '@main': resolve(__dirname, 'src/main'),
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.{ts,tsx}'],
    exclude: ['__tests__/**/*.live.test.ts'],
    environment: 'node',
    environmentMatchGlobs: [['__tests__/components/**', 'happy-dom']],
    setupFiles: ['__tests__/components/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts', 'src/protocol/**/*.ts', 'src/renderer/utils/**/*.ts'],
      exclude: [
        'src/main/index.ts',
        'src/main/app-menu.ts',
        'src/main/edit-menu.ts',
        'src/main/ipc/**',
        'src/main/net/ITransport.ts',
        'src/main/net/GatewayConnection.ts',
        'src/main/commands/ICommandHandler.ts',
        'src/main/commands/command-context.types.ts',
        'src/main/behaviors/**',
        'src/protocol/index.ts',
        'src/protocol/device-simulator-state.ts',
        'src/protocol/user-simulator-state.ts',
        'src/protocol/schedule.types.ts',
        'src/main/history/simulator-history.types.ts',
        'src/renderer/utils/simulator-client.ts',
      ],
      thresholds: {
        lines: 88,
        functions: 88,
        branches: 75,
        statements: 88,
        'src/main/users/**': {
          lines: 92,
          functions: 90,
          branches: 75,
          statements: 92,
        },
        'src/main/core/UserManager.ts': {
          lines: 92,
          functions: 90,
          branches: 75,
          statements: 92,
        },
        'src/main/auth/MobileApiClient.ts': {
          lines: 92,
          functions: 90,
          statements: 92,
        },
        'src/main/auth/BackendClient.ts': {
          lines: 90,
          functions: 90,
          branches: 75,
          statements: 90,
        },
        'src/renderer/utils/gateway-status-bar.utils.ts': {
          lines: 88,
          functions: 88,
          branches: 75,
          statements: 88,
        },
      },
    },
  },
});
