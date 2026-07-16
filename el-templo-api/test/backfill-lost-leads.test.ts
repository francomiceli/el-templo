/**
 * Fase 163-04 (AUTO-05, D-08) — integration test del backfill retroactivo
 * de la maquina de estados del lead (migracion 0183_backfill_lost_leads.sql).
 *
 * En vez de reimplementar la regla, el test extrae el statement UPDATE REAL de
 * la migracion 0183 (con el mismo parser del runner, splitSqlStatements) y lo
 * corre contra filas frescas sembradas en eltemplo_test. Como la migracion ya
 * corrio una vez al provisionar la DB de test (sobre filas viejas), volver a
 * ejecutar solo su UPDATE sobre rows nuevas prueba el predicado en aislamiento:
 * la regla es identica a la del cron (src/jobs/expire-lost-leads.ts).
 *
 * Casos:
 *   (a) En seguimiento con ultima booking vencida  -> flip a perdido / source auto.
 *   (b) En seguimiento dentro de la ventana         -> queda en_seguimiento.
 *   (c) lead_status_source='manual' vencido          -> queda intacto (guard D-04).
 *   (d) lead convertido (convertedAt) vencido         -> queda intacto (guard).
 *   (e) WR-01: freemium vencido                       -> queda intacto (solo 'prueba').
 *   (f) WR-02: setting '0' degenera al default 14, no a 1.
 *
 * cleanAllTestData limpia systemSettings/bookings/schedules/activities entre
 * tests (NO users), asi que sembramos la ventana, el horario y el lead frescos
 * por test con emails/dni unicos. La tabla users_lead_backup_0183 es un
 * CREATE TABLE AS (no schema Drizzle) -> no esta en TABLES_TO_CLEAN y no se toca.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { createTestApp, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { LEADS_SETTINGS_KEYS } from "../src/modules/settings/keys";
import { splitSqlStatements } from "../src/db/run-migrations";

let app: FastifyInstance;
let branchId: number;
let activityId: number;
let scheduleId: number;

// Statement UPDATE REAL de la migracion 0183 (extraido con el parser del runner).
const MIGRATION_PATH = path.join(
  __dirname,
  "../src/db/migrations/0183_backfill_lost_leads.sql",
);
const reclassifyStmt = splitSqlStatements(
  fs.readFileSync(MIGRATION_PATH, "utf-8"),
).find((s) => s.trim().toUpperCase().startsWith("UPDATE"));

function nextCode(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}${t}${r}`;
}

/**
 * DATE string (YYYY-MM-DD) para hoy − `days` dias, en la fecha LOCAL del
 * proceso. MySQL evalua CURDATE() en la tz del server (SYSTEM = ART) -- en UTC
 * esto corre un dia despues de las 21:00 ART y los casos "vencido" caen dentro
 * de la ventana (bug latente detectado 2026-07-15).
 */
function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function seedWindow(days: number): Promise<void> {
  await app.db.insert(schema.systemSettings).values({
    settingKey: LEADS_SETTINGS_KEYS.perdidoWindowDays,
    settingValue: String(days),
  });
}

interface SeedLeadOpts {
  status?: "prueba" | "freemium" | "activo";
  leadStatus?: "en_seguimiento" | "ganado" | "perdido" | null;
  leadStatusSource?: "auto" | "manual" | null;
  convertedAt?: Date | null;
  purchasedPlanId?: number | null;
}

async function seedLead(opts: SeedLeadOpts = {}): Promise<number> {
  const [u] = await app.db
    .insert(schema.users)
    .values({
      email: `${nextCode("bfill")}@test.local`,
      passwordHash: "$argon2id$dummy",
      firstName: "Lead",
      lastName: "Backfill",
      role: "member",
      branchId,
      dni: nextCode("D"),
      phone: `+549114${Date.now().toString().slice(-8)}${Math.floor(
        Math.random() * 1000,
      )
        .toString()
        .padStart(3, "0")}`,
      status: opts.status ?? "prueba",
      leadStatus:
        opts.leadStatus === undefined ? "en_seguimiento" : opts.leadStatus,
      leadStatusSource: opts.leadStatusSource ?? null,
      convertedAt: opts.convertedAt ?? null,
      purchasedPlanId: opts.purchasedPlanId ?? null,
    })
    .$returningId();
  return u.id;
}

