/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_WS_BASE_URL: string
  readonly VITE_AI_SERVICE_URL: string
  readonly VITE_DATA_SERVICE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}