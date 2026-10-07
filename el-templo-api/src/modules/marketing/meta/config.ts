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
 * Config de CAPI o `null` si falta el token, el pixel o la fecha de activación
 * (`META_CAPI_START_AT`, ISO obligatoria), o si esa fecha no es válida. El
 * pixel id va en la ruta de la URL: solo dígitos.
 */
export function getMetaCapiConfig(): MetaCapiConfig | null {
  const token = readTrimmed("META_ACCESS_TOKEN");
  const pixelId = readTrimmed("META_PIXEL_ID");
  const startAtRaw = readTrimmed("META_CAPI_START_AT");
  if (token === null || pixelId === null || startAtRaw === null) return null;
  if (!/^[0-9]+$/.test(pixelId)) return null;

  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) return null;

  return {
    token,
    pixelId,
    graphVersion: readGraphVersion(),
    startAt,
    testEventCode: readTrimmed("META_CAPI_TEST_EVENT_CODE"),
  };
}

/**
 * Config del gasto o `null` si falta el token o no queda ninguna cuenta válida.
 * `META_AD_ACCOUNT_IDS` va separada por comas y acepta `act_123` o `123`; se
 * normaliza a dígitos solos (el cliente vuelve a anteponer `act_` al llamar) y
 * lo que no sea numérico se descarta (el id viaja en la ruta de la URL).
 */
export function getMetaSpendConfig(): MetaSpendConfig | null {
  const token = readTrimmed("META_ACCESS_TOKEN");
  const rawAccounts = readTrimmed("META_AD_ACCOUNT_IDS");
  if (token === null || rawAccounts === null) return null;

  const adAccountIds = rawAccounts
    .split(",")
    .map((s) => s.trim().replace(/^act_/i, ""))
    .filter((s) => /^[0-9]+$/.test(s));
  if (adAccountIds.length === 0) return null;

  return { token, graphVersion: readGraphVersion(), adAccountIds };
}
