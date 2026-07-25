/**
 * Autenticacion del televisor por device token (fase 164).
 *
 * El TV no es un usuario: no tiene JWT, no tiene `request.scope` y no puede
 * acceder a NADA fuera de su sede. Presenta un token opaco en
 * `Authorization: Device <token>` y este hook lo resuelve a `{ id, branchId }`.
 *
 * D-03 — el token NO expira. Eso es aceptable solo porque la revocacion es por
 * fila (`tv_devices.is_active = 0` + `revoked_at`): un TV robado, revendido o
 * dado de baja pierde acceso desde el panel sin tocar a los demas televisores de
 * la sede (T-164-11). El `is_active` se chequea en CADA request, no al vincular.
 *
 * 401 y no 403 a proposito: el kiosco interpreta el 401 como "me revocaron" y
 * vuelve solo a la pantalla de pairing. Un 403 lo dejaria colgado mostrando un
 * error que nadie va a ver en la sede.
 *
 * El token nunca se loguea (T-164-14): solo se persiste y se compara su sha256.
 */

import type { FastifyRequest, onRequestHookHandler } from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import * as schema from "../../db/schema";

/** Dispositivo autenticado. Sin datos de socio: el TV solo conoce su sede. */
export interface TvDeviceContext {
  id: number;
  branchId: number;
}

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Poblado por el hook `makeDeviceAuth` en las rutas de `/api/tv` que van
     * autenticadas por dispositivo. Mismo criterio que `request.scope`: se
     * declara no-opcional porque todo consumidor corre despues del hook.
     */
    tvDevice: TvDeviceContext;
  }
}

const UNAUTHORIZED = {
  error: "Dispositivo no vinculado",
  message: "Este televisor no está vinculado o fue revocado",
};

/** Extrae el token de `Authorization: Device <token>`. */
function readDeviceToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;
  const prefix = "Device ";
  if (!header.startsWith(prefix)) return null;
  const token = header.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Fabrica del hook `onRequest` que autentica al televisor.
 *
 * Se aplica SOLO sobre las rutas de device; `/api/tv/pair/*` queda deliberadamente
 * fuera (el TV todavia no tiene token cuando se esta vinculando).
 */
export function makeDeviceAuth(
  db: MySql2Database<typeof schema>,
): onRequestHookHandler {
  return async function deviceAuth(request, reply) {
    const token = readDeviceToken(request);
    if (token === null) {
      return reply.code(401).send(UNAUTHORIZED);
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [device] = await db
      .select({
        id: schema.tvDevices.id,
        branchId: schema.tvDevices.branchId,
      })
      .from(schema.tvDevices)
      .where(
        and(
          eq(schema.tvDevices.tokenHash, tokenHash),
          eq(schema.tvDevices.isActive, true),
        ),
      )
      .limit(1);

    if (!device) {
      // Sin el token ni su hash en el log. `warn` y no `error`: un TV revocado
      // sigue polleando cada 3 s hasta que alguien lo apaga.
      request.log.warn("TV device auth: token invalido o dispositivo revocado");
      return reply.code(401).send(UNAUTHORIZED);
    }

    request.tvDevice = { id: device.id, branchId: device.branchId };

    // D-05: "visto hace X" en el panel de dispositivos. Fire-and-forget a
    // proposito — el poll del TV corre cada pocos segundos y no tiene por que
    // pagar el round-trip del UPDATE para responder. Si falla, el peor caso es
    // un `last_seen_at` viejo, nunca un TV sin pantalla.
    void db
      .update(schema.tvDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.tvDevices.id, device.id))
      .catch((err: unknown) => {
        request.log.warn(
          { err },
          "TV device auth: no se pudo sellar last_seen_at",
        );
      });
  };
}
