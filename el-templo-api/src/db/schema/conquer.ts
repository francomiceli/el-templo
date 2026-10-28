// Module: conquer — Fase 201 (Conquer v2)
import {
  mysqlTable,
  int,
  smallint,
  tinyint,
  varchar,
  timestamp,
  date,
  datetime,
  json,
  boolean,
  decimal,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Fase 201 (Conquer v2): modelo de datos de la síntesis §9, definido por el
 * planner. `position` 0 = peldaño más difícil (como el oráculo y §8.1).
 *
 * Las 4 tablas de catálogo (`conquer_ladders`, `conquer_rungs`,
 * `conquer_exercises`, `conquer_template_days`) las siembra la migración 0292
 * y NO se limpian en tests. Las 6 de estado del alumno sí.
 *
 * Plan 201-25: la migración 0293 alinea el catálogo con el anexo de Nacho
 * (una escalera por ejercicio, escalera de hold aparte, marca de brazos
 * rectos y tablas de arranque por nivel en el ejercicio).
 *
 * Todas son gym-owned y nacen strict (tenant_id NOT NULL DEFAULT 1 + FK).
 * Todo UNIQUE empieza por `tenantId`.
 */

// ── Tipos de dominio ────────────────────────────────────────────────

export const CONQUER_LEVELS = ["ternero", "novillo", "toro"] as const;
export type ConquerLevel = (typeof CONQUER_LEVELS)[number];

export const CONQUER_STEP_KEYS = ["e1", "e2", "e3", "hold"] as const;
export type ConquerStepKey = (typeof CONQUER_STEP_KEYS)[number];

export const CONQUER_MODES = ["completa", "negativa", "hold"] as const;
export type ConquerMode = (typeof CONQUER_MODES)[number];

export const CONQUER_UNITS = ["reps", "s"] as const;
export type ConquerUnit = (typeof CONQUER_UNITS)[number];

// Fase 201 D-26 (0298): estados de una corrección con video.
export const CONQUER_CORRECTION_STATUSES = ["pendiente", "respondida"] as const;
export type ConquerCorrectionStatus =
  (typeof CONQUER_CORRECTION_STATUSES)[number];

/** Músculo trabajado por un ejercicio (zona anatómica + rol). */
export interface ConquerMuscle {
  zone: string;
  role: "principal" | "secundario";
}

/** Escalón de arranque de un ejercicio (tabla de Toro, §8.2). `rung` = code del peldaño. */
export interface ConquerStartStep {
  step: ConquerStepKey;
  rung: string;
  mode: ConquerMode;
}

/** Estado de combos de Toro: por clave de combo, peldaño actual y desde cuándo. */
export type ConquerComboState = Record<
  string,
  { rungId: number; since: string }
>;

// ── Catálogo ────────────────────────────────────────────────────────

export const conquerLadders = mysqlTable(
  "conquer_ladders",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_ladders_tenant_code").on(
      table.tenantId,
      table.code,
    ),
  ],
);

export const conquerRungs = mysqlTable(
  "conquer_rungs",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    ladderId: int("ladder_id")
      .references(() => conquerLadders.id)
      .notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    // 0 = peldaño más difícil
    position: smallint("position").notNull(),
    // 0293 (DA-4): SIN USO. La marca de brazos rectos vive ahora en
    // `conquer_exercises.brazos_rectos`. Se conserva porque la 0292 la siembra.
    brazosRectos: boolean("brazos_rectos").default(false).notNull(),
    unilateral: boolean("unilateral").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_rungs_tenant_ladder_code").on(
      table.tenantId,
      table.ladderId,
      table.code,
    ),
    uniqueIndex("uq_conquer_rungs_tenant_ladder_position").on(
      table.tenantId,
      table.ladderId,
      table.position,
    ),
  ],
);

