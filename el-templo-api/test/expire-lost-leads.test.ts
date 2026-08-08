/**
 * Fase 163-02 (AUTO-01 / AUTO-04, D-02 / D-04) — integration tests del barrido
 * diario que vence leads "En seguimiento" → "Perdido".
 *
 *   runExpireLostLeads(db): Promise<{ expired, skippedManual }>
 *
 * Corre contra la DB real eltemplo_test, invocando el barrido directo (sin
 * esperar el cron). Cubre los cinco casos del plan:
 *   1. Vence básico    — última booking X+1 días atrás → 'perdido' / source 'auto'.
 *   2. No vence         — misma booking X-1 días atrás → sigue 'en_seguimiento'.
 *   3. No pisa manual   — lead_status_source='manual' + booking vieja → intacto,
 *                         contado en skippedManual, NO en expired.
 *   4. Lee X de settings — con ventana custom (7) el borde X+1/X-1 se corre.
 *   5. Guard convertido — convertedAt / purchasedPlanId seteados → nunca se pisa.
 *
 * Post-review (WR-01/WR-02):
 *   6. Guard freemium — status='freemium' NUNCA se vence (candidato = solo
 *      'prueba', D-02).
 *   7. Coerción — setting_value='0' (degenerado) cae al default 14, no a 1.
 *
 * cleanAllTestData limpia systemSettings, bookings, schedules, activities y
 * subscription_plans entre tests (NO users), así que sembramos la ventana, el
 * horario y el lead frescos por test, con emails/dni únicos.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { LEADS_SETTINGS_KEYS } from "../src/modules/settings/keys";
import { runExpireLostLeads } from "../src/jobs/expire-lost-leads";
// Fase 173 (ADO-02): `users` entra a TENANT_STRICT_MODULES — las lecturas de
// conveniencia por id de este archivo se acotan con `tenantWhere` (categoría
// 2, docblock de `test/helpers.ts`); este archivo no siembra en el gimnasio 2.
import { tenantWhere } from "../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "./fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

let app: FastifyInstance;
let branchId: number;
let activityId: number;
let scheduleId: number;

function nextCode(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}${t}${r}`;
}

/**
 * DATE string (YYYY-MM-DD) para hoy − `days` días, en la fecha LOCAL del
 * proceso. MySQL evalúa CURDATE() en la tz del server (SYSTEM = ART), así que
 * calcular esto en UTC corre un día después de las 21:00 ART y los casos
 * "vencido" caen justo dentro de la ventana (bug latente detectado 2026-07-15).
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
      email: `${nextCode("expire")}@test.local`,
      passwordHash: "$argon2id$dummy",
      firstName: "Lead",
      lastName: "Expire",
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

async function seedTrialBooking(
  userId: number,
  daysAgo: number,
  status: "reservado" | "confirmado" | "cancelado" | "no_show" = "reservado",
): Promise<void> {
  await app.db.insert(schema.bookings).values({
    memberId: userId,
    scheduleId,
    bookingDate: dateDaysAgo(daysAgo),
    status,
    isTrial: true,
  });
}

async function seedPlan(): Promise<number> {
  const [p] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: nextCode("plan"),
      planTier: "foundation",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 1000,
      priceZero: 0,
      durationDays: 30,
    })
    .$returningId();
  return p.id;
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
    .where(
      and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
    );
  return { leadStatus: row.leadStatus, leadStatusSource: row.leadStatusSource };
}

describe("runExpireLostLeads (Fase 163-02)", () => {
  beforeAll(async () => {
    app = await createTestApp();
    // La branch 'TEST' la crea el setup y NO la limpia cleanAllTestData.
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
    // activities/schedules se limpian entre tests → resembrar por test.
    const [act] = await app.db
      .insert(schema.activities)
      .values({ name: nextCode("act"), description: "expire test" })
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

  it("Caso 1: vence un lead cuya última booking quedó fuera de la ventana", async () => {
    await seedWindow(14);
    const userId = await seedLead();
    await seedTrialBooking(userId, 15); // X+1 días atrás

    const { expired } = await runExpireLostLeads(app.db);

    expect(expired).toBeGreaterThanOrEqual(1);
    const s = await leadStatusOf(userId);
    expect(s.leadStatus).toBe("perdido");
    expect(s.leadStatusSource).toBe("auto");
  });

  it("Caso 2: NO vence dentro de la ventana", async () => {
    await seedWindow(14);
    const userId = await seedLead();
    await seedTrialBooking(userId, 13); // X-1 días atrás

    const { expired } = await runExpireLostLeads(app.db);

    expect(expired).toBe(0);
    const s = await leadStatusOf(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
  });

  it("Caso 3: NUNCA pisa un lead_status_source='manual' (lo cuenta en skippedManual)", async () => {
    await seedWindow(14);
    const userId = await seedLead({ leadStatusSource: "manual" });
    await seedTrialBooking(userId, 20); // vieja, vencería si fuera auto

    const { expired, skippedManual } = await runExpireLostLeads(app.db);

    expect(skippedManual).toBeGreaterThanOrEqual(1);
    const s = await leadStatusOf(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
    expect(s.leadStatusSource).toBe("manual");

    // El lead manual NO se contó como vencido.
    const [ownManual] = await app.db
      .select({ src: schema.users.leadStatusSource })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
      );
    expect(ownManual.src).toBe("manual");
    expect(expired).toBe(0);
  });

  it("Caso 4: lee X de settings — el borde se corre con una ventana custom", async () => {
    await seedWindow(7);
    const venceId = await seedLead();
    await seedTrialBooking(venceId, 8); // X+1 con X=7 → vence
    const quedaId = await seedLead();
    await seedTrialBooking(quedaId, 6); // X-1 con X=7 → no vence

    const { expired } = await runExpireLostLeads(app.db);

    expect(expired).toBe(1);
    expect((await leadStatusOf(venceId)).leadStatus).toBe("perdido");
    expect((await leadStatusOf(quedaId)).leadStatus).toBe("en_seguimiento");
  });

  it("Guard: un lead convertido (convertedAt o purchasedPlanId) NUNCA se vence", async () => {
    await seedWindow(14);
    const convertedId = await seedLead({ convertedAt: new Date() });
    await seedTrialBooking(convertedId, 30);

    const planId = await seedPlan();
    const purchasedId = await seedLead({ purchasedPlanId: planId });
    await seedTrialBooking(purchasedId, 30);

    const { expired } = await runExpireLostLeads(app.db);

    expect(expired).toBe(0);
    expect((await leadStatusOf(convertedId)).leadStatus).toBe("en_seguimiento");
    expect((await leadStatusOf(purchasedId)).leadStatus).toBe("en_seguimiento");
  });

  it("Caso 6 (WR-01): un freemium con booking de prueba vencida NUNCA se vence", async () => {
    await seedWindow(14);
    // Estado teóricamente imposible (prueba→freemium cancela la booking), pero
    // el guard debe ser explícito y no depender de ese acople (D-02).
    const freemiumId = await seedLead({ status: "freemium", leadStatus: null });
    await seedTrialBooking(freemiumId, 30);

    const { expired } = await runExpireLostLeads(app.db);

    expect(expired).toBe(0);
    const s = await leadStatusOf(freemiumId);
    expect(s.leadStatus).toBeNull();
  });

  it("Caso 7 (WR-02): setting_value='0' degenera al default 14, no a 1", async () => {
    await seedWindow(0);
    const dentroId = await seedLead();
    await seedTrialBooking(dentroId, 13); // dentro de la ventana efectiva (14)
    const fueraId = await seedLead();
    await seedTrialBooking(fueraId, 15); // fuera de la ventana efectiva (14)

    const { expired } = await runExpireLostLeads(app.db);

    expect(expired).toBe(1);
    expect((await leadStatusOf(dentroId)).leadStatus).toBe("en_seguimiento");
    expect((await leadStatusOf(fueraId)).leadStatus).toBe("perdido");
  });
});
