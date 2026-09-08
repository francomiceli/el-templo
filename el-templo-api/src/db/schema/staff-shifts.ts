// Module: staff-shifts — check-in / check-out de la jornada laboral (2026-09-07)
import {
  mysqlTable,
  int,
  date,
  timestamp,
  json,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Jornada laboral de un miembro del staff (coach/recepcion/gestion/admin/owner).
 *
 * El flujo escanea el mismo QR fisico de sede que usan los socios para
 * check-in (`src/modules/shared/qr-token.ts`), tanto para abrir como para
 * cerrar la jornada. Al cerrar, el staff completa un checklist fijo
 * (`checklist.ts`) que se persiste como snapshot en `checklist` — no hay
 * tabla aparte de items: son 3 booleanos fijos, y guardar el JSON evita un
 * join para leer algo que no cambia entre jornadas.
 *
 * `checked_out_at IS NULL` es la jornada abierta de un usuario: el
 * indice `idx_staff_shifts_tenant_user_open` la resuelve sin table scan. Solo
 * puede haber una jornada abierta por usuario a la vez, impuesto por el
 * SERVICE (chequeo antes de insertar), no por una unique — una unique sobre
 * `checked_out_at` no funciona en MySQL para "a lo sumo un NULL", asi que la
 * concurrencia rara (doble click) se resuelve igual que el resto del repo:
 * el service la valida bajo la misma conexion antes de escribir.
 */
export const staffShifts = mysqlTable(
  "staff_shifts",
  {
    id: int("id").primaryKey().autoincrement(),
    // Tenancy: valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    // Dia de la jornada en la TZ de la sede (todayInTz), no la fecha del
    // servidor -- mismo criterio que tv_class_state.class_date.
    shiftDate: date("shift_date", { mode: "string" }).notNull(),
    checkedInAt: timestamp("checked_in_at").notNull(),
    checkedOutAt: timestamp("checked_out_at"),
    checklist: json("checklist").$type<{
      cobros: boolean;
      espacio: boolean;
      /** Lote del posnet: solo mié/sáb. null = no aplicaba ese día. */
      lote: boolean | null;
    }>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_staff_shifts_tenant_user_open").on(
      table.tenantId,
      table.userId,
      table.checkedOutAt,
    ),
    index("idx_staff_shifts_tenant_branch_date").on(
      table.tenantId,
      table.branchId,
      table.shiftDate,
    ),
  ],
);

export const staffShiftsRelations = relations(staffShifts, ({ one }) => ({
  user: one(users, {
    fields: [staffShifts.userId],
    references: [users.id],
  }),
  branch: one(branches, {
    fields: [staffShifts.branchId],
    references: [branches.id],
  }),
}));
