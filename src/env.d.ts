/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

import type { Runtime } from '@astrojs/cloudflare';
import type { DatabaseEnv } from './lib/db';

declare global {
  namespace App {
    interface Locals extends Runtime<DatabaseEnv> {}
  }
}