export const conquerExercises = mysqlTable(
  "conquer_exercises",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    ladderId: int("ladder_id")
      .references(() => conquerLadders.id)
      .notNull(),
    unit: mysqlEnum("unit", CONQUER_UNITS).notNull(),
    muscles: json("muscles").$type<ConquerMuscle[]>().notNull(),
    // Tabla de arranque de Toro. Novillo y Ternero tienen la suya (0293, DA-5).
    startSteps: json("start_steps").$type<ConquerStartStep[]>().notNull(),
    // 0293 (DA-3): escalera propia del hold final. NULL = el hold usa `ladderId`.
    holdLadderId: int("hold_ladder_id").references(() => conquerLadders.id),
    // 0293 (DA-4): la marca de brazos rectos vive en el ejercicio (anexo §1).
    brazosRectos: boolean("brazos_rectos").default(false).notNull(),
    // 0293 (DA-5): tablas explícitas del anexo §3. NULL = usa la de Toro.
    startStepsNovillo: json("start_steps_novillo").$type<ConquerStartStep[]>(),
    startStepsTernero: json("start_steps_ternero").$type<ConquerStartStep[]>(),
    sortOrder: int("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_exercises_tenant_code").on(
      table.tenantId,
      table.code,
    ),
  ],
);

export const conquerTemplateDays = mysqlTable(
  "conquer_template_days",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    daysCount: tinyint("days_count").notNull(),
    dayKey: varchar("day_key", { length: 20 }).notNull(),
    label: varchar("label", { length: 40 }).notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
    finisherText: varchar("finisher_text", { length: 200 }).notNull(),
    // 3 codes de conquer_exercises
    exerciseCodes: json("exercise_codes").$type<string[]>().notNull(),
    openingComboKey: varchar("opening_combo_key", { length: 20 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_template_days_tenant_days_key").on(
      table.tenantId,
      table.daysCount,
      table.dayKey,
    ),
  ],
);

// ── Estado del alumno ───────────────────────────────────────────────

export const conquerMembers = mysqlTable(
  "conquer_members",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: mysqlEnum("status", ["pedido", "activo"]).notNull(),
    requestedAt: datetime("requested_at"),
    level: mysqlEnum("level", CONQUER_LEVELS),
    daysCount: tinyint("days_count"),
    // D-08: guardado igual para abrir a los coach después
    coachUserId: int("coach_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    incReps: tinyint("inc_reps").default(1).notNull(),
    incS: tinyint("inc_s").default(2).notNull(),
    activatedAt: datetime("activated_at"),
    activatedBy: int("activated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    activationDate: date("activation_date", { mode: "string" }),
    levelSince: date("level_since", { mode: "string" }),
    cutStage: tinyint("cut_stage").default(0).notNull(),
    comboState: json("combo_state").$type<ConquerComboState>(),
    day0SkippedAt: datetime("day0_skipped_at"),
    publishEnabled: boolean("publish_enabled").default(false).notNull(),
    publishNoFace: boolean("publish_no_face").default(false).notNull(),
    publishChangedAt: datetime("publish_changed_at"),
    // Fase 201 DA-21: cuándo vio la guía "¿Cómo funciona?" (la PRIMERA vez; NULL = no la vio).
    guideSeenAt: datetime("guide_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_members_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
    index("idx_conquer_members_tenant_status").on(table.tenantId, table.status),
  ],
);

export const conquerSteps = mysqlTable(
  "conquer_steps",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    memberId: int("member_id")
      .references(() => conquerMembers.id, { onDelete: "cascade" })
      .notNull(),
    exerciseId: int("exercise_id")
      .references(() => conquerExercises.id)
      .notNull(),
    step: mysqlEnum("step", CONQUER_STEP_KEYS).notNull(),
    rungId: int("rung_id")
      .references(() => conquerRungs.id)
      .notNull(),
    mode: mysqlEnum("mode", CONQUER_MODES).notNull(),
    sinceDate: date("since_date", { mode: "string" }),
    calibration: mysqlEnum("calibration", ["pendiente", "resuelta"])
      .default("pendiente")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_steps_tenant_member_exercise_step").on(
      table.tenantId,
      table.memberId,
      table.exerciseId,
      table.step,
    ),
  ],
);

