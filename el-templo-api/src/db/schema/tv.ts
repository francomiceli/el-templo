// Module: tv — phase 164 (pantalla TV de sucursal)
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Pantalla TV de sucursal — dispositivos, pairing y estado de clase.
 *
 * Fase 164. Un televisor por sede (o varios) muestra la planificacion viva del
 * bloque en curso, con timer por formato. El TV no tiene teclado: se vincula
 * con el flujo de device-code (RFC 8628) y despues consulta el estado por poll.
 *
 * Seguridad (T-164-03): de los dos secretos que maneja el modulo solo se
 * persiste el sha256 hex (varchar 64), nunca el plaintext — mismo patron
 * auditado en la fase 116 para `refresh_tokens`:
 *   - `tv_devices.token_hash`      -> token de dispositivo (larga vida)
 *   - `tv_pairings.device_code_hash` -> secreto que el TV retiene mientras
 *     espera que el staff reclame el pairing. NUNCA se muestra en pantalla:
 *     lo que se ve en el TV es `user_code`, que es publico por diseño.
 * El plaintext se emite una sola vez y se re-deriva por sha256 en cada lookup.
 *
 * Revocacion (D-03 / T-164-04): el token del dispositivo NO expira — por eso
 * `tv_devices` no lleva ninguna columna de expiracion. Se corta por fila con
 * `is_active = 0` + `revoked_at`, para que un TV robado o dado de baja pierda
 * acceso sin tocar a los demas televisores de la sede.
 *
 * Un unico estado por sede (D-04 / T-164-05): `uq_tv_class_state_branch` hace
 * que el invariante lo imponga la DB y no el codigo — N televisores de la misma
 * sucursal espejan exactamente la misma fila.
 */
export const tvDevices = mysqlTable(
  "tv_devices",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    // Solo sha256 hex del token opaco (T-164-03).
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 100 }),
    isActive: boolean("is_active").default(true).notNull(),
    // D-05: alimenta el "visto hace X" del panel de dispositivos.
    lastSeenAt: timestamp("last_seen_at"),
    // D-03: el token no expira, se revoca por fila.
    revokedAt: timestamp("revoked_at"),
    pairedBy: int("paired_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_tv_devices_branch").on(table.branchId)],
);

/**
 * Pairing de un televisor (patron device-code, RFC 8628).
 *
 * El TV genera el par (user_code publico / device_code secreto), muestra el
 * user_code en pantalla y hace poll. El staff reclama ese codigo desde el admin
 * eligiendo la sede (D-01: la sede la decide quien reclama, no el TV — por eso
 * `branch_id` es nullable hasta el claim). Recien cuando el TV vuelve con su
 * device_code se emite el token del dispositivo y se setea `device_id`.
 *
 * D-02: `user_code` no expira — queda fijo hasta que se use. Un TV colgado en
 * la pared puede quedar dias mostrando el codigo antes de que alguien lo vincule.
 */
