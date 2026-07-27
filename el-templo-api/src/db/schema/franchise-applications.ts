import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const franchiseApplications = mysqlTable("franchise_applications", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  telefono: varchar("telefono", { length: 50 }).notNull(),
  ciudadPais: varchar("ciudad_pais", { length: 255 }).notNull(),
  modelo: varchar("modelo", { length: 50 }).notNull(),
  experiencia: varchar("experiencia", { length: 100 }).notNull(),
  capital: varchar("capital", { length: 100 }).notNull(),
  origen: varchar("origen", { length: 100 }).notNull(),
  mensaje: text("mensaje"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("new").notNull(),
  notes: text("notes"),
  aiStrategy: text("ai_strategy"),
  aiOutreach: text("ai_outreach"),
  aiFollowup: text("ai_followup"),
  aiNegotiation: text("ai_negotiation"),
});