export const conquerSessions = mysqlTable(
  "conquer_sessions",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    dayKey: varchar("day_key", { length: 20 }).notNull(),
    pain: tinyint("pain").default(0).notNull(),
    comboRungId: int("combo_rung_id").references(() => conquerRungs.id),
    comboSeries: tinyint("combo_series"),
    comboTarget: tinyint("combo_target"),
    pushRungId: int("push_rung_id").references(() => conquerRungs.id),
    pushSeries: tinyint("push_series"),
    pushTarget: tinyint("push_target"),
    pullRungId: int("pull_rung_id").references(() => conquerRungs.id),
    pullSeries: tinyint("pull_series"),
    pullTarget: tinyint("pull_target"),
    savedAt: datetime("saved_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_sessions_tenant_user_date_day").on(
      table.tenantId,
      table.userId,
      table.sessionDate,
      table.dayKey,
    ),
    index("idx_conquer_sessions_tenant_user_date").on(
      table.tenantId,
      table.userId,
      table.sessionDate,
    ),
  ],
);

export const conquerSessionSteps = mysqlTable(
  "conquer_session_steps",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    sessionId: int("session_id")
      .references(() => conquerSessions.id, { onDelete: "cascade" })
      .notNull(),
    exerciseId: int("exercise_id")
      .references(() => conquerExercises.id)
      .notNull(),
    step: mysqlEnum("step", CONQUER_STEP_KEYS).notNull(),
    value: smallint("value").notNull(),
    prevTarget: smallint("prev_target"),
    // Snapshot del peldaño y modo al momento de guardar
    rungId: int("rung_id")
      .references(() => conquerRungs.id)
      .notNull(),
    mode: mysqlEnum("mode", CONQUER_MODES).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_session_steps_tenant_session_exercise_step").on(
      table.tenantId,
      table.sessionId,
      table.exerciseId,
      table.step,
    ),
  ],
);

export const conquerAlerts = mysqlTable(
  "conquer_alerts",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: mysqlEnum("type", [
      "molestia",
      "caida",
      "tope_escalera",
      "paso_nivel",
    ]).notNull(),
    detail: json("detail").$type<Record<string, unknown>>().notNull(),
    dedupeKey: varchar("dedupe_key", { length: 120 }).notNull(),
    status: mysqlEnum("status", ["abierta", "vista", "resuelta"])
      .default("abierta")
      .notNull(),
    resolvedBy: int("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: datetime("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_alerts_tenant_user_type_dedupe").on(
      table.tenantId,
      table.userId,
      table.type,
      table.dedupeKey,
    ),
    index("idx_conquer_alerts_tenant_status").on(table.tenantId, table.status),
  ],
);

export const conquerBodyChecks = mysqlTable(
  "conquer_body_checks",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    checkDate: date("check_date", { mode: "string" }).notNull(),
    kind: mysqlEnum("kind", ["dia0", "periodico"]).notNull(),
    photoFrontKey: varchar("photo_front_key", { length: 255 }),
    photoSideKey: varchar("photo_side_key", { length: 255 }),
    photoBackKey: varchar("photo_back_key", { length: 255 }),
    armCm: decimal("arm_cm", { precision: 5, scale: 1 }),
    chestCm: decimal("chest_cm", { precision: 5, scale: 1 }),
    shouldersCm: decimal("shoulders_cm", { precision: 5, scale: 1 }),
    waistCm: decimal("waist_cm", { precision: 5, scale: 1 }),
    weightKg: decimal("weight_kg", { precision: 5, scale: 1 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_body_checks_tenant_user_date").on(
      table.tenantId,
      table.userId,
      table.checkDate,
    ),
  ],
);

/**
 * Fase 201 D-26 (0298): correcciones con video. El alumno manda un video de
 * hasta 30 s de un escalón o de un combo y el coach responde con texto y/o
 * video. Las claves de video apuntan al bucket R2 PRIVADO (prefijo
 * `private/conquer-corrections/`, DA-38) y nunca se loguean.
 *
 * El objetivo es un escalón (`exercise_id` + `step`) o un combo (`combo_key`),
 * nunca los dos (DA-41): lo valida el servicio. Ninguna migración la siembra.
 */
