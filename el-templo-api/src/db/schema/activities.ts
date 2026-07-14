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

export const activities = mysqlTable("activities", {
  id: int("id").primaryKey().autoincrement(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const activitiesRelations = relations(activities, ({ many }) => ({
  schedules: many(schedules),
}));
