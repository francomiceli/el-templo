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
  /** Fase 214 D-45: reportar la foto de otro socio. Frena el abuso del contador (por IP). */
  photoReport: { max: 20, timeWindow: "1 minute" },
  /**
   * Fase 214 (ME-03): pedir la URL de subida y confirmar la foto propia. Cada
   * pedido firma una URL nueva contra el bucket privado, así que el tope frena
   * que una cuenta llene el bucket. Por IP en `config` y por usuario en el
   * `preHandler` (Wi-Fi compartido en la sede).
   */
  photoUpload: { max: 20, timeWindow: "1 minute" },
  photoUploadPerUser: { max: 6, timeWindow: "1 minute" },
  /** Fase 214: lista de anotados de un horario. Por IP (Wi-Fi compartido en la sede). */
  attendees: { max: 120, timeWindow: "1 minute" },
  /**
   * Fase 214: lo mismo POR USUARIO. Frena que un solo alumno recorra los horarios
   * de todo el gimnasio para saber donde esta alguien (T-214-17-03).
   */
  attendeesPerUser: { max: 40, timeWindow: "1 minute" },
  /**
   * 2026-11-20: caras de los anotados de TODO el dia en la Reservas (una
   * llamada por dia/sede que mira el alumno, no por horario). Mismos topes que
   * `attendees`, pero en su propio balde para no gastar el de la lista abierta.
   */
  dayAttendees: { max: 120, timeWindow: "1 minute" },
  dayAttendeesPerUser: { max: 40, timeWindow: "1 minute" },
  /**
   * Fase 215: dar el regalo de Aura. Por IP en `config` (Wi-Fi compartido en la
   * sede) y por usuario en el `preHandler`. En el uso normal no se nota.
   */
  giftGive: { max: 30, timeWindow: "1 minute" },
  giftGivePerUser: { max: 10, timeWindow: "1 minute" },
  /**
   * Fase 215: abrir las caras de una clase. El tope por usuario frena que un
   * alumno recorra clases para saber quien fue a cuales.
   */
  giftCandidates: { max: 120, timeWindow: "1 minute" },
  giftCandidatesPerUser: { max: 30, timeWindow: "1 minute" },
  /**
   * Fase 215 (#33): celebración de Aura. La app consulta al entrar a Mi Templo y
   * al volver a primer plano: el uso normal es de unas pocas por minuto.
   */
  auraCelebration: { max: 120, timeWindow: "1 minute" },
  auraCelebrationPerUser: { max: 20, timeWindow: "1 minute" },
} as const;
