import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  boolean,
  date,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";

export const roleEnum = mysqlEnum("role", [
  "member",
  "coach",
  "admin",
  "superadmin",
]);
export const levelEnum = mysqlEnum("level", [
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
]);
export const genderEnum = mysqlEnum("gender", ["male", "female", "other"]);

export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: roleEnum.default("member").notNull(),
  branchId: int("branch_id")
    .references(() => branches.id)
    .notNull(),
  level: levelEnum.default("alfa").notNull(),
  phone: varchar("phone", { length: 30 }),
  dni: varchar("dni", { length: 20 }).unique(),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  gender: genderEnum,
  emergencyContactName: varchar("emergency_contact_name", { length: 150 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 30 }),
  emergencyContactRelationship: varchar("emergency_contact_relationship", {
    length: 50,
  }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
}));
