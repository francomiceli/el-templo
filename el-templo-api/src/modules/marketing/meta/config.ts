/**
 * Meta (fase 195, plan 08) — configuración por entorno.
 *
 * CAPI (conversiones) y gasto (Marketing API / Insights) se encienden por
 * separado y quedan APAGADOS si faltan credenciales: los servicios devuelven
 * no-op y la API arranca igual — mismo criterio que Wellhub o Sentry. STAGING
 * NUNCA debe tener estas variables (corre con datos reales clonados de prod:
 * mandaría conversiones reales a Meta).
 *
 * `||` y no `??` en todo el archivo: el deploy genera el `.env` desde GitHub
 * secrets y un secret sin definir llega como string vacío, que también cuenta
 * como ausente.
 */

const DEFAULT_GRAPH_VERSION = "v26.0";

export interface MetaCapiConfig {
  token: string;
  pixelId: string;
  graphVersion: string;
  /** Solo se derivan eventos posteriores a esta fecha (gate de activación). */
  startAt: Date;
  /** Si está, los eventos van al panel "Probar eventos" (validación puntual). */
  testEventCode: string | null;
}

export interface MetaSpendConfig {
  token: string;
  graphVersion: string;
  /** Ids de cuenta publicitaria SIN el prefijo `act_`. */
  adAccountIds: string[];
}

function readTrimmed(name: string): string | null {
  const value = (process.env[name] || "").trim();
  return value.length > 0 ? value : null;
}

/** `v26.0`; cualquier otra forma cae al default (el valor viaja en una URL). */
function readGraphVersion(): string {
  const raw = readTrimmed("META_GRAPH_VERSION");
  return raw !== null && /^v[0-9]+\.[0-9]+$/.test(raw)
    ? raw
    : DEFAULT_GRAPH_VERSION;
}

/**
 * Resultado de leer una config de Meta: la config (o `null` si queda apagada)
 * y los NOMBRES de las variables que faltan o no son válidas — son los mismos
 * que los secrets de GitHub del deploy. Nunca incluye valores: lo usa el
 * reporte de Origen de altas para decir qué falta cargar.
 */
export interface MetaConfigResolution<T> {
  config: T | null;
  missing: string[];
}

/**
 * Config de CAPI o `null` si falta el token, el pixel o la fecha de activación
 * (`META_CAPI_START_AT`, ISO obligatoria), o si esa fecha no es válida. El
 * pixel id va en la ruta de la URL: solo dígitos.
 */
export function resolveMetaCapiConfig(): MetaConfigResolution<MetaCapiConfig> {
  const token = readTrimmed("META_ACCESS_TOKEN");
  const pixelId = readTrimmed("META_PIXEL_ID");
  const startAtRaw = readTrimmed("META_CAPI_START_AT");
  const startAt = startAtRaw === null ? null : new Date(startAtRaw);

  const missing: string[] = [];
  if (token === null) missing.push("META_ACCESS_TOKEN");
  if (pixelId === null || !/^[0-9]+$/.test(pixelId)) {
    missing.push("META_PIXEL_ID");
  }
  if (startAt === null || Number.isNaN(startAt.getTime())) {
    missing.push("META_CAPI_START_AT");
  }
  if (
    token === null ||
    pixelId === null ||
    startAt === null ||
    missing.length
  ) {
    return { config: null, missing };
  }

  return {
    config: {
      token,
      pixelId,
      graphVersion: readGraphVersion(),
      startAt,
      testEventCode: readTrimmed("META_CAPI_TEST_EVENT_CODE"),
    },
    missing,
  };
}

/** Config de CAPI o `null` si está apagada (ver `resolveMetaCapiConfig`). */
export function getMetaCapiConfig(): MetaCapiConfig | null {
  return resolveMetaCapiConfig().config;
}

/**
 * Config del gasto o `null` si falta el token o no queda ninguna cuenta válida.
 * `META_AD_ACCOUNT_IDS` va separada por comas y acepta `act_123` o `123`; se
 * normaliza a dígitos solos (el cliente vuelve a anteponer `act_` al llamar) y
 * lo que no sea numérico se descarta (el id viaja en la ruta de la URL).
 */
export function resolveMetaSpendConfig(): MetaConfigResolution<MetaSpendConfig> {
  const token = readTrimmed("META_ACCESS_TOKEN");
  const rawAccounts = readTrimmed("META_AD_ACCOUNT_IDS");
  const adAccountIds = (rawAccounts ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^act_/i, ""))
    .filter((s) => /^[0-9]+$/.test(s));

  const missing: string[] = [];
  if (token === null) missing.push("META_ACCESS_TOKEN");
  if (adAccountIds.length === 0) missing.push("META_AD_ACCOUNT_IDS");
  if (token === null || missing.length) return { config: null, missing };

  return {
    config: { token, graphVersion: readGraphVersion(), adAccountIds },
    missing,
  };
}

/** Config del gasto o `null` si está apagado (ver `resolveMetaSpendConfig`). */
export function getMetaSpendConfig(): MetaSpendConfig | null {
  return resolveMetaSpendConfig().config;
}