export const tvPairings = mysqlTable("tv_pairings", {
  id: int("id").primaryKey().autoincrement(),
  // Mina M7: esta tabla es PRE-TENANT por diseno — la fila nace antes de que se sepa de quien es el televisor (branch_id nulo hasta el claim), asi que sus dos codigos quedan GLOBALES a proposito y para siempre (lista M8 aprobada), porque el claim tiene que resolverlos sin scope. La columna de abajo entra igual con DEFAULT 1, el claim la va a estampar con el scope del staff (CON-04) y la exencion `/* tenant-safe: pairing pre-claim */` del sentinel la agregan las fases 169/170.
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  // Publico: es lo que se ve en la pantalla del TV (D-02, no expira).
  userCode: varchar("user_code", { length: 6 }).notNull().unique(),
  // Secreto del TV — sha256 hex, nunca se muestra (T-164-03).
  deviceCodeHash: varchar("device_code_hash", { length: 64 })
    .notNull()
    .unique(),
  // D-01: la sede la elige el staff al reclamar, por eso nullable.
  branchId: int("branch_id").references(() => branches.id),
  deviceName: varchar("device_name", { length: 100 }),
  claimedAt: timestamp("claimed_at"),
  claimedBy: int("claimed_by").references(() => users.id),
  // Se setea recien cuando el TV retira su token (el plaintext se emite una
  // sola vez, en esa unica respuesta).
  deviceId: int("device_id").references(() => tvDevices.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Estado de clase por sede — la fuente de verdad que espejan los televisores.
 *
 * Pitfall 9 (precision de milisegundos): `timer_started_at` y `paused_at` son
 * declarados con precision fraccional 3 y son los PRIMEROS
 * timestamps con milisegundos del repo, y es intencional. El tiempo no viaja
 * por la red: el server manda el sello de arranque y cada TV calcula el
 * transcurrido contra su propio reloj corregido. Con `timestamp` a segundos
 * MySQL redondea y el timer puede arrancar hasta 1s adelantado — sobre un
 * tabata de 20s eso es 5% de error, visible a simple vista contra el profe.
 */
export const tvClassState = mysqlTable(
  "tv_class_state",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    // D-07 (expire-on-read): FECHA en la TZ de la sede, no un timestamp. Si la
    // fila quedo de ayer, el lector la trata como inexistente.
    //
    // `mode: "string"` (convencion del repo: subscriptions.start_date,
    // bookings.booking_date). Sin esto el driver devuelve un Date en la TZ del
    // proceso y compararlo contra la fecha de la SEDE obligaria a reformatearlo
    // — que es exactamente el bug que D-07 evita (Barcelona limpiando el estado
    // a la hora argentina). Es solo mapeo del driver: la columna SQL no cambia,
    // no hay migracion.
    classDate: date("class_date", { mode: "string" }).notNull(),
    // Pitfall 1: se guarda el ROL del bloque (INITIUM/NUCLEUS/...), nunca un
    // indice numerico — el roster de bloques cambia de largo entre niveles.
    blockRole: varchar("block_role", { length: 20 }).notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    exerciseIndex: int("exercise_index").default(0).notNull(),
    // D-08: "class" | "closing". Se deja varchar y NO un enum de MySQL a
    // proposito, para no pisar la trampa C-07 (el primer argumento del helper
    // de enum es el nombre fisico de la columna, y su lista de valores tiene
    // que coincidir byte a byte con el SQL de la migracion).
    screen: varchar("screen", { length: 10 }).default("class").notNull(),
    // "idle" | "running" | "paused" — mismo criterio varchar que `screen`.
    timerStatus: varchar("timer_status", { length: 10 })
      .default("idle")
      .notNull(),
    // Pitfall 9: fsp 3, primer uso en el repo (ver docblock de arriba).
    timerStartedAt: timestamp("timer_started_at", { fsp: 3 }),
    // D-17: pausa acumulativa — al reanudar se suma el tramo pausado en vez de
    // reescribir el sello de arranque.
    pausedAt: timestamp("paused_at", { fsp: 3 }),
    pausedAccumMs: int("paused_accum_ms").default(0).notNull(),
    // D-19: los beeps arrancan APAGADOS.
    soundEnabled: boolean("sound_enabled").default(false).notNull(),
    updatedBy: int("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  // D-04: un unico estado por sede que espejan N televisores.
  (table) => [uniqueIndex("uq_tv_class_state_branch").on(table.branchId)],
);

export const tvDevicesRelations = relations(tvDevices, ({ one }) => ({
  branch: one(branches, {
    fields: [tvDevices.branchId],
    references: [branches.id],
  }),
  pairedByUser: one(users, {
    fields: [tvDevices.pairedBy],
    references: [users.id],
  }),
}));

export const tvPairingsRelations = relations(tvPairings, ({ one }) => ({
  branch: one(branches, {
    fields: [tvPairings.branchId],
    references: [branches.id],
  }),
  claimedByUser: one(users, {
    fields: [tvPairings.claimedBy],
    references: [users.id],
  }),
  device: one(tvDevices, {
    fields: [tvPairings.deviceId],
    references: [tvDevices.id],
  }),
}));

export const tvClassStateRelations = relations(tvClassState, ({ one }) => ({
  branch: one(branches, {
    fields: [tvClassState.branchId],
    references: [branches.id],
  }),
  updatedByUser: one(users, {
    fields: [tvClassState.updatedBy],
    references: [users.id],
  }),
}));
