// Module: members (fase 214, foto propia)
//
// Tabla gym-owned que nace strict (módulo `members`): una fila por foto que se
// muestra en la comunidad (D-30, D-31, D-43).
import {
  mysqlTable,
  int,
  varchar,
  json,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/** `alumno` = la sube el alumno. `ficha` = la que el staff subió a la ficha. */
export type MemberPhotoOrigin = "alumno" | "ficha";

/** Motivo que elige el staff al rechazar (D-69). */
export type PhotoRejectionReason =
  | "sin_cara"
  | "no_es_propia"
  | "contenido"
  | "otro";

/**
 * `member_photos` — fotos propias mostradas en la comunidad.
 *
 * Invariante: como mucho una `pendiente` y una `aprobada` por persona y origen.
 * La foto mostrada es la `aprobada` de origen `alumno` y, si no hay, la de
 * origen `ficha`. La impone el servicio con `SELECT ... FOR UPDATE`, sin
 * UNIQUE para no sumar una entrada a `TENANT_UNIQUE_ALLOWLIST`.
 *
 * Estados (`member_photo_status`):
 * - `pendiente`: subida por el alumno, esperando revisión.
 * - `aprobada`: visible. Las de origen `ficha` nacen así al copiarse.
 * - `rechazada`: el staff la rechazó (con `rejectionReason`).
 * - `quitada`: retirada (por el alumno o por reportes).
 * - `reemplazada`: el alumno subió otra y esta dejó de valer.
 * - `fallida`: la copia de la foto de ficha falló (no se reintenta).
 *
 * - `sourceUrl`: la `users.photo_url` copiada (origen `ficha`), para detectar
 *   si el staff la cambió.
 * - `rulesAcceptedAt`: aceptó las normas antes de subir (D-50). NULL en `ficha`.
 * - `reporterIds` / `reportCount`: un reporte por persona y foto (el largo del
 *   arreglo es el conteo).
 */
export const memberPhotos = mysqlTable(
  "member_photos",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    // varchar y no enum a propósito (trampa del primer argumento de mysqlEnum).
    origin: varchar("photo_origin", { length: 10 })
      .$type<MemberPhotoOrigin>()
      .default("alumno")
      .notNull(),
    sourceUrl: varchar("source_url", { length: 512 }),
    status: mysqlEnum("member_photo_status", [
      "pendiente",
      "aprobada",
      "rechazada",
      "quitada",
      "reemplazada",
      "fallida",
    ])
      .default("pendiente")
      .notNull(),
    rulesAcceptedAt: timestamp("rules_accepted_at"),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: int("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectionReason: varchar("rejection_reason", {
      length: 20,
    }).$type<PhotoRejectionReason>(),
    reportCount: int("report_count").default(0).notNull(),
    reporterIds: json("reporter_ids").$type<number[]>(),
    lastReportedAt: timestamp("last_reported_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_member_photos_tenant_status_uploaded").on(
      table.tenantId,
      table.status,
      table.uploadedAt,
    ),
    index("idx_member_photos_tenant_user_status").on(
      table.tenantId,
      table.userId,
      table.status,
    ),
  ],
);

export type MemberPhotoStatus = (typeof memberPhotos.status.enumValues)[number];
export type MemberPhotoRow = typeof memberPhotos.$inferSelect;
export type NewMemberPhotoRow = typeof memberPhotos.$inferInsert;
