/**
 * Fase 204 (D-18/D-27) — ÚNICA definición de "esto es Wellhub, no del plan del
 * socio". NO escribir otra copia: todo sitio que deba excluir (o aislar)
 * reservas y visitas Wellhub para que NO descuenten clases, NO consuman el
 * límite semanal ni bloqueen la visita propia del socio usa estos helpers.
 *
 * Una reserva o visita Wellhub de un socio activo nunca toca su plan (D-18).
 *
 * `bookings.source` es NULLABLE: las filas viejas tienen NULL y significan
 * "reserva propia/legacy". Por eso el predicado negativo es
 * `(source IS NULL OR source <> 'wellhub')`. NUNCA `source <> 'wellhub'` pelado
 * ni `ne(bookings.source, 'wellhub')`: en SQL `NULL <> 'wellhub'` es NULL (no
 * verdadero) y esas filas propias desaparecerían del resultado.
 *
 * `attendance.attendance_source` (propiedad Drizzle `source`) es NOT NULL y
 * tiene DOS valores Wellhub: `wellhub` (validada contra la Access Control API y
 * facturada por Wellhub) y `wellhub_manual` (marcada a mano por el staff, D-19).
 * Todo predicado de asistencia tiene que cubrir AMBOS.
 *
 * TENANT-SAFETY: los fragmentos NUNCA se ejecutan como query propia. Viajan
 * AND-eados dentro de una query externa que el caller ya acota por gimnasio con
 * `tenantWhere`. Solo comparan una columna de la propia fila contra literales
 * fijos: no leen otras tablas ni cruzan gimnasios.
 */
import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/** Valor de `bookings.source` de una reserva que entró por Wellhub. */
export const WELLHUB_BOOKING_SOURCE = "wellhub" as const;

/** Valores de `attendance.attendance_source` que son visitas Wellhub. */
export const WELLHUB_ATTENDANCE_SOURCES = ["wellhub", "wellhub_manual"] as const;

export type WellhubAttendanceSource = (typeof WELLHUB_ATTENDANCE_SOURCES)[number];

/** ¿La reserva es Wellhub? NULL-safe: NULL/undefined = reserva propia. */
export function isWellhubBookingSource(
  source: string | null | undefined,
): boolean {
  return source === WELLHUB_BOOKING_SOURCE;
}

/** ¿La asistencia es una visita Wellhub (validada o manual)? */
export function isWellhubAttendanceSource(
  source: string | null | undefined,
): boolean {
  return (
    source !== null &&
    source !== undefined &&
    (WELLHUB_ATTENDANCE_SOURCES as readonly string[]).includes(source)
  );
}

/** Lista `'wellhub','wellhub_manual'` armada desde la única fuente de valores. */
function attendanceSourcesList(): SQL {
  return sql.join(
    WELLHUB_ATTENDANCE_SOURCES.map((v) => sql`${v}`),
    sql`, `,
  );
}

/** Reserva NO Wellhub (propia). Incluye las filas legacy con source NULL. */
export function notWellhubBookingSql(): SQL {
  /* tenant-safe: compara la columna source de la propia fila contra un literal,
     viaja AND-eada dentro de una query ya scopeada con tenantWhere (ver
     docblock de cabecera). */
  return sql`(${schema.bookings.source} IS NULL OR ${schema.bookings.source} <> ${WELLHUB_BOOKING_SOURCE})`;
}

/** Reserva Wellhub. */
export function isWellhubBookingSql(): SQL {
  /* tenant-safe: compara la columna source de la propia fila contra un literal,
     viaja AND-eada dentro de una query ya scopeada con tenantWhere. */
  return sql`${schema.bookings.source} = ${WELLHUB_BOOKING_SOURCE}`;
}

/** Asistencia NO Wellhub (qr/manual). `attendance_source` es NOT NULL. */
export function notWellhubAttendanceSql(): SQL {
  /* tenant-safe: compara la columna attendance_source de la propia fila contra
     literales, viaja AND-eada dentro de una query ya scopeada con tenantWhere. */
  return sql`${schema.attendance.source} NOT IN (${attendanceSourcesList()})`;
}

/** Visita Wellhub (validada o manual). */
export function isWellhubAttendanceSql(): SQL {
  /* tenant-safe: compara la columna attendance_source de la propia fila contra
     literales, viaja AND-eada dentro de una query ya scopeada con tenantWhere. */
  return sql`${schema.attendance.source} IN (${attendanceSourcesList()})`;
}

/**
 * Alias de `bookings` admitidos en las variantes crudas. Unión CERRADA: por eso
 * `sql.raw(alias)` es seguro (nunca llega texto del cliente).
 */
export type BookingAlias = "b" | "bk" | "bookings";

/** Alias de `attendance` admitidos en las variantes crudas (unión cerrada). */
export type AttendanceAlias = "a" | "att" | "attendance";

/** Variante cruda de {@link notWellhubBookingSql} para SQL con alias. */
export function notWellhubBookingRawSql(alias: BookingAlias): SQL {
  /* tenant-safe: misma comparación por columna propia que notWellhubBookingSql,
     el caller acota el gimnasio en la query externa. */
  const a = sql.raw(alias);
  return sql`(${a}.source IS NULL OR ${a}.source <> ${WELLHUB_BOOKING_SOURCE})`;
}

/** Variante cruda de {@link isWellhubBookingSql} para SQL con alias. */
export function isWellhubBookingRawSql(alias: BookingAlias): SQL {
  /* tenant-safe: misma comparación por columna propia que isWellhubBookingSql,
     el caller acota el gimnasio en la query externa. */
  return sql`${sql.raw(alias)}.source = ${WELLHUB_BOOKING_SOURCE}`;
}

/** Variante cruda de {@link notWellhubAttendanceSql} para SQL con alias. */
export function notWellhubAttendanceRawSql(alias: AttendanceAlias): SQL {
  /* tenant-safe: misma comparación por columna propia que
     notWellhubAttendanceSql, el caller acota el gimnasio en la query externa. */
  return sql`${sql.raw(alias)}.attendance_source NOT IN (${attendanceSourcesList()})`;
}

/** Variante cruda de {@link isWellhubAttendanceSql} para SQL con alias. */
export function isWellhubAttendanceRawSql(alias: AttendanceAlias): SQL {
  /* tenant-safe: misma comparación por columna propia que
     isWellhubAttendanceSql, el caller acota el gimnasio en la query externa. */
  return sql`${sql.raw(alias)}.attendance_source IN (${attendanceSourcesList()})`;
}
