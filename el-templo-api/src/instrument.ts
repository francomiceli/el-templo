import * as Sentry from "@sentry/node";

/**
 * Códigos de error de mysql2 que significan "la conexión murió bajo una query
 * en vuelo" — el server (MySQL) se apagó o cerró el socket, la app no hizo nada
 * mal y el reintento del siguiente request es la respuesta correcta. Son ruido
 * de infra (restart de MySQL durante mantenimiento/deploy), no bugs: llegan a
 * Sentry porque los polls vivos (p.ej. el TV en `attachScope`) caen justo en la
 * ventana transitoria. NODE-56.
 *
 * Se dejan AFUERA a propósito `ECONNREFUSED` y `ETIMEDOUT`: una imposibilidad
 * *sostenida* de alcanzar MySQL sí es un incidente que debe verse en Sentry.
 */
const TRANSIENT_DB_ERROR_CODES = new Set([
  "ER_SERVER_SHUTDOWN", // errno 1053 — MySQL rechaza queries en vuelo mientras se apaga
  "PROTOCOL_CONNECTION_LOST", // el server cerró la conexión bajo la query
  "PROTOCOL_ENQUEUE_AFTER_QUIT",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "ECONNRESET",
  "EPIPE",
]);

const TRANSIENT_DB_ERRNOS = new Set([1053]); // ER_SERVER_SHUTDOWN

/**
 * Camina la cadena de `.cause` (drizzle envuelve el error de mysql2 en
 * `DrizzleQueryError.cause`) buscando un código/errno de infra transitorio. La
 * guarda de profundidad evita un ciclo si alguna causa se referencia a sí misma.
 */
function isTransientDbError(err: unknown, depth = 0): boolean {
  if (!(err instanceof Error) || depth > 5) return false;
  const code = (err as { code?: unknown }).code;
  const errno = (err as { errno?: unknown }).errno;
  if (typeof code === "string" && TRANSIENT_DB_ERROR_CODES.has(code)) {
    return true;
  }
  if (typeof errno === "number" && TRANSIENT_DB_ERRNOS.has(errno)) {
    return true;
  }
  return isTransientDbError((err as { cause?: unknown }).cause, depth + 1);
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.APP_ENVIRONMENT || process.env.NODE_ENV || "development",
    // Solo usamos Sentry para ERRORES, no para performance/traces. El tracing al
    // 0.2 consumía ~1M spans/día (80% de la cuota mensual en 4 días). Se baja a
    // una muestra fina: alcanza para dar contexto de traza a los errores sin
    // quemar la cuota de spans (los errores son cuota aparte y no se ven afectados).
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.02 : 1.0,
    sendDefaultPii: true,
    beforeSend(event, hint) {
      // Descartar el ruido de infra: query que murió por un restart/caída
      // transitoria de MySQL (NODE-56). El reintento del próximo poll lo cubre.
      if (isTransientDbError(hint?.originalException)) {
        return null;
      }
      // Scrub sensitive fields from request data
      if (event.request?.data && typeof event.request.data === "object") {
        const data = event.request.data as Record<string, unknown>;
        const sensitiveFields = ["password", "currentPassword", "newPassword"];
        for (const field of sensitiveFields) {
          if (field in data) {
            data[field] = "[REDACTED]";
          }
        }
      }
      return event;
    },
  });
}
