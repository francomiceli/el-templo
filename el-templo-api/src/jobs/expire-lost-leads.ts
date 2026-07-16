/**
 * Expire Lost Leads Cron Job (Fase 163 — AUTO-01 / AUTO-04, D-02 / D-04)
 *
 * Corrida diaria de madrugada AR que vence leads "En seguimiento" → "Perdido"
 * cuando su ÚLTIMA sesión de prueba no cancelada quedó fuera de la ventana X
 * configurable (system_settings `leads.perdido_window_days`, leída en cada
 * corrida vía SettingsService.getPerdidoWindowDays — sin cache, D-05).
 *
 * Regla (D-02): lead con `status = 'prueba'`, `lead_status`
 * En seguimiento (o NULL efectivo), `converted_at IS NULL`, `purchased_plan_id
 * IS NULL`, `deleted_at IS NULL`, cuya última booking `is_trial=1` no cancelada
 * (misma derivación MAX(id) que el reporte y la migración 0170) tiene
 * `booking_date + X días < CURDATE()`. Aplica a asistió y no-asistió por igual
 * (el campo Asistió NO toca el estado). Todo el cálculo de fechas vive en el
 * dominio DATE de SQL (CURDATE/DATE_ADD) porque `booking_date` es DATE — nunca
 * matemática de Date en JS.
 *
 * D-04: el cron NUNCA pisa un estado puesto a mano. El UPDATE guarda
 * `lead_status_source <> 'manual' OR lead_status_source IS NULL` (NULL tratado
 * como 'auto' por D-07) y setea `lead_status_source='auto'` en el flip. Los
 * candidatos que hubieran vencido pero son 'manual' se cuentan aparte en
 * `skippedManual` y se loguean por separado (specifics 78).
 */

import cron from "node-cron";
import pino from "pino";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { SettingsService } from "../modules/settings/service";

const log = pino({ name: "expire-lost-leads" });

/**
 * Derivación "última booking is_trial no cancelada" por miembro (MAX(id),
 * `is_trial=1 AND booking_status <> 'cancelado'`), idéntica a la de la
 * migración 0170 (95-118) y al reporte de sesiones de prueba, para que cron,
 * reporte y backfill cuenten exactamente lo mismo. Se reutiliza como fragmento
 * compartido entre el UPDATE de flip y el COUNT de salteados-manuales (DRY).
 */
const lastTrialBookingJoin = sql`
  JOIN (
    SELECT b2.member_id, MAX(b2.id) AS booking_id
    FROM bookings b2
    WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
    GROUP BY b2.member_id
  ) lt ON lt.member_id = u.id
  JOIN bookings b ON b.id = lt.booking_id
`;

/**
 * Predicados base del candidato a vencer (sin el guard de source, que difiere
 * entre el flip y el conteo de salteados). `windowDays` es un entero positivo
 * garantizado por getPerdidoWindowDays (Math.trunc + guard > 0, default 14),
 * así que su interpolación en `INTERVAL ... DAY` es segura.
 */
function candidateBaseConditions(windowDays: number) {
  return sql`
    (u.lead_status = 'en_seguimiento' OR u.lead_status IS NULL)
    AND u.converted_at IS NULL
    AND u.purchased_plan_id IS NULL
    AND u.deleted_at IS NULL
    AND u.status = 'prueba'
    AND DATE_ADD(b.booking_date, INTERVAL ${windowDays} DAY) < CURDATE()
  `;
}

/**
 * Corre el barrido completo una vez. Expuesto para tests e invocación manual
 * (mismo patrón que runMarkNoShows). Devuelve cuántos leads venció y cuántos
 * salteó por ser 'manual'.
 */
export async function runExpireLostLeads(
  db: MySql2Database<typeof schema>,
): Promise<{ expired: number; skippedManual: number }> {
  // (1) Leer X primero — reader canónico de settings (D-05), sin read bespoke.
  const settingsService = new SettingsService(db, log);
  const windowDays = await settingsService.getPerdidoWindowDays();

  const base = candidateBaseConditions(windowDays);

  // (4) Contar candidatos que hubieran vencido pero son 'manual' (D-04). El
  // UPDATE nunca los toca, así que el conteo es estable corra antes o después.
  const countRes = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM users u
    ${lastTrialBookingJoin}
    WHERE ${base}
      AND u.lead_status_source = 'manual'
  `);
  const skippedRow = (countRes as unknown as [Array<{ cnt: unknown }>])[0]?.[0];
  const skippedManual = Number(skippedRow?.cnt ?? 0);

  // (3) Flip: sólo candidatos no-manuales (NULL tratado como 'auto', D-07).
  // Setea source='auto' para dejar auditado que lo puso el automatismo.
  const updateRes = await db.execute(sql`
    UPDATE users u
    ${lastTrialBookingJoin}
    SET u.lead_status = 'perdido', u.lead_status_source = 'auto'
    WHERE ${base}
      AND (u.lead_status_source <> 'manual' OR u.lead_status_source IS NULL)
  `);
  const expired = Number(
    (updateRes as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0,
  );

  return { expired, skippedManual };
}

/**
 * Agenda el barrido a las 04:00 hora AR (madrugada, discreción de D). Batch
 * interno de una sola zona horaria (patrón notification-cron): el estado del
 * lead no depende de la sede, así que no se itera por timezone de branch.
 */
export function startExpireLostLeadsJob(db: MySql2Database<typeof schema>): void {
  cron.schedule(
    "0 4 * * *",
    async () => {
      try {
        const { expired, skippedManual } = await runExpireLostLeads(db);
        if (expired > 0 || skippedManual > 0) {
          log.info(
            { expired, skippedManual },
            "Expired stale trial leads to 'perdido'",
          );
        }
      } catch (err: unknown) {
        log.error({ err }, "Expire-lost-leads job failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  log.info(
    { schedule: "0 4 * * *", timezone: "America/Argentina/Buenos_Aires" },
    "Expire-lost-leads cron scheduled for 04:00 daily (AR)",
  );
}
