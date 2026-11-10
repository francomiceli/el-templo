/**
 * Topes de `@fastify/rate-limit` por ruta (una sola tabla). El plugin se
 * registra con `global: false` en `app.ts`: solo las rutas que declaran
 * `config: { rateLimit: RATE_LIMITS.x }` lo pagan. La clave es la IP del
 * cliente (`request.ip`, resuelta con `trustProxy: 1`, ver `app.ts`).
 */
export const RATE_LIMITS = {
  /** Gimnasio con Wi-Fi compartido: varios socios por minuto desde la misma IP. */
  login: { max: 20, timeWindow: "1 minute" },
  register: { max: 20, timeWindow: "15 minutes" },
  /** Magic link de campañas. */
  exchange: { max: 20, timeWindow: "1 minute" },
  /** Formularios públicos de marketing que mandan un mail por pedido. */
  publicForm: { max: 10, timeWindow: "1 hour" },
  /** Código de 6 dígitos por mail (2026-09-15). */
  forgotPassword: { max: 5, timeWindow: "15 minutes" },
  resetPassword: { max: 10, timeWindow: "15 minutes" },
  /** 1-3 requests por build de la web: el tope solo frena abuso (T-195-07). */
  siteData: { max: 60, timeWindow: "1 minute" },
} as const;
