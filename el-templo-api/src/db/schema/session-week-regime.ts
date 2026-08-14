import {
  mysqlTable,
  int,
  varchar,
  json,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

// Fase 159 (SEM-05, D-18): ancla histórica semana→régimen. El histórico de
// `sessions` dice 'regular' en días que en realidad fueron combos/técnica (el
// coach lo hackeaba sobre 'regular') — ese régimen NO es derivable del
// `session_mode` histórico, hay que persistirlo como metadata separada, SIN
// tocar ni una fila de `sessions`. Una fila por (week, day) etiquetado, no una
// por sesión.
//
// Declaración propia del enum de día (no se reusa el `dayEnum` exportado de
// weekly-rotator.ts): los builders de columna de Drizzle son objetos mutables
// y compartir la misma instancia entre dos `mysqlTable` distintas arriesga que
// una tabla pise el `.notNull()` de la otra. Mismo nombre físico de columna
// (`day`) y mismos 6 valores — ver weekly-rotator.ts:5 (M6: el primer arg de
// mysqlEnum es el nombre físico de la columna).
const dayEnum = mysqlEnum("day", [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
]);

export const sessionWeekRegime = mysqlTable(
  "session_week_regime",
  {
    id: int("id").primaryKey().autoincrement(),
    // Es la PRIMERA tabla gym-owned que nace con tenant_id desde el inicio
    // (no vino de un ALTER de la tanda C). Ver src/db/schema/tenant-column.ts.
    tenantId: tenantIdColumn(),
    week: int("week").notNull(),
    day: dayEnum.notNull(),
    // 'combos' | 'tecnica' | 'regular' | 'rom' — mismo largo que
    // sessions.session_mode (varchar(10), sin enum de MySQL: ver
    // sessions.ts). Sin CHECK constraint a propósito, mismo motivo que ahí.
    inferredMode: varchar("inferred_mode", { length: 10 }).notNull(),
    // 'signature' (detectado por firma del discovery) | 'generator' (lo
    // escribió el generador nuevo al correr /generate) | 'manual' (relevado a
    // mano, p. ej. por SSH contra prod).
    source: varchar("source", { length: 20 }).notNull(),
    // Porcentaje 0-100 de confianza de la detección por firma. NULL cuando
    // source='manual' (no hay score, es un dato relevado a mano).
    confidence: int("confidence"),
    // Evidencia cruda de la detección (conteos de formato, reps, etc.) para
    // poder auditar el retro-etiquetado sin volver a correr el detector.
    evidence: json("evidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Unicidad POR TENANT: un régimen por (semana, día) por gimnasio.
    // tenant_id PRIMERO, mismo estilo que la migración 0196 (CON-01).
    uniqueIndex("uq_session_week_regime_tenant_week_day").on(
      table.tenantId,
      table.week,
      table.day,
    ),
  ],
);
