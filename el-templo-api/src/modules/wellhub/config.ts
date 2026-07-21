/**
 * Wellhub — configuración por entorno.
 *
 * Credenciales del sandbox/producción de la API de partners. La integración
 * queda APAGADA si faltan credenciales (los servicios devuelven no-op y el
 * webhook rechaza 503) — igual criterio que Sentry con SENTRY_DSN.
 *
 * El mapeo sede→gimnasio Wellhub NO vive acá: es branches.wellhub_gym_id.
 */

const SANDBOX_BASE_URL = "https://apitesting.partners.gympass.com";

export interface WellhubConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
}

/**
 * Devuelve la config o null si la integración no está configurada.
 * WELLHUB_BASE_URL es opcional (default: sandbox) para que apuntar a
 * producción sea un cambio de env explícito.
 */
export function getWellhubConfig(): WellhubConfig | null {
  const apiKey = process.env.WELLHUB_API_KEY;
  const webhookSecret = process.env.WELLHUB_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) return null;

  return {
    baseUrl: process.env.WELLHUB_BASE_URL ?? SANDBOX_BASE_URL,
    apiKey,
    webhookSecret,
  };
}
