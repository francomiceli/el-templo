/**
 * Scrub de secretos para Sentry (fase 195, plan 08, T-195-31).
 *
 * Funciones puras y sin efectos (a diferencia de `instrument.ts`, que inicia
 * Sentry solo si hay DSN): así se pueden testear. Redactan, en el cuerpo del
 * request, la query string, la URL, `extra` y los breadcrumbs:
 *   - contraseñas (`password`, `currentPassword`, `newPassword`);
 *   - credenciales de integraciones (`access_token`, `assertion`,
 *     `refresh_token`, `client_secret`, `token`), tanto como CLAVE de un objeto
 *     como en forma `clave=valor` dentro de una URL o un texto.
 *
 * Importa la Graph API de Meta con el token en la URL del GET de Insights: sin
 * esto el breadcrumb HTTP de Sentry lo llevaría en claro.
 */

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set(
  [
    "password",
    "currentPassword",
    "newPassword",
    "access_token",
    "assertion",
    "refresh_token",
    "client_secret",
    "token",
  ].map((k) => k.toLowerCase()),
);

/** `clave=valor` de una URL, query string o texto con una clave sensible. */
const SENSITIVE_PARAM =
  /([?&;\s]|^)(password|currentPassword|newPassword|access_token|assertion|refresh_token|client_secret|token)=([^&#\s"']*)/gi;

/** `"clave":"valor"` de un JSON serializado dentro de un texto. */
const SENSITIVE_JSON =
  /("(?:password|currentPassword|newPassword|access_token|assertion|refresh_token|client_secret|token)"\s*:\s*)"[^"]*"/gi;

const MAX_DEPTH = 8;

/** Reemplaza el valor de los parámetros sensibles de un texto (URL o query string). */
export function scrubSecretParams(text: string): string {
  return text
    .replace(
      SENSITIVE_PARAM,
      (_m, sep: string, key: string) => `${sep}${key}=${REDACTED}`,
    )
    .replace(SENSITIVE_JSON, (_m, head: string) => `${head}"${REDACTED}"`);
}

/**
 * Copia profunda con los valores de claves sensibles redactados y los textos
 * limpios de parámetros sensibles. No muta la entrada. Tope de profundidad
 * contra ciclos.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubSecretParams(value);
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? REDACTED
      : scrubValue(inner, depth + 1);
  }
  return out;
}

interface ScrubbableEvent {
  request?: {
    data?: unknown;
    url?: string;
    query_string?: unknown;
    headers?: Record<string, unknown>;
  };
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<{ data?: Record<string, unknown>; message?: string }>;
}

/** Limpia un evento de Sentry en el lugar (mismo contrato que `beforeSend`). */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request) {
    if (request.data !== undefined) request.data = scrubValue(request.data);
    if (typeof request.url === "string") {
      request.url = scrubSecretParams(request.url);
    }
    if (request.query_string !== undefined) {
      request.query_string = scrubValue(request.query_string);
    }
  }
  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>;
  }
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.data) {
        crumb.data = scrubValue(crumb.data) as Record<string, unknown>;
      }
      if (typeof crumb.message === "string") {
        crumb.message = scrubSecretParams(crumb.message);
      }
    }
  }
  return event;
}

/** Para `beforeBreadcrumb`: un breadcrumb HTTP lleva la URL (con la query) en `data.url`. */
export function scrubBreadcrumb<
  T extends { data?: Record<string, unknown>; message?: string },
>(crumb: T): T {
  return scrubSentryEvent({ breadcrumbs: [crumb] }).breadcrumbs?.[0] as T;
}