async function seedTrialBooking(userId: number, daysAgo: number): Promise<void> {
  await app.db.insert(schema.bookings).values({
    memberId: userId,
    scheduleId,
    bookingDate: dateDaysAgo(daysAgo),
    status: "reservado",
    isTrial: true,
  });
}

async function leadStatusOf(
  userId: number,
): Promise<{ leadStatus: string | null; leadStatusSource: string | null }> {
  const [row] = await app.db
    .select({
      leadStatus: schema.users.leadStatus,
      leadStatusSource: schema.users.leadStatusSource,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return { leadStatus: row.leadStatus, leadStatusSource: row.leadStatusSource };
}

/** Corre el UPDATE de reclasificacion EXACTO de la migracion 0183. */
async function runBackfillReclassify(): Promise<number> {
  if (!reclassifyStmt) throw new Error("UPDATE stmt no encontrado en 0183");
  const res = await app.db.execute(sql.raw(reclassifyStmt));
  return Number(
    (res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0,
  );
}

describe("backfill 0183 lost leads (Fase 163-04)", () => {
  beforeAll(async () => {
    app = await createTestApp();
    const [b] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"));
    branchId = b.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const [act] = await app.db
      .insert(schema.activities)
      .values({ name: nextCode("act"), description: "backfill test" })
      .$returningId();
    activityId = act.id;
    const [sch] = await app.db
      .insert(schema.schedules)
      .values({
        branchId,
        activityId,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
      })
      .$returningId();
    scheduleId = sch.id;
  });

  it("(a) flip: En seguimiento con ultima booking vencida -> perdido / source auto", async () => {
    await seedWindow(14);
    const userId = await seedLead();
    await seedTrialBooking(userId, 15); // X+1 dias atras

    const affected = await runBackfillReclassify();

    expect(affected).toBeGreaterThanOrEqual(1);
    const s = await leadStatusOf(userId);
    expect(s.leadStatus).toBe("perdido");
    expect(s.leadStatusSource).toBe("auto");
  });

  it("(b) queda: En seguimiento dentro de la ventana no se toca", async () => {
    await seedWindow(14);
    const userId = await seedLead();
    await seedTrialBooking(userId, 13); // X-1 dias atras

    await runBackfillReclassify();

    const s = await leadStatusOf(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
  });

  it("(c) guard manual: lead_status_source='manual' vencido queda intacto", async () => {
    await seedWindow(14);
    const userId = await seedLead({ leadStatusSource: "manual" });
    await seedTrialBooking(userId, 30); // vencida, pero es manual

    await runBackfillReclassify();

    const s = await leadStatusOf(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
    expect(s.leadStatusSource).toBe("manual");
  });

  it("(d) guard convertido: lead con convertedAt vencido nunca se pisa", async () => {
    await seedWindow(14);
    const userId = await seedLead({ convertedAt: new Date() });
    await seedTrialBooking(userId, 30);

    await runBackfillReclassify();

    const s = await leadStatusOf(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
  });

  it("(e) WR-01: freemium con booking vencida queda intacto (candidato = solo 'prueba')", async () => {
    await seedWindow(14);
    const freemiumId = await seedLead({ status: "freemium", leadStatus: null });
    await seedTrialBooking(freemiumId, 30);

    const affected = await runBackfillReclassify();

    expect(affected).toBe(0);
    const s = await leadStatusOf(freemiumId);
    expect(s.leadStatus).toBeNull();
  });

  it("(f) WR-02: setting '0' degenera al default 14 (igual que el cron), no a 1", async () => {
    await seedWindow(0);
    const dentroId = await seedLead();
    await seedTrialBooking(dentroId, 13); // dentro de la ventana efectiva (14)
    const fueraId = await seedLead();
    await seedTrialBooking(fueraId, 15); // fuera de la ventana efectiva (14)

    const affected = await runBackfillReclassify();

    expect(affected).toBe(1);
    expect((await leadStatusOf(dentroId)).leadStatus).toBe("en_seguimiento");
    expect((await leadStatusOf(fueraId)).leadStatus).toBe("perdido");
  });
});
