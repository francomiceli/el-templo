// Module: notifications — inbox-routes (fase 215, plan 14; D-17, D-18, D-19)
//
// La bandeja de avisos propia, para la app: lista paginada, contador de sin
// leer, marcar uno y marcar todo. Vive en el núcleo (sin `moduleScope`): funciona
// con el módulo de Aura apagado.
//
// Privacidad: ninguna ruta acepta un id de usuario. El `userId` sale SIEMPRE
// del token, así que es imposible leer o marcar los avisos de otra persona. Un
// id de aviso ajeno o inexistente responde 404 sin revelar cuál de las dos.
//
// Regalos (D-19): el aviso `aura_gift` trae quien dio (nombre de pila, inicial,
// foto firmada si es alumno). ME-01 y #38: si quien regaló HOY está oculto de las
// listas o no tiene nombre, el aviso no lo nombra: sin nombre, inicial ni foto, y
// el título y el cuerpo guardados se reemplazan por "Te dieron N de Aura" y el
// motivo (`anonymous: true`).
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import { NotFoundError } from "../shared/errors";
import { assertTenant } from "../shared/tenant";
import {
  ProfilePhotoStorageUnavailableError,
  resolveCommunityPhotos,
} from "../members/profile-photo-service";
import { giftPushText } from "../aura/gift-rules";
import { INBOX_GIFT_KIND, INBOX_PAGE_DEFAULT } from "./inbox-rules";
import { InboxService } from "./inbox-service";
import {
  inboxListSchema,
  inboxReadAllSchema,
  inboxReadSchema,
  inboxUnreadSchema,
  type InboxListQuery,
  type InboxReadParams,
} from "./inbox-schemas";

export const inboxMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const inbox = new InboxService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    await attachCountryScope(request, fastify.db);
  });

  // GET / — del más nuevo al más viejo; `before` es el `nextBefore` anterior.
  fastify.get<{ Querystring: InboxListQuery }>(
    "/",
    { schema: inboxListSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "notifications.inbox.list");
        const userId = request.user.userId;
        const page = await inbox.listForUser(ctx, userId, {
          before: request.query.before,
          limit: request.query.limit ?? INBOX_PAGE_DEFAULT,
        });

        const giftIds = page.rows.flatMap((row) =>
          row.kind === INBOX_GIFT_KIND && row.refId !== null ? [row.refId] : [],
        );
        const gifts = await inbox.giftInfoFor(ctx, userId, giftIds);

        // Foto solo para dadores alumno con nombre visible (el profe muestra el
        // círculo de la app; quien está oculto no se nombra ni se muestra).
        const photoUserIds = [...gifts.values()]
          .filter((gift) => gift.giverKind === "alumno" && !gift.anonymous)
          .map((gift) => gift.giverUserId);
        let photos = new Map<number, { url: string; photoId: number }>();
        if (photoUserIds.length > 0) {
          try {
            photos = await resolveCommunityPhotos(fastify, ctx, photoUserIds);
          } catch (err: unknown) {
            // Sin storage la bandeja igual se lee: el dador se ve sin foto.
            if (!(err instanceof ProfilePhotoStorageUnavailableError))
              throw err;
            request.log.warn(
              "Bandeja sin fotos de quien regaló: storage no disponible",
            );
          }
        }

        return {
          items: page.rows.map((row) => {
            const info =
              row.kind === INBOX_GIFT_KIND && row.refId !== null
                ? gifts.get(row.refId)
                : undefined;
            // ME-01: el texto guardado lleva el nombre de quien dio; si hoy no se
            // puede nombrar, se redacta de nuevo sin él.
            const anonymousText = info?.anonymous
              ? giftPushText({
                  giverKind: "alumno",
                  giverFirstName: null,
                  giverLastInitial: null,
                  reason: info.reason,
                  amount: info.amount,
                })
              : null;
            return {
              id: row.id,
              kind: row.kind,
              title: anonymousText?.title ?? row.title,
              body: anonymousText?.body ?? row.body,
              route: row.route,
              destination: row.destinationType,
              destinationSection: row.destinationSection,
              whatsappText: row.whatsappText,
              createdAt: row.shownAt.toISOString(),
              readAt: row.readAt ? row.readAt.toISOString() : null,
              gift: info
                ? {
                    amount: info.amount,
                    giverKind: info.giverKind,
                    anonymous: info.anonymous,
                    giverFirstName: (info.giverFirstName ?? "").trim(),
                    giverLastInitial: info.giverLastInitial,
                    giverPhotoUrl:
                      info.giverKind === "alumno" && !info.anonymous
                        ? (photos.get(info.giverUserId)?.url ?? null)
                        : null,
                    status: info.status,
                    voidCause: info.voidCause,
                  }
                : null,
            };
          }),
          nextBefore: page.nextBefore,
        };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "notifications.inbox.list");
      }
    },
  );

  // GET /unread-count — avisos visibles sin leer.
  fastify.get(
    "/unread-count",
    { schema: inboxUnreadSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "notifications.inbox.unread");
        const count = await inbox.unreadCount(ctx, request.user.userId);
        return { count };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "notifications.inbox.unread",
        );
      }
    },
  );

  // POST /read-all — va antes de `/:id/read` por claridad; no choca (otro path).
  fastify.post(
    "/read-all",
    { schema: inboxReadAllSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "notifications.inbox.readAll");
        await inbox.markAllRead(ctx, request.user.userId);
        return reply.code(204).send();
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "notifications.inbox.readAll",
        );
      }
    },
  );

  // POST /:id/read — 404 si el aviso no existe o es de otra persona.
  fastify.post<{ Params: InboxReadParams }>(
    "/:id/read",
    { schema: inboxReadSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "notifications.inbox.read");
        const found = await inbox.markRead(
          ctx,
          request.user.userId,
          request.params.id,
        );
        if (!found) throw new NotFoundError("Aviso no encontrado");
        return reply.code(204).send();
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "notifications.inbox.read");
      }
    },
  );
};
