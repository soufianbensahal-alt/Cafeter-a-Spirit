import { defineConfig, devices } from '@playwright/test';

const enabled = process.env.SPIRIT_E2E === '1';
const supabaseUrl = process.env.SPIRIT_E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const publishableKey = process.env.SPIRIT_E2E_SUPABASE_PUBLISHABLE_KEY || '';

if (enabled && supabaseUrl.includes('iabuhjhyvsqhtiqowarq')) {
  throw new Error('Los E2E destructivos no pueden ejecutarse contra producción.');
}
if (enabled && !publishableKey) {
  throw new Error('Falta SPIRIT_E2E_SUPABASE_PUBLISHABLE_KEY para la base desechable.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'] } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: enabled ? {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: publishableKey
    }
  } : undefined
});
