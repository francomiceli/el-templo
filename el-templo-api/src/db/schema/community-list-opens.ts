// Module: scheduling (fase 214, registro de aperturas de la lista de anotados)
//
// Tabla gym-owned que nace strict (módulo `scheduling`): una fila por alumno,
// horario y fecha de clase.
import {
  mysqlTable,
  int,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { schedules } from "./schedules";
import { tenantIdColumn } from "./tenant-column";

/**
 * `community_list_opens` — cuántos alumnos abren la lista de anotados (plan de
 * lanzamiento de la Comunidad: medir en la semana 1, 2 y 4).
 *
 * - Una fila por `(tenant_id, user_id, schedule_id, session_date)`
 *   (`uq_community_list_opens_tenant_user_slot`). Cada 200 de
 *   `GET /api/members/scheduling/slots/:scheduleId/:date/attendees` suma 1 a
 *   `open_count` y mueve `last_opened_at` (ver `scheduling/list-opens.ts`). Se
 *   cuenta toda respuesta 200, sin importar si el que mira ve la lista o solo el
 *   total.
 * - `session_date` es la fecha local de la clase (igual que `bookings` y
 *   `attendance`). `first_opened_at` / `last_opened_at` son TIMESTAMP en UTC.
 * - `user_id` y `schedule_id` llevan ON DELETE CASCADE: la fila se va con la
 *   cuenta (como `aura_gifts` y `member_photos`) y no frena el borrado de un
 *   horario (`SchedulingService.deleteSchedule`).
 */
export const communityListOpens = mysqlTable(
  "community_list_opens",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    scheduleId: int("schedule_id")
      .references(() => schedules.id, { onDelete: "cascade" })
      .notNull(),
    // Fecha local de la clase.
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    openCount: int("open_count").notNull().default(1),
    firstOpenedAt: timestamp("first_opened_at").defaultNow().notNull(),
    lastOpenedAt: timestamp("last_opened_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_community_list_opens_tenant_user_slot").on(
      table.tenantId,
      table.userId,
      table.scheduleId,
      table.sessionDate,
    ),
    // Cortes por semana de los reportes (por la fecha local de la clase).
    index("idx_community_list_opens_tenant_date").on(
      table.tenantId,
      table.sessionDate,
    ),
  ],
);

export type CommunityListOpenRow = typeof communityListOpens.$inferSelect;
export type NewCommunityListOpenRow = typeof communityListOpens.$inferInsert;
