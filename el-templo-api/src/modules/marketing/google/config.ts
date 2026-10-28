/**
 * Google (fase 195, plan 09) — configuración por entorno.
 *
 * Search Console (lectura) y Google Business Profile (escritura de fichas) se
 * encienden por separado y quedan APAGADOS si faltan credenciales: los jobs
 * son un no-op con log y la API arranca igual (mismo criterio que Meta, Wellhub
 * o Sentry). GBP además arranca en `off`: escribe en fichas públicas reales.
 * STAGING NUNCA debe tener estas variables (comparte datos reales con prod).
 *
 * `||` y no `??`: el deploy genera el `.env` desde GitHub secrets y un secret
 * sin definir llega como string vacío, que también cuenta como ausente.
 *
 * Los motivos de rechazo NUNCA incluyen valores de las variables (claves,
 * tokens): solo el nombre de la variable y qué le falta.
 */

const DEFAULT_SITE_URL = "sc-domain:eltemplo.org";

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

export interface SearchConsoleConfig {
  serviceAccount: GoogleServiceAccount;
  /** Propiedad de Search Console (`sc-domain:eltemplo.org` o una URL-prefix). */
  siteUrl: string;
}

export type GbpSyncMode = "dry-run" | "apply";

export interface GbpConfig {
  mode: GbpSyncMode;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ConfigResolution<T> {
  config: T | null;
  /** Por qué quedó apagada (null si está activa). Sin secretos. */
  reason: string | null;
  /**
   * NOMBRES de las variables que faltan o no son válidas (los mismos que los
   * secrets de GitHub del deploy). Vacío si está activa. Nunca valores: lo
   * usa el reporte de Origen de altas para decir qué falta cargar.
   */
  missing: string[];
}

function readTrimmed(name: string): string | null {
  const value = (process.env[name] || "").trim();
  return value.length > 0 ? value : null;
}

function parseServiceAccount(base64: string): GoogleServiceAccount | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const email = obj.client_email;
  const key = obj.private_key;
  if (typeof email !== "string" || email.trim().length === 0) return null;
  if (typeof key !== "string" || key.trim().length === 0) return null;
  const keyId = obj.private_key_id;
  return {
    client_email: email.trim(),
    private_key: key,
    ...(typeof keyId === "string" && keyId.length > 0
      ? { private_key_id: keyId }
      : {}),
  };
}

/** Config de Search Console con el motivo si está apagada. */
export function resolveSearchConsoleConfig(): ConfigResolution<SearchConsoleConfig> {
  const raw = readTrimmed("GOOGLE_SC_SERVICE_ACCOUNT_BASE64");
  if (raw === null) {
    return {
      config: null,
      reason: "falta GOOGLE_SC_SERVICE_ACCOUNT_BASE64",
      missing: ["GOOGLE_SC_SERVICE_ACCOUNT_BASE64"],
    };
  }
  const serviceAccount = parseServiceAccount(raw);
  if (serviceAccount === null) {
    return {
      config: null,
      reason:
        "GOOGLE_SC_SERVICE_ACCOUNT_BASE64 no es un JSON en base64 con client_email y private_key",
      missing: ["GOOGLE_SC_SERVICE_ACCOUNT_BASE64"],
    };
  }
  return {
    config: {
      serviceAccount,
      siteUrl: readTrimmed("GOOGLE_SC_SITE_URL") ?? DEFAULT_SITE_URL,
    },
    reason: null,
    missing: [],
  };
}

/** `null` si falta la service account o no es válida. */
export function getSearchConsoleConfig(): SearchConsoleConfig | null {
  return resolveSearchConsoleConfig().config;
}

/**
 * Modo del sync de GBP según `GBP_SYNC_MODE`: ausente u `off` = `off` (es el
 * default y NO es un error), un valor desconocido = `invalid`.
 */
export function readGbpSyncMode(): GbpSyncMode | "off" | "invalid" {
  const modeRaw = (readTrimmed("GBP_SYNC_MODE") ?? "off").toLowerCase();
  if (modeRaw === "off" || modeRaw === "dry-run" || modeRaw === "apply") {
    return modeRaw;
  }
  return "invalid";
}

/**
 * Config de GBP con el motivo si está apagada. `GBP_SYNC_MODE` ausente o `off`
 * = apagado (es el default y NO es un error). Un modo desconocido también
 * apaga: ante la duda, no escribir en fichas reales.
 */
export function resolveGbpConfig(): ConfigResolution<GbpConfig> {
  const mode = readGbpSyncMode();
  const clientId = readTrimmed("GBP_OAUTH_CLIENT_ID");
  const clientSecret = readTrimmed("GBP_OAUTH_CLIENT_SECRET");
  const refreshToken = readTrimmed("GBP_REFRESH_TOKEN");
  const missingCredentials = [
    clientId === null ? "GBP_OAUTH_CLIENT_ID" : null,
    clientSecret === null ? "GBP_OAUTH_CLIENT_SECRET" : null,
    refreshToken === null ? "GBP_REFRESH_TOKEN" : null,
  ].filter((name): name is string => name !== null);

  if (mode === "off") {
    return {
      config: null,
      reason: "GBP_SYNC_MODE=off",
      missing: ["GBP_SYNC_MODE", ...missingCredentials],
    };
  }
  if (mode === "invalid") {
    return {
      config: null,
      reason: "GBP_SYNC_MODE inválido (valores: off, dry-run, apply)",
      missing: ["GBP_SYNC_MODE", ...missingCredentials],
    };
  }
  if (clientId === null || clientSecret === null || refreshToken === null) {
    return {
      config: null,
      reason: `falta ${missingCredentials.join(", ")}`,
      missing: missingCredentials,
    };
  }

  return {
    config: { mode, clientId, clientSecret, refreshToken },
    reason: null,
    missing: [],
  };
}

/** `null` si GBP está apagado (modo off/inválido) o faltan credenciales. */
export function getGbpConfig(): GbpConfig | null {
  return resolveGbpConfig().config;
}