export const conquerCorrections = mysqlTable(
  "conquer_corrections",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // DA-41: objetivo escalón (ejercicio + escalón) o combo, uno u otro.
    exerciseId: int("exercise_id").references(() => conquerExercises.id),
    step: mysqlEnum("step", CONQUER_STEP_KEYS),
    comboKey: varchar("combo_key", { length: 16 }),
    // DA-41: peldaño del escalón en el momento de enviar (los combos van sin).
    rungId: int("rung_id").references(() => conquerRungs.id, {
      onDelete: "set null",
    }),
    comment: varchar("comment", { length: 500 }),
    // DA-45: NULL cuando el alumno borró el video (video_deleted_*).
    videoKey: varchar("video_key", { length: 255 }),
    videoSeconds: smallint("video_seconds").notNull(),
    videoDeletedAt: datetime("video_deleted_at"),
    videoDeletedBy: int("video_deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: mysqlEnum("status", CONQUER_CORRECTION_STATUSES)
      .default("pendiente")
      .notNull(),
    // DA-43: una sola respuesta, final. Texto, video o ambos.
    replyText: varchar("reply_text", { length: 1000 }),
    replyVideoKey: varchar("reply_video_key", { length: 255 }),
    replyVideoSeconds: smallint("reply_video_seconds"),
    repliedBy: int("replied_by").references(() => users.id, {
      onDelete: "set null",
    }),
    repliedAt: datetime("replied_at"),
    // DA-46: NULL = el alumno todavía no vio la respuesta (contador de Inicio).
    replySeenAt: datetime("reply_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // T-201-119: una clave de video no se usa dos veces (MySQL admite varios NULL).
    uniqueIndex("uq_conquer_corrections_tenant_video_key").on(
      table.tenantId,
      table.videoKey,
    ),
    index("idx_conquer_corrections_tenant_status").on(
      table.tenantId,
      table.status,
      table.createdAt,
    ),
    index("idx_conquer_corrections_tenant_user").on(
      table.tenantId,
      table.userId,
      table.status,
    ),
  ],
);

/**
 * Fase 201 D-25 (0299): tutoriales en video, uno por ejercicio o por combo.
 * La clave apunta al bucket PÚBLICO (`conquer/tutorials/...`, DA-48). Ninguna
 * migración la siembra: los sube el coach desde el admin.
 */
export const conquerTutorials = mysqlTable(
  "conquer_tutorials",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    exerciseId: int("exercise_id").references(() => conquerExercises.id, {
      onDelete: "cascade",
    }),
    // DA-48: un combo (push, pull...) tiene su tutorial aparte del ejercicio.
    comboKey: varchar("combo_key", { length: 16 }),
    videoKey: varchar("video_key", { length: 255 }).notNull(),
    uploadedBy: int("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_conquer_tutorials_tenant_exercise").on(
      table.tenantId,
      table.exerciseId,
    ),
    uniqueIndex("uq_conquer_tutorials_tenant_combo").on(
      table.tenantId,
      table.comboKey,
    ),
  ],
);

// ── Tipos de fila ───────────────────────────────────────────────────

export type ConquerLadderRow = typeof conquerLadders.$inferSelect;
export type ConquerRungRow = typeof conquerRungs.$inferSelect;
export type ConquerExerciseRow = typeof conquerExercises.$inferSelect;
export type ConquerTemplateDayRow = typeof conquerTemplateDays.$inferSelect;
export type ConquerMemberRow = typeof conquerMembers.$inferSelect;
export type ConquerStepRow = typeof conquerSteps.$inferSelect;
export type ConquerSessionRow = typeof conquerSessions.$inferSelect;
export type ConquerSessionStepRow = typeof conquerSessionSteps.$inferSelect;
export type ConquerAlertRow = typeof conquerAlerts.$inferSelect;
export type ConquerBodyCheckRow = typeof conquerBodyChecks.$inferSelect;
export type ConquerCorrectionRow = typeof conquerCorrections.$inferSelect;
export type ConquerTutorialRow = typeof conquerTutorials.$inferSelect;
