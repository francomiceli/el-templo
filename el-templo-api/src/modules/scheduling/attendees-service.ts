// Module: scheduling (fase 214, anotados)
//
// Quien esta anotado en un horario y fecha (D-01 a D-09), con las reglas de
// privacidad y visibilidad resueltas en el servidor:
//
// - D-01..D-04: lista en orden de reserva (`bookedAt`, luego `bookings.id`),
//   solo reservas vigentes no-trial. Cada fila trae nombre de pila, inicial del
//   apellido (`LEFT(last_name, 1)` en SQL: el apellido completo nunca se
//   selecciona), foto y Aura ganada.
// - D-05..D-07, D-11, D-47: quien se oculta (o es menor / de sede fuera de AR
//   sin haberse activado) no genera fila: solo cuenta en `total` y en
//   `hiddenCount`. La reciprocidad la da `listAccess`.
// - D-09: el alumno sin plan en vigor (`activeMemberExists`, nunca
//   `users.status`) o que se oculto ve solo el total. El staff siempre ve la
//   lista.
// - D-43: foto propia aprobada o espejo de la ficha, siempre firmada y sin ids
//   (`resolveCommunityPhotos`).
// - D-52 (ajuste de Franco 2026-11-17): la lista NO etiqueta a nadie. Staff y
//   Wellhub aparecen como cualquiera; el rol solo se usa para decidir si QUIEN
//   MIRA es staff, nunca para la salida ni para los puntos.
// - D-65: `aura` es la Aura ganada si es mayor que 0 y `null` si es 0 o si
//   `templo-gamification` esta apagado.
// - D-44: sin interruptor de encendido.
// - D-68: las cuentas borradas no cuentan en ningun numero.
//
// Solo se puede pedir un horario que quien mira ve en su grilla: activo, de una
// sede activa, no virtual y del mismo pais que su sede. Cualquier otro caso es
// un 404 indistinguible. Ventana de fechas: hoy..hoy+31 (dia local de la sede).

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { earnedAuraByUsers } from "../aura/earned";
import { resolveCommunityPhotos } from "../members/profile-photo-service";
import {
  addDays,
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../shared/date-utils";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { isModuleEnabled } from "../shared/module-flags";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  effectiveVisible,
  listAccess,
  type ListAccessReason,
} from "./community-visibility";
import { getViewerCommunityState } from "./community-service";
import { countSlotBookings } from "./service";

/** Dias hacia adelante que se puede consultar (hoy incluido). */
const MAX_DAYS_AHEAD = 31;

/** Fila de salida: exactamente estos campos, nada que distinga a nadie. */
export interface SlotAttendee {
  firstName: string;
  lastInitial: string | null;
  photoUrl: string | null;
  photoId: number | null;
  aura: number | null;
  isMe: boolean;
}

export interface SlotAttendeesView {
  total: number;
  canSeeList: boolean;
  reason: ListAccessReason;
  attendees: SlotAttendee[];
  hiddenCount: number;
  viewer: { visible: boolean; noticeSeen: boolean };
}

export class AttendeesService {
  constructor(private readonly fastify: FastifyInstance) {}

  async getSlotAttendees(
    ctx: TenantContext,
    viewerUserId: number,
    scheduleId: number,
    date: string,
  ): Promise<SlotAttendeesView> {
    const db = this.fastify.db;

    // Quien mira primero: hace falta su pais para el alcance del horario.
    const state = await getViewerCommunityState(db, ctx, viewerUserId);

    // Horario activo de una sede activa, no virtual.
    const [slot] = await db
      .select({
        country: schema.branches.country,
        timezone: schema.branches.timezone,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.schedules.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.schedules, ctx),
          eq(schema.schedules.id, scheduleId),
          eq(schema.schedules.isActive, true),
          eq(schema.branches.isActive, true),
          eq(schema.branches.isVirtual, false),
        ),
      )
      .limit(1);

    if (!slot || slot.country !== state.branchCountry) {
      throw new NotFoundError("No encontrado");
    }

    const today = todayInTz(slot.timezone ?? DEFAULT_TENANT_TIMEZONE);
    if (date < today || date > addDays(today, MAX_DAYS_AHEAD)) {
      throw new BadRequestError("Fecha fuera de rango");
    }

    const total = await countSlotBookings(db, ctx, scheduleId, date);

    const access = listAccess({
      isStaff: state.isStaff,
      hasPlanInEffect: state.hasPlanInEffect,
      viewerVisible: state.visible,
    });
    const viewer = { visible: state.visible, noticeSeen: state.noticeSeen };

    if (!access.canSeeList) {
      return {
        total,
        canSeeList: false,
        reason: access.reason,
        attendees: [],
        hiddenCount: 0,
        viewer,
      };
    }

    // Una sola consulta: reservas vigentes no-trial de cuentas no borradas.
    // Solo se seleccionan los campos que la salida necesita (el apellido
    // completo, el telefono, el email, el rol y el origen no se leen).
    const rows = await db
      .select({
        userId: schema.users.id,
        firstName: schema.users.firstName,
        lastInitial: sql<string | null>`LEFT(${schema.users.lastName}, 1)`,
        dateOfBirth: schema.users.dateOfBirth,
        branchCountry: schema.branches.country,
        preference: schema.memberProfiles.communityVisible,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.bookings.memberId),
        ),
      )
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.users.branchId),
        ),
      )
      .leftJoin(
        schema.memberProfiles,
        and(
          tenantWhere(schema.memberProfiles, ctx),
          eq(schema.memberProfiles.userId, schema.users.id),
        ),
      )
      .where(
        and(
          tenantWhere(schema.bookings, ctx),
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
          eq(schema.bookings.isTrial, false),
          inArray(schema.bookings.status, [
            "reservado",
            "qr_escaneado",
            "confirmado",
          ]),
          sql`${schema.users.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(schema.bookings.bookedAt), asc(schema.bookings.id));

    // Los ocultos no generan fila (T-214-17-05).
    const shown = rows.filter((row) =>
      effectiveVisible({
        preference: row.preference ?? null,
        dateOfBirth: row.dateOfBirth,
        branchCountry: row.branchCountry,
        todayLocal: today,
      }),
    );
    const shownIds = shown.map((row) => row.userId);

    const gamification = await isModuleEnabled(
      ctx.tenantId,
      "templo-gamification",
      db,
    );
    const [photos, earned] = await Promise.all([
      resolveCommunityPhotos(this.fastify, ctx, shownIds),
      gamification
        ? earnedAuraByUsers(db, ctx, shownIds)
        : Promise.resolve(new Map<number, number>()),
    ]);

    const attendees: SlotAttendee[] = shown.map((row) => {
      const photo = photos.get(row.userId);
      const points = earned.get(row.userId) ?? 0;
      return {
        firstName: row.firstName ?? "",
        lastInitial: row.lastInitial || null,
        photoUrl: photo?.url ?? null,
        photoId: photo?.photoId ?? null,
        aura: gamification && points > 0 ? points : null,
        isMe: row.userId === viewerUserId,
      };
    });

    return {
      total,
      canSeeList: true,
      reason: "ok",
      attendees,
      hiddenCount: Math.max(0, total - attendees.length),
      viewer,
    };
  }
}
