// Module: branches
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const branches = mysqlTable("branches", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  timezone: varchar("timezone", { length: 50 })
    .default("America/Argentina/Buenos_Aires")
    .notNull(),
  country: varchar("country", { length: 2 }).default("AR").notNull(),
  // D-24: street address for the trial-campaign email (D-13) + general reuse.
  // Nullable; existing rows backfilled by migration 0132 from the canonical
  // sede addresses in el-templo-web/data/sedes.ts.
  address: varchar("address", { length: 255 }),
  maxCapacity: int("max_capacity").default(22).notNull(),
  romEnabled: boolean("rom_enabled").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isVirtual: boolean("is_virtual").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
}));
