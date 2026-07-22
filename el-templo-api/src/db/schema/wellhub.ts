// Module: wellhub — integración Wellhub (ex Gympass), migración 0186.
//
// Mapeos de identidad entre nuestro dominio y la plataforma Wellhub:
//   - wellhub_classes: (branch, activity) → class de la Booking API.
//   - wellhub_slots: (schedule, fecha) → slot publicado. Nuestro modelo no
//     materializa la "sesión del día" (las clases son plantillas semanales),
//     así que esta tabla ES la materialización de lo publicado en Wellhub.
//   - wellhub_bookings: booking_number de Wellhub → booking nuestro. Existe
//     aunque la solicitud se rechace (bookingId NULL) para auditar rechazos.
//   - wellhub_events: log de webhooks entrantes + llave de idempotencia.
//     El evento checkin no trae event_id — se sintetiza uno determinístico
//     (checkin:{unique_token}:{timestamp}) para deduplicar reintentos.
import {
  mysqlTable,
  int,
  bigint,
  varchar,
  date,
  timestamp,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { activities } from "./activities";
import { schedules } from "./schedules";
import { bookings } from "./bookings";

export const wellhubClasses = mysqlTable(
  "wellhub_classes",
  {
    id: int("id").primaryKey().autoincrement(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    activityId: int("activity_id")
      .references(() => activities.id)
      .notNull(),
    // Identificadores del lado Wellhub. product_id sale de
    // GET /setup/v1/gyms/{gym_id}/products y es requerido al crear la class.
    wellhubClassId: bigint("wellhub_class_id", { mode: "number" }).notNull(),
    wellhubProductId: bigint("wellhub_product_id", {
      mode: "number",
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_wellhub_classes_branch_activity").on(
      table.branchId,
      table.activityId,
    ),
    uniqueIndex("idx_wellhub_classes_class_id").on(table.wellhubClassId),
  ],
);

export const wellhubSlots = mysqlTable(
  "wellhub_slots",
  {
    id: int("id").primaryKey().autoincrement(),
    wellhubClassRowId: int("wellhub_class_row_id")
      .references(() => wellhubClasses.id)
      .notNull(),
    scheduleId: int("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    wellhubSlotId: bigint("wellhub_slot_id", { mode: "number" }).notNull(),
    // Último estado empujado a Wellhub (para diffear y evitar PATCHes de más).
    totalCapacity: int("total_capacity").notNull(),
    totalBooked: int("total_booked").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_wellhub_slots_schedule_date").on(
      table.scheduleId,
      table.sessionDate,
    ),
    uniqueIndex("idx_wellhub_slots_slot_id").on(table.wellhubSlotId),
    index("idx_wellhub_slots_session_date").on(table.sessionDate),
  ],
);

export const wellhubBookings = mysqlTable(
  "wellhub_bookings",
  {
    id: int("id").primaryKey().autoincrement(),
    bookingNumber: varchar("booking_number", { length: 32 }).notNull(),
    // NULL cuando la solicitud fue rechazada (sin booking nuestro) o si el
    // booking se borró. ON DELETE SET NULL para no romper el audit trail.
    bookingId: int("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    wellhubSlotRowId: int("wellhub_slot_row_id")
      .references(() => wellhubSlots.id)
      .notNull(),
    // confirmed | rejected | canceled | late_canceled
    status: varchar("status", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_wellhub_bookings_number").on(table.bookingNumber),
    index("idx_wellhub_bookings_user").on(table.userId),
  ],
);

export const wellhubEvents = mysqlTable(
  "wellhub_events",
  {
    id: int("id").primaryKey().autoincrement(),
    // event_id del webhook, o sintetizado para checkin. Único = idempotencia:
    // un reintento del mismo evento se ignora sin reprocesar.
    eventId: varchar("event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    payload: text("payload").notNull(),
    // processed | error | skipped
    status: varchar("status", { length: 16 }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_wellhub_events_event_id").on(table.eventId),
    index("idx_wellhub_events_created_at").on(table.createdAt),
  ],
);

export const wellhubClassesRelations = relations(wellhubClasses, ({ one }) => ({
  branch: one(branches, {
    fields: [wellhubClasses.branchId],
    references: [branches.id],
  }),
  activity: one(activities, {
    fields: [wellhubClasses.activityId],
    references: [activities.id],
  }),
}));

export const wellhubSlotsRelations = relations(wellhubSlots, ({ one }) => ({
  wellhubClass: one(wellhubClasses, {
    fields: [wellhubSlots.wellhubClassRowId],
    references: [wellhubClasses.id],
  }),
  schedule: one(schedules, {
    fields: [wellhubSlots.scheduleId],
    references: [schedules.id],
  }),
}));

export const wellhubBookingsRelations = relations(
  wellhubBookings,
  ({ one }) => ({
    booking: one(bookings, {
      fields: [wellhubBookings.bookingId],
      references: [bookings.id],
    }),
    user: one(users, {
      fields: [wellhubBookings.userId],
      references: [users.id],
    }),
    slot: one(wellhubSlots, {
      fields: [wellhubBookings.wellhubSlotRowId],
      references: [wellhubSlots.id],
    }),
  }),
);
