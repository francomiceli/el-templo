import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const appWaitlist = mysqlTable("app_waitlist", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  moduloInteres: varchar("modulo_interes", { length: 255 }).notNull(),
  ciudadPais: varchar("ciudad_pais", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("new").notNull(),
});
