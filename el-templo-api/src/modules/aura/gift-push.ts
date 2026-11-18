// Module: aura — push del regalo de Aura al que recibe (fase 215, plan 15)
//
// Se llama DESPUÉS de que la transacción del regalo terminó bien: si la
// transacción revierte, no puede quedar una push de un regalo que no existe
// (T-215-15-02). Un error al encolar solo se loguea, nunca revierte el regalo
// ni su Aura (T-215-15-03).
//
// - D-17: el que recibe se entera con una push.
// - D-19: título "Sofía M. te dio Aura" / "Tu profe Fran te dio Aura" y cuerpo
//   "Motivo: Buena energía." (texto de `giftPushText`; sin monto ni apellido).
// - D-22: ningún texto promete privacidad que no se pueda garantizar.
// - #38: si quien regala (alumno) no tiene nombre cargado, la push no lo nombra
//   ni dice "Alguien": "Te dieron 1 de Aura" y "Motivo: Buena energía.". El profe
//   sin nombre sigue siendo "Tu profe te dio Aura".
//
// Categoría: `motivacion` (decisión autónoma, ver 215-DECISIONES-AUTONOMAS.md).
// Hallazgo: esa categoría no tiene interruptor en Perfil, así que hoy nadie la
// apaga desde la app. Si alguien la tuviera apagada, `queueAdHocNotification`
// no encola ni guarda en la bandeja, y el regalo y su Aura quedan igual.
//
// Con dispositivo, la fila de la cola lleva `inboxKind` e `inboxRefId` y la
// bandeja la guarda al enviarla. Sin dispositivo, la bandeja la guarda directo
// con la clave `a:aura_gift:<id del regalo>`: un reintento no duplica.

import type { FastifyBaseLogger } from "fastify";
import { INBOX_GIFT_KIND } from "../notifications/inbox-rules";
import type { NotificationService } from "../notifications/service";
import type { TenantContext } from "../shared/tenant";
import {
  GIFT_ROUTE,
  giftPushText,
  type GiftGiverKind,
  type GiftReason,
} from "./gift-rules";

export interface GiftNotificationInput {
  giftId: number;
  receiverUserId: number;
  giverKind: GiftGiverKind;
  giverFirstName: string | null;
  giverLastInitial: string | null;
  reason: GiftReason;
  /** Puntos del regalo, para el texto sin nombre ("Te dieron N de Aura"). */
  amount: number;
}

/**
 * Encola la push (y la entrada de la bandeja) del regalo. Nunca lanza: ante
 * cualquier error loguea un `warn` con el id del regalo, sin nombres.
 */
export async function queueGiftNotification(
  notifications: NotificationService,
  ctx: TenantContext,
  input: GiftNotificationInput,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const { title, body } = giftPushText({
      giverKind: input.giverKind,
      giverFirstName: input.giverFirstName,
      giverLastInitial: input.giverLastInitial,
      reason: input.reason,
      amount: input.amount,
    });
    await notifications.queueAdHocNotification(
      {
        userId: input.receiverUserId,
        title,
        body,
        category: "motivacion",
        route: GIFT_ROUTE,
        inboxKind: INBOX_GIFT_KIND,
        inboxRefId: input.giftId,
      },
      ctx,
    );
  } catch (err: unknown) {
    log.warn(
      { giftId: input.giftId, err: err instanceof Error ? err.message : err },
      "No se pudo encolar la push del regalo de Aura",
    );
  }
}
