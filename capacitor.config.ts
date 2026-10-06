import type { CapacitorConfig } from '@capacitor/cli';

/**
 * NextGen Manager — thin native shell around the existing dashboard PWA.
 *
 * Same architecture as NextGen POS: the React/Vite app in `src/` is the single
 * source of truth and the SAME build serves the browser, so there is no second
 * manager codebase. See docs/MOBILE_APP_ARCHITECTURE.md.
 *
 * appId/appName are NextGen's. One store binary serves every restaurant and
 * personalises itself after login — per-restaurant store binaries are
 * deliberately not attempted.
 */
const config: CapacitorConfig = {
  appId: 'za.co.nextgenintelligence.manager',
  appName: 'NextGen Manager',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
