import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";

export const labsInquiries = mysqlTable("labs_inquiries", {
  id: int("id").primaryKey().autoincrement(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  telefono: varchar("telefono", { length: 100 }).notNull(),
  nombreGimnasio: varchar("nombre_gimnasio", { length: 255 }).notNull(),
  ciudadPais: varchar("ciudad_pais", { length: 255 }).notNull(),
  cantidadSocios: varchar("cantidad_socios", { length: 50 }).notNull(),
  sistemaActual: varchar("sistema_actual", { length: 100 }).notNull(),
  mensaje: text("mensaje"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("new").notNull(),
});
