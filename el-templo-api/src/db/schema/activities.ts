// Module: activities
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { schedules } from "./schedules";
import { tenantIdColumn } from "./tenant-column";

export const activities = mysqlTable("activities", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  // D-05 (HOR-03): cupo por actividad. NULL = hereda branch.max_capacity.
  // Sin default ni notNull -- datos existentes quedan NULL (cero cambio de comportamiento).
  maxCapacity: int("max_capacity"),
  // Fase 161 (ACT-01, GATE-01, D-13): actividad especial gateada por el pase "Actividades
  // con Aura" (Verticales, Acrobacias, Open Gym). Default false → actividades existentes
  // NO son especiales y su reserva no cambia (cero cambio de comportamiento).
  isSpecial: boolean("is_special").default(false).notNull(),
  // Línea del pase especial (2026-09-29, yoga de Moreno): el pase solo habilita
  // las actividades especiales de SU línea. NULL = línea "Actividades con Aura"
  // (todas las especiales previas). Solo tiene sentido con isSpecial=true — el
  // servicio la limpia en las no-especiales. Mismo valor en
  // subscription_plans.special_line (ver scheduling/special-line.ts).
  specialLine: varchar("special_line", { length: 50 }),
  // Wellhub (2026-10-22, decisión de Franco): solo las actividades marcadas se
  // publican en Wellhub. Default false → opt-in explícito por actividad (en El
  // Templo, solo General: Técnica y Combos son rutas dentro de General).
  // Las especiales quedan afuera aunque estén marcadas (ver wellhub/sync-service.ts).
  wellhubEnabled: boolean("wellhub_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const activitiesRelations = relations(activities, ({ many }) => ({
  schedules: many(schedules),
}));
