/* eslint-disable */

/// <reference types="vite/client" />

// Quasar type declarations
declare module '#q-app/wrappers' {
  export function boot<T>(callback: T): T;
  export function defineRouter<T>(callback: T): T;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// Vite environment variables
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
