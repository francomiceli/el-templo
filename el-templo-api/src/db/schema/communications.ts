// Module: communications — Fase 193 (Comunicaciones). Modelo de datos de
// avisos (pop-ups/tarjetas, de sistema o libres), eventos por socio, y avisos
// de TV. D-11..D-15, D-24, D-25 de 193-CONTEXT.md.
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  date,
  json,
  mysqlEnum,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

// mysqlEnum 1er-arg = nombre físico de la columna (regla 6 del skill
// el-templo-db-migrations): tiene que coincidir byte a byte con la migración.
export const avisoKindEnum = mysqlEnum("kind", ["system", "custom"]);
export const avisoPlacementEnum = mysqlEnum("placement", ["popup", "tarjeta"]);
export const avisoDestinationTypeEnum = mysqlEnum("destination_type", [
  "app_section",
  "whatsapp_sales",
]);
export const avisoFrequencyTypeEnum = mysqlEnum("frequency_type", [
  "once",
  "every_n_days",
  "every_open",
]);
export const avisoStatusEnum = mysqlEnum("status", [
  "draft",
  "active",
  "paused",
]);
export const avisoEventTypeEnum = mysqlEnum("event_type", [
  "shown",
  "dismissed",
  "clicked",
]);
export const tvAvisoModeEnum = mysqlEnum("mode", [
  "manual",
  "flex_inicio",
  "flex_final",
]);

/**
 * `avisos` — entidad única de pop-ups y tarjetas del carrusel de Mi Templo,
 * de sistema (calificación, propuesta de mejora, vencimiento, tarjetas fijas)
 * o custom (creados libremente por el admin). Gym-owned desde el día uno
 * (mismo criterio que `referral_partners`, D-20 de la fase 179): nace con
 * `tenantIdColumn()`.
 *
 * `kind='system'` usa `code` (ej. `rating_prompt`) para que el service layer
 * lo resuelva por clave estable en vez de por id — igual que
 * `notification_templates.template_key`. `kind='custom'` deja `code` NULL:
 * MySQL permite N filas con `code` NULL bajo la misma unique compuesta.
 *
 * `startsOn`/`endsOn` con `mode: "string"` por el mismo motivo que
 * `tv_class_state.class_date` (fase 164, D-07): son un día calendario en la
 * TZ de la sede, no un instante — sin `mode: "string"` el driver devolvería
 * un `Date` en la TZ del proceso y compararlo contra la vigencia de la sede
 * reintroduciría el mismo bug que ese `mode: "string"` evita.
 */
export const avisos = mysqlTable(
  "avisos",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    kind: avisoKindEnum.notNull().default("custom"),
    // Solo se usa cuando kind='system' (ej. "rating_prompt"). NULL en custom.
    code: varchar("code", { length: 60 }),
    placement: avisoPlacementEnum.notNull().default("popup"),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    buttonText: varchar("button_text", { length: 60 }).notNull(),
    destinationType: avisoDestinationTypeEnum
      .notNull()
      .default("app_section"),
    destinationSection: varchar("destination_section", { length: 40 }),
    whatsappText: varchar("whatsapp_text", { length: 300 }),
    frequencyType: avisoFrequencyTypeEnum.notNull().default("every_n_days"),
    frequencyDays: int("frequency_days"),
    status: avisoStatusEnum.notNull().default("draft"),
    // D-14: vigencia opcional. mode:"string" — ver docblock de arriba.
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    // D-13: alcance. Vacío/NULL = todos.
    scopeBranchIds: json("scope_branch_ids").$type<number[]>(),
    scopeCountries: json("scope_countries").$type<string[]>(),
    scopeSegments: json("scope_segments").$type<string[]>(),
    // D-15(b): orden entre tarjetas libres.
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // Compuesta por tenant (mismo criterio que
    // uq_notification_templates_tenant_key): dos gimnasios pueden tener el
    // mismo `code` de sistema, y MySQL permite N filas con `code` NULL bajo
    // esta misma unique (los avisos custom nunca colisionan entre sí).
    uniqueIndex("uq_avisos_tenant_code").on(table.tenantId, table.code),
    index("idx_avisos_tenant_placement_status").on(
      table.tenantId,
      table.placement,
      table.status,
    ),
  ],
);

/**
 * `aviso_events` — un evento por (aviso, socio, tipo). D-11: alimenta la
 * frecuencia por socio (una vez / cada N días / cada apertura, leyendo
 * `lastAt` del evento `shown`) y las métricas de D-17 (el conteo de socios
 * ÚNICOS alcanzados/cerraron/tocaron el botón es un `COUNT(*)` sobre la
 * unique `(aviso_id, user_id, event_type)`, no un contador acumulativo como
 * `notification_templates.sent_count`).
 */
export const avisoEvents = mysqlTable(
  "aviso_events",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    avisoId: int("aviso_id")
      .references(() => avisos.id)
      .notNull(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    eventType: avisoEventTypeEnum.notNull(),
    eventCount: int("event_count").notNull().default(1),
    firstAt: timestamp("first_at").defaultNow().notNull(),
    lastAt: timestamp("last_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_aviso_events_aviso_user_type").on(
      table.avisoId,
      table.userId,
      table.eventType,
    ),
    index("idx_aviso_events_user").on(table.userId),
  ],
);

/**
 * `tv_avisos` — entidad aparte de los avisos de app (D-24): título+cuerpo,
 * sedes (NULL o `[]` = todas), activo/inactivo manual (sin fechas, a
 * diferencia de `avisos`), y modo (manual | reemplaza flexibilidad inicial |
 * reemplaza flexibilidad final). `tv_class_state.tv_aviso_id` referencia la
 * fila que se está mostrando cuando `screen = 'aviso'` (D-25).
 */
export const tvAvisos = mysqlTable(
  "tv_avisos",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    title: varchar("title", { length: 120 }).notNull(),
    body: text("body").notNull(),
    mode: tvAvisoModeEnum.notNull().default("manual"),
    isActive: boolean("is_active").notNull().default(false),
    scopeBranchIds: json("scope_branch_ids").$type<number[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_tv_avisos_tenant_active").on(table.tenantId, table.isActive),
  ],
);

export const avisoEventsRelations = relations(avisoEvents, ({ one }) => ({
  aviso: one(avisos, {
    fields: [avisoEvents.avisoId],
    references: [avisos.id],
  }),
  user: one(users, {
    fields: [avisoEvents.userId],
    references: [users.id],
  }),
}));
