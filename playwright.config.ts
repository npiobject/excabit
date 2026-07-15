import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el build real con la red mockeada (docs/07 §1).
 *
 * La red se intercepta en cada test con `page.route`: los E2E no pueden
 * depender de mempool.space, ni por velocidad ni por educación con un servicio
 * público y gratuito (ADR-002).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 2,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Se prueba el build, no el dev server: es lo que llega al usuario.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 120_000,
  },
});
