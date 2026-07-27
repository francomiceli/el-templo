import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const academyInquiries = mysqlTable("academy_inquiries", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  telefono: varchar("telefono", { length: 100 }).notNull(),
  ciudadPais: varchar("ciudad_pais", { length: 255 }).notNull(),
  nivelInteres: varchar("nivel_interes", { length: 100 }).notNull(),
  modalidad: varchar("modalidad", { length: 100 }).notNull(),
  experiencia: varchar("experiencia", { length: 100 }).notNull(),
  alumnoElTemplo: varchar("alumno_el_templo", { length: 50 }).notNull(),
  origen: varchar("origen", { length: 100 }).notNull(),
  mensaje: text("mensaje"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("new").notNull(),
});
