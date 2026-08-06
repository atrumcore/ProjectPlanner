/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Entra ID app registration client ID. Unset = M365 integration disabled. */
  readonly VITE_MSAL_CLIENT_ID?: string;
  /** Entra ID tenant ID (single-tenant authority). */
  readonly VITE_MSAL_TENANT_ID?: string;
  /** '1' = use the in-memory mock Graph tenant instead of real MSAL/Graph. */
  readonly VITE_GRAPH_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
