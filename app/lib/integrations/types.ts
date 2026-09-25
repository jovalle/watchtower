/** Integration settings the browser may see: never includes secrets. */
export interface PublicIntegrationsConfig {
  seerr: { url: string; hasApiKey: boolean } | null;
  trakt: { clientId: string; hasClientSecret: boolean } | null;
}
