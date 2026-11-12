// Module: sessions (fase 213, estiramiento post-clase)
//
// Dos tablas gym-owned que nacen strict (módulo `stretch`):
//   - stretch_catalog: la lista curada de ejercicios de estiramiento (D-02).
//   - stretch_offers: una fila por alumno y día = la oferta (D-15).
import {
  mysqlTable,
  int,
  varchar,
  tinyint,
  date,
  json,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { exercises } from "./exercises";
import { branches } from "./branches";
import { attendance } from "./attendance";
import { tenantIdColumn } from "./tenant-column";

export type StretchFamily = "LS" | "MN" | "FL" | "TTB" | "TS";

/** Brazo del experimento del push (D-16). */
export type StretchArm = "control" | "push_30" | "push_60";

/**
 * Dosis de un estiramiento: la de la plani del dia o la base (20 s si es ISO,
 * 10 repeticiones si no). `max` es el tope del rango, o null si es un valor
 * unico.
 */
export interface StretchOfferDose {
  unit: "seconds" | "reps";
  value: number;
  max: number | null;
}

/** Un ejercicio de la rutina congelada en la oferta (con su dosis). */
export interface StretchOfferExercise {
  exerciseId: number;
  name: string;
  family: StretchFamily;
  dose: StretchOfferDose;
}

/**
 * `stretch_catalog` — lista curada de estiramientos (D-02).
 *
 * - Se corrige por migración cambiando datos, no por código.
 * - `exerciseName`: nombre canónico. `exercises` tiene varias filas por nombre
 *   y el video se resuelve por nombre, por eso la regla compara por nombre.
 * - `family`: `LS` | `MN` | `FL` | `TTB` | `TS`. varchar y no enum a propósito.
 * - `sortOrder`: orden dentro de la familia.
 * - `sides`: 1 o 2 (los de 2 lados se hacen una vez por lado).
 * - `baseOrder`: NULL = no es de la lista de base. 1..5 = posición en la lista
 *   de base, que tiene orden propio.
 */
export const stretchCatalog = mysqlTable(
  "stretch_catalog",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    exerciseId: int("exercise_id")
      .references(() => exercises.id)
      .notNull(),
    exerciseName: varchar("exercise_name", { length: 150 }).notNull(),
    family: varchar("family", { length: 10 }).$type<StretchFamily>().notNull(),
    sortOrder: int("sort_order").notNull(),
    sides: tinyint("sides").notNull(),
    baseOrder: int("base_order"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_stretch_catalog_tenant_exercise").on(
      table.tenantId,
      table.exerciseId,
    ),
    index("idx_stretch_catalog_tenant_family").on(
      table.tenantId,
      table.family,
      table.sortOrder,
    ),
  ],
);

/**
 * `stretch_offers` — una fila por alumno y día (D-15, D-16).
 *
 * La fila ES la oferta: sirve de dedupe del push, de embudo y de registro del
 * completado. Quién escribe cada columna:
 * - Al ofrecer: `localDate`, `attendanceId`, `branchId`, `sourceDayId`,
 *   `classEndAt` (UTC), `exercises` (rutina congelada), `plannedSeconds`, `arm`.
 * - Push: `pushDecision`, `pushQueuedAt`, `pendingNotificationId` (sin FK: la
 *   cola se purga a 24 h), `pushSentAt`, `pushOpenedAt`.
 * - App: `cardSeenAt`, `startedAt` (ULTIMO ingreso al player), `startedFrom`
 *   (`card` | `push`, el del primer ingreso).
 * - Al terminar: `completedAt`, `durationSeconds`, `exercisesCompleted`
 *   (índices de la rutina congelada), `auraAwarded`.
 * - UNIQUE (tenant_id, user_id, local_date): tenant primero.
 */
export const stretchOffers = mysqlTable(
  "stretch_offers",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // Día de la sede (YYYY-MM-DD).
    localDate: date("local_date", { mode: "string" }).notNull(),
    attendanceId: int("attendance_id").references(() => attendance.id, {
      onDelete: "set null",
    }),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    sourceDayId: varchar("source_day_id", { length: 40 }).notNull(),
    // Instante UTC del fin de clase.
    classEndAt: timestamp("class_end_at").notNull(),
    exercises: json("exercises").$type<StretchOfferExercise[]>().notNull(),
    plannedSeconds: int("planned_seconds").notNull(),
    arm: varchar("arm", { length: 10 }).$type<StretchArm>().notNull(),
    cardSeenAt: timestamp("card_seen_at"),
    pushDecision: varchar("push_decision", { length: 30 }),
    pushQueuedAt: timestamp("push_queued_at"),
    // Sin FK: la cola de pendientes se purga a las 24 h.
    pendingNotificationId: int("pending_notification_id"),
    pushSentAt: timestamp("push_sent_at"),
    pushOpenedAt: timestamp("push_opened_at"),
    startedAt: timestamp("started_at"),
    startedFrom: varchar("started_from", { length: 10 }),
    completedAt: timestamp("completed_at"),
    durationSeconds: int("duration_seconds"),
    exercisesCompleted: json("exercises_completed").$type<number[]>(),
    auraAwarded: boolean("aura_awarded").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_stretch_offers_tenant_user_date").on(
      table.tenantId,
      table.userId,
      table.localDate,
    ),
    index("idx_stretch_offers_tenant_date").on(table.tenantId, table.localDate),
    index("idx_stretch_offers_tenant_user_queued").on(
      table.tenantId,
      table.userId,
      table.pushQueuedAt,
    ),
  ],
);

export type StretchCatalogRow = typeof stretchCatalog.$inferSelect;
export type StretchOfferRow = typeof stretchOffers.$inferSelect;
export type NewStretchOfferRow = typeof stretchOffers.$inferInsert;
