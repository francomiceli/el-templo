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
//
// `getDayAttendees` (2026-11-20, D-59 revisada: caras en la fila de la
// Reservas) sirve las primeras caras de TODOS los horarios de una sede en un
// dia, en lote. Reusa las mismas reglas que la lista de un horario: mismas
// funciones (`assertSlotScope`, `loadSlotBookers`, `visibleBookers`) y mismo
// orden. NO registra la apertura de la lista (`recordListOpen` es la metrica de
// "abrio la lista completa"): esto es solo la vista previa de la fila.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { MySql2Database } from "drizzle-orm/mysql2";
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
import {
  getViewerCommunityState,
  type ViewerCommunityState,
} from "./community-service";
import { countSlotBookings, countSlotBookingsBySchedule } from "./service";

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

/** Cuantas caras se muestran por horario en la fila de la Reservas. */
export const DAY_FACES_LIMIT = 4;

/** Cara de la fila del dia: lo minimo para dibujar el circulo. */
export interface DayFace {
  firstName: string;
  lastInitial: string | null;
  photoUrl: string | null;
  isMe: boolean;
}

export interface DayAttendeesView {
  canSeeFaces: boolean;
  slots: Array<{ scheduleId: number; total: number; faces: DayFace[] }>;
}

/** Pais y zona de la sede de un horario / de la sede pedida. */
interface SlotScope {
  country: string;
  timezone: string | null;
}

/**
 * Alcance comun: la sede tiene que ser del mismo pais que quien mira (404
 * indistinguible si no) y la fecha cae en hoy..hoy+31 en el dia local de la
 * sede (400). Devuelve "hoy" en la zona de la sede.
 */
function assertSlotScope(
  scope: SlotScope | undefined,
  viewerCountry: string,
  date: string,
): string {
  if (!scope || scope.country !== viewerCountry) {
    throw new NotFoundError("No encontrado");
  }
  const today = todayInTz(scope.timezone ?? DEFAULT_TENANT_TIMEZONE);
  if (date < today || date > addDays(today, MAX_DAYS_AHEAD)) {
    throw new BadRequestError("Fecha fuera de rango");
  }
  return today;
}

/** Quien mira puede ver la lista: staff, o alumno con plan en vigor y visible. */
function viewerAccess(state: ViewerCommunityState) {
  return listAccess({
    isStaff: state.isStaff,
    hasPlanInEffect: state.hasPlanInEffect,
    viewerVisible: state.visible,
  });
}

/**
 * Reservas vigentes no-trial de cuentas no borradas de uno o varios horarios en
 * una fecha, en el orden de la lista (D-01: `bookedAt`, luego `bookings.id`).
 * Solo se seleccionan los campos que la salida necesita (el apellido completo,
 * el telefono, el email, el rol y el origen no se leen).
 */
async function loadSlotBookers(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  scheduleIds: readonly number[],
  date: string,
) {
  if (scheduleIds.length === 0) return [];
  return db
    .select({
      scheduleId: schema.bookings.scheduleId,
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
        inArray(schema.bookings.scheduleId, [...scheduleIds]),
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
}

type SlotBooker = Awaited<ReturnType<typeof loadSlotBookers>>[number];

/** Los ocultos no generan fila (T-214-17-05). Conserva el orden. */
function visibleBookers(rows: SlotBooker[], today: string): SlotBooker[] {
  return rows.filter((row) =>
    effectiveVisible({
      preference: row.preference ?? null,
      dateOfBirth: row.dateOfBirth,
      branchCountry: row.branchCountry,
      todayLocal: today,
    }),
  );
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

    const today = assertSlotScope(slot, state.branchCountry, date);

    const total = await countSlotBookings(db, ctx, scheduleId, date);

    const access = viewerAccess(state);
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
    const rows = await loadSlotBookers(db, ctx, [scheduleId], date);
    const shown = visibleBookers(rows, today);
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

  /**
   * Primeras caras de los anotados de TODOS los horarios de una sede en un dia
   * (fila de la Reservas). En lote: una consulta de totales, una de reservas
   * (solo si quien mira puede ver caras), el tope de `DAY_FACES_LIMIT` por
   * horario ANTES de resolver fotos, y una sola resolucion de fotos para la
   * union. Mismas reglas de acceso, visibilidad, orden y alcance que
   * `getSlotAttendees`. Sin permiso para ver caras: solo totales y `faces`
   * vacio. Un horario sin reservas no va en la lista.
   */
  async getDayAttendees(
    ctx: TenantContext,
    viewerUserId: number,
    branchId: number | undefined,
    date: string,
  ): Promise<DayAttendeesView> {
    const db = this.fastify.db;

    const state = await getViewerCommunityState(db, ctx, viewerUserId);
    // Sin `branchId` se usa la sede del propio alumno (igual que la grilla).
    const targetBranchId = branchId ?? state.branchId;

    // Sede activa y no virtual (el mismo criterio que el horario de un slot).
    const [branch] = await db
      .select({
        country: schema.branches.country,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, targetBranchId),
          eq(schema.branches.isActive, true),
          eq(schema.branches.isVirtual, false),
        ),
      )
      .limit(1);
    const today = assertSlotScope(branch, state.branchCountry, date);

    const schedules = await db
      .select({ id: schema.schedules.id })
      .from(schema.schedules)
      .where(
        and(
          tenantWhere(schema.schedules, ctx),
          eq(schema.schedules.branchId, targetBranchId),
          eq(schema.schedules.isActive, true),
        ),
      );
    const scheduleIds = schedules.map((row) => row.id);

    const totals = await countSlotBookingsBySchedule(
      db,
      ctx,
      scheduleIds,
      date,
    );
    const access = viewerAccess(state);
    const withTotals = (faces: Map<number, DayFace[]>) =>
      [...totals.entries()]
        .sort(([a], [b]) => a - b)
        .map(([scheduleId, total]) => ({
          scheduleId,
          total,
          faces: faces.get(scheduleId) ?? [],
        }));

    if (!access.canSeeList || totals.size === 0) {
      return {
        canSeeFaces: access.canSeeList,
        slots: withTotals(new Map()),
      };
    }

    const rows = await loadSlotBookers(db, ctx, [...totals.keys()], date);
    const shown = visibleBookers(rows, today);

    // Tope por horario ANTES de pedir fotos; el orden global ya es el de la lista.
    const perSlot = new Map<number, SlotBooker[]>();
    for (const row of shown) {
      const list = perSlot.get(row.scheduleId) ?? [];
      if (list.length < DAY_FACES_LIMIT) {
        list.push(row);
        perSlot.set(row.scheduleId, list);
      }
    }
    const photos = await resolveCommunityPhotos(
      this.fastify,
      ctx,
      [...perSlot.values()].flat().map((row) => row.userId),
    );

    const faces = new Map<number, DayFace[]>();
    for (const [scheduleId, list] of perSlot) {
      faces.set(
        scheduleId,
        list.map((row) => ({
          firstName: row.firstName ?? "",
          lastInitial: row.lastInitial || null,
          photoUrl: photos.get(row.userId)?.url ?? null,
          isMe: row.userId === viewerUserId,
        })),
      );
    }
    return { canSeeFaces: true, slots: withTotals(faces) };
  }
}
