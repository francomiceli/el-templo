/**
 * Estado de las integraciones de medición (fase 195) para la card
 * "Integraciones apagadas" de Reportes › Origen de altas.
 *
 * Solo booleanos y NOMBRES de secrets de GitHub (los mismos que las variables
 * del `.env.production` de la API): NUNCA un valor, ni siquiera los IDs
 * públicos. Se calcula en cada request desde el entorno de la API, así que un
 * secret recién creado aparece prendido recién con el próximo deploy de la API.
 *
 * GA4 y el Pixel de la web viven en el build de la web, no en la API: el
 * deploy de producción copia `WEB_GA4_ID` y `WEB_META_PIXEL_ID` también al
 * `.env.production` de la API para poder informarlos acá. Staging no los
 * recibe (su web no mide), así que en staging esas dos figuran apagadas.
 */
import {
  readGbpSyncMode,
  resolveGbpConfig,
  resolveSearchConsoleConfig,
} from "./google/config";
import { resolveMetaCapiConfig, resolveMetaSpendConfig } from "./meta/config";

export type MeasurementIntegrationKey =
  | "ga4"
  | "meta_pixel"
  | "meta_capi"
  | "meta_spend"
  | "search_console"
  | "gbp";

/**
 * - GBP: `off` | `dry-run` | `apply` | `invalid` (siempre presente).
 * - CAPI: `test` (con META_CAPI_TEST_EVENT_CODE, los eventos van solo al panel
 *   "Probar eventos") | `live`; solo cuando está prendida.
 */
export type MeasurementIntegrationMode =
  | "off"
  | "dry-run"
  | "apply"
  | "invalid"
  | "test"
  | "live";

export interface MeasurementIntegration {
  key: MeasurementIntegrationKey;
  label: string;
  enabled: boolean;
  /** Secrets de GitHub que faltan o no son válidos. Vacío si está prendida. */
  missing: string[];
  mode?: MeasurementIntegrationMode;
}

function hasEnv(name: string): boolean {
  // `||` y no `??`: un secret sin crear llega como string vacío.
  return (process.env[name] || "").trim().length > 0;
}

function webIdIntegration(
  key: MeasurementIntegrationKey,
  label: string,
  secret: string,
): MeasurementIntegration {
  const enabled = hasEnv(secret);
  return { key, label, enabled, missing: enabled ? [] : [secret] };
}

/** Las 6 integraciones, siempre en el mismo orden (el de la guía). */
export function getMeasurementIntegrations(): MeasurementIntegration[] {
  const capi = resolveMetaCapiConfig();
  const spend = resolveMetaSpendConfig();
  const searchConsole = resolveSearchConsoleConfig();
  const gbp = resolveGbpConfig();
  const capiMode: MeasurementIntegrationMode | undefined =
    capi.config === null
      ? undefined
      : capi.config.testEventCode !== null
        ? "test"
        : "live";

  return [
    webIdIntegration("ga4", "Google Analytics 4", "WEB_GA4_ID"),
    webIdIntegration("meta_pixel", "Pixel de Meta (web)", "WEB_META_PIXEL_ID"),
    {
      key: "meta_capi",
      label: "Conversiones de Meta (CAPI)",
      enabled: capi.config !== null,
      missing: capi.missing,
      mode: capiMode,
    },
    {
      key: "meta_spend",
      label: "Gasto de Meta",
      enabled: spend.config !== null,
      missing: spend.missing,
    },
    {
      key: "search_console",
      label: "Search Console",
      enabled: searchConsole.config !== null,
      missing: searchConsole.missing,
    },
    {
      key: "gbp",
      label: "Fichas de Google (Business Profile)",
      enabled: gbp.config !== null,
      missing: gbp.missing,
      mode: readGbpSyncMode(),
    },
  ];
}
