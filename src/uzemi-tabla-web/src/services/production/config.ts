/** Base path for the production API — a same-origin relative prefix,
 * proxied to production-service in dev (see vite.config.ts) and expected to
 * sit behind a gateway in production, matching joinerytech-portal's
 * per-module `services/<domain>/config.ts` convention. */
export const PRODUCTION_API_BASE = "/api/production";
