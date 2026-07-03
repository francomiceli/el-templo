// Module: coach-ratings
//
// Phase 143 (PROF-DATA): append-only event log of post-class ratings. One row
// per member rating one in-person class. Mirrors attendance.ts exactly (an
// append log, no UNIQUE on the natural key — re-rating is guarded at the
// service layer via the one-shot check, not at the DB level, D-P2).
//
// `coachId` is the attributed coach resolved from the weekly roster
// (class_coach_assignments) at submit time. `stars` is the PROFE rating 1–5
// (D-M1) and backs the owner per-coach average (/puntuaciones). `classStars`
// is the CLASS rating 1–5, added later to split the single rating into two
// explicit dimensions — it is nullable because historical rows predate the
// split (their `stars` is kept as the profe history; classStars stays null).
// The class rating backs the "Clases" analytics tab. `comment` is optional
// free text (D-M2), surfaced only in /puntuaciones. Indexes back the owner
// per-coach average (D-O1) and the member+session one-shot guard (D-P2).
import {
  mysqlTable,
  int,
  tinyint,
  varchar,
  date,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { schedules } from "./schedules";

export const coachRatings = mysqlTable(
  "coach_ratings",
  {
    id: int("id").primaryKey().autoincrement(),
    coachId: int("coach_id")
      .references(() => users.id)
      .notNull(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    scheduleId: int("schedule_id").references(() => schedules.id), // nullable: resolves activity/day
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    stars: tinyint("stars").notNull(), // profe rating 1–5 (D-M1)
    classStars: tinyint("class_stars"), // class rating 1–5; nullable for pre-split rows
    comment: varchar("comment", { length: 500 }), // optional free text (D-M2)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_coach_ratings_coach").on(table.coachId),
    index("idx_coach_ratings_member_session").on(
      table.memberId,
      table.sessionDate,
    ),
  ],
);

export const coachRatingsRelations = relations(coachRatings, ({ one }) => ({
  coach: one(users, {
    fields: [coachRatings.coachId],
    references: [users.id],
    relationName: "coachRatingsCoach",
  }),
  member: one(users, {
    fields: [coachRatings.memberId],
    references: [users.id],
    relationName: "coachRatingsMember",
  }),
  branch: one(branches, {
    fields: [coachRatings.branchId],
    references: [branches.id],
  }),
  schedule: one(schedules, {
    fields: [coachRatings.scheduleId],
    references: [schedules.id],
  }),
}));
