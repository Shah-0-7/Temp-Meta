/**
 * @module lib/api
 *
 * Base URL of the TryAnywhere API server.
 */

/**
 * Where the API server is. In development it defaults to localhost. In a production build
 * it is empty unless VITE_API_URL is set, which means "no server": the app then works fully
 * on-device and never probes localhost (that would trigger browser local-network prompts).
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');
