/**
 * Tope por USUARIO, para sumar al tope por IP que la ruta declara en
 * `config.rateLimit` (tabla en `rate-limits.ts`).
 *
 * Por qué no `preHandler: fastify.rateLimit({ ... keyGenerator })`:
 * `@fastify/rate-limit` marca cada request con un símbolo (`rateLimitRan`) la
 * primera vez que corre un limitador, y todo limitador posterior de ese request
 * sale sin contar. El del `config.rateLimit` de la ruta corre en `onRequest`, así
 * que el `preHandler` de `fastify.rateLimit(...)` nunca contaba: el tope por
 * usuario no existía (la 7ª subida de foto en un minuto devolvía 200). La API
 * pensada para varios limitadores en una misma ruta es `createRateLimit`, que no
 * usa esa marca y deja el 429 a cargo de quien la llama.
 *
 * El cuerpo del 429 es el mismo que arma el plugin en `app.ts`
 * (`statusCode`, `error`, `message`). Va DESPUÉS de la autenticación de la
 * ruta: la clave sale de `request.user.userId`.
 */
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from "fastify";

export interface PerUserLimit {
  readonly max: number;
  readonly timeWindow: string;
}

export function perUserRateLimit(
  fastify: FastifyInstance,
  limit: PerUserLimit,
  keyPrefix: string,
): preHandlerAsyncHookHandler {
  const check = fastify.createRateLimit({
    max: limit.max,
    timeWindow: limit.timeWindow,
    keyGenerator: (request: FastifyRequest) =>
      `${keyPrefix}:${request.user.userId}`,
  });

  return async function perUserRateLimitHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const result = await check(request);
    if (result.isAllowed || !result.isExceeded) return;
    return reply
      .code(429)
      .header("retry-after", result.ttlInSeconds)
      .send({
        statusCode: 429,
        error: "Demasiados intentos",
        message: `Demasiados intentos. Probá de nuevo en ${result.ttlInSeconds} segundos.`,
      });
  };
}
