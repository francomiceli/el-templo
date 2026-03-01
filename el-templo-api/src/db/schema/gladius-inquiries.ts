import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";

export const gladiusInquiries = mysqlTable("gladius_inquiries", {
  id: int("id").primaryKey().autoincrement(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  productoInteres: varchar("producto_interes", { length: 255 }).notNull(),
  mensaje: text("mensaje"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("new").notNull(),
});
