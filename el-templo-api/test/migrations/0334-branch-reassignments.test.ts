/**
 * Migración 0334 (histórico de recategorizaciones multisucursal): backfill de
 * las corridas pasadas del cron a `branch_reassignments`.
 *
 * El SQL se lee del disco y se parte con `splitSqlStatements()` (el MISMO parser
 * que el runner de producción y el provisioning de tests). Se ejecuta solo el
 * INSERT ... SELECT del backfill: el CREATE TABLE ya lo aplicó el provisioning
 * del worker.
 *
 * Los timestamps se siembran con literales de string (`'2026-10-01 07:00:00'`)
 * y NO con `Date`: MySQL los interpreta en la zona de la sesión, igual que el
 * `HOUR(...) = 7` del backfill, así que el test no depende de la zona horaria
 * de la máquina que lo corre.
 *
 * Cubre: sede de origen = último cobro previo (vivo, inflow, con sede, anterior
 * al evento); cobro en la sede destino → NULL; sin cobros → NULL; alta de
 * Wellhub excluida; fuentes/horas/días que no son del cron excluidos; conteos
 * de asistencia (ventana de 30 días con bordes inclusivos); idempotencia.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0334_branch_reassignments.sql",
);

const EVENT_AT = "2026-10-01 07:00:00";
const CREATED_AT = "2026-01-10 10:00:00";

let seq = 0;

interface EventRow {
  memberId: number;
  fromBranchId: number | null;
  toBranchId: number;
  toBranchAttendances: number;
  totalAttendances: number;
  source: string;
  reassignedAtStr: string;
}

describe("migración 0334: backfill de branch_reassignments", () => {
  let app: FastifyInstance;
  let backfillStatement: string;
  let branchA: number;
  let branchB: number;
  let branchC: number;
  let branchD: number;

  beforeAll(async () => {
    app = await createTestApp();

    const source = readFileSync(MIGRATION_PATH, "utf8");
    // Invariante del runner: ningún `;` dentro de un comentario `--`.
    const offending = source
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offending).toEqual([]);

    const statements = splitSqlStatements(source);
    const found = statements.find((s) =>
      s.includes("INSERT INTO `branch_reassignments`"),
    );
    expect(found).toBeDefined();
    backfillStatement = found ?? "";
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    branchA = await insertBranch("A");
    branchB = await insertBranch("B");
    branchC = await insertBranch("C");
    branchD = await insertBranch("D");
  });

  async function insertBranch(label: string): Promise<number> {
    seq += 1;
    const [row] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(CTX, {
          name: `M0334-${label}-${seq}`,
          code: `M0334-${label}-${seq}-${Date.now().toString(36)}`,
          country: "AR",
          timezone: "America/Argentina/Buenos_Aires",
        }),
      )
      .$returningId();
    return row.id;
  }

  /**
   * Alumno con el tracking de sede puesto a mano en SQL crudo (fecha del evento
   * y `created_at` como literales de string, ver el docblock del archivo).
   */
  async function insertMember(opts: {
    branchId: number;
    source: "auto" | "manual";
    eventAt: string;
    createdAt?: string;
  }): Promise<number> {
    seq += 1;
    const [row] = await app.db
      .insert(schema.users)
      .values(
        tenantValues(CTX, {
          email: `m0334-${seq}-${Date.now()}@test.com`,
          passwordHash: "x",
          firstName: "Alumno",
          lastName: `M0334 ${seq}`,
          role: "member" as const,
          branchId: opts.branchId,
        }),
      )
      .$returningId();
    await app.db.execute(
      sql`UPDATE users
             SET branch_source = ${opts.source},
                 branch_updated_at = ${opts.eventAt},
                 created_at = ${opts.createdAt ?? CREATED_AT}
           WHERE id = ${row.id} AND tenant_id = ${TENANT_TEMPLO}`,
    );
    return row.id;
  }

  async function insertCharge(opts: {
    memberId: number;
    branchId: number | null;
    createdAt: string;
    direction?: "inflow" | "outflow";
    voided?: boolean;
  }): Promise<void> {
    const outflow = opts.direction === "outflow";
    const [row] = await app.db
      .insert(schema.financialTransactions)
      .values(
        tenantValues(CTX, {
          memberId: opts.memberId,
          kind: outflow ? ("refund" as const) : ("plan_charge" as const),
          direction: outflow ? ("outflow" as const) : ("inflow" as const),
          amount: 10000,
          currency: "ARS",
          paymentMethod: "cash" as const,
          transactionDate: "2026-09-01",
          effectiveDate: "2026-09-01",
          branchId: opts.branchId,
          recordedBy: opts.memberId,
        }),
      )
      .$returningId();
    await app.db.execute(
      sql`UPDATE financial_transactions
             SET created_at = ${opts.createdAt},
                 voided_at = ${opts.voided ? opts.createdAt : null}
           WHERE id = ${row.id} AND tenant_id = ${TENANT_TEMPLO}`,
    );
  }

  async function addAttendance(
    memberId: number,
    branchId: number,
    sessionDate: string,
  ): Promise<void> {
    await app.db
      .insert(schema.attendance)
      .values(tenantValues(CTX, { memberId, branchId, sessionDate }));
  }

  async function runBackfill(): Promise<void> {
    await app.dbPool.query(backfillStatement);
  }

  async function events(): Promise<EventRow[]> {
    return app.db
      .select({
        memberId: schema.branchReassignments.memberId,
        fromBranchId: schema.branchReassignments.fromBranchId,
        toBranchId: schema.branchReassignments.toBranchId,
        toBranchAttendances: schema.branchReassignments.toBranchAttendances,
        totalAttendances: schema.branchReassignments.totalAttendances,
        source: schema.branchReassignments.source,
        reassignedAtStr: sql<string>`DATE_FORMAT(reassigned_at, '%Y-%m-%d %H:%i:%s')`,
      })
      .from(schema.branchReassignments)
      .where(tenantWhere(schema.branchReassignments, CTX))
      .orderBy(schema.branchReassignments.memberId);
  }

  it("reconstruye la sede de origen con el ÚLTIMO cobro previo y recuenta las asistencias", async () => {
    // Alumno movido a B por el cron del 1/10: su último cobro vivo, inflow y con
    // sede antes del evento fue en C.
    const m = await insertMember({
      branchId: branchB,
      source: "auto",
      eventAt: EVENT_AT,
    });
    await insertCharge({
      memberId: m,
      branchId: branchA,
      createdAt: "2026-08-10 10:00:00",
    }); // más viejo
    await insertCharge({
      memberId: m,
      branchId: branchC,
      createdAt: "2026-09-15 10:00:00",
    }); // EL ÚLTIMO válido → origen
    await insertCharge({
      memberId: m,
      branchId: branchD,
      createdAt: "2026-09-20 10:00:00",
      voided: true,
    }); // anulado: no cuenta
    await insertCharge({
      memberId: m,
      branchId: null,
      createdAt: "2026-09-28 10:00:00",
    }); // sin sede: no cuenta
    await insertCharge({
      memberId: m,
      branchId: branchD,
      createdAt: "2026-09-29 10:00:00",
      direction: "outflow",
    }); // egreso: no cuenta
    await insertCharge({
      memberId: m,
      branchId: branchD,
      createdAt: "2026-10-05 10:00:00",
    }); // posterior al evento: no cuenta

    // Asistencias: ventana [2026-09-01, 2026-10-01], bordes inclusivos.
    await addAttendance(m, branchB, "2026-09-20");
    await addAttendance(m, branchB, "2026-09-25");
    await addAttendance(m, branchB, "2026-10-01"); // día del evento
    await addAttendance(m, branchA, "2026-09-10");
    await addAttendance(m, branchA, "2026-09-01"); // borde inferior
    await addAttendance(m, branchB, "2026-08-31"); // fuera (antes)
    await addAttendance(m, branchB, "2026-10-02"); // fuera (después)

    await runBackfill();

    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      memberId: m,
      fromBranchId: branchC,
      toBranchId: branchB,
      toBranchAttendances: 3,
      totalAttendances: 5,
      source: "backfill",
      reassignedAtStr: EVENT_AT,
    });
  });

  it("si el último cobro fue en la sede destino, el origen queda NULL (sin dato)", async () => {
    const m = await insertMember({
      branchId: branchB,
      source: "auto",
      eventAt: EVENT_AT,
    });
    await insertCharge({
      memberId: m,
      branchId: branchA,
      createdAt: "2026-08-10 10:00:00",
    });
    await insertCharge({
      memberId: m,
      branchId: branchB,
      createdAt: "2026-09-15 10:00:00",
    }); // el último es en el destino → NO se infiere A

    await runBackfill();

    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0].fromBranchId).toBeNull();
    expect(rows[0].toBranchId).toBe(branchB);
  });

  it("sin cobros el origen queda NULL y los conteos en 0", async () => {
    const m = await insertMember({
      branchId: branchB,
      source: "auto",
      eventAt: EVENT_AT,
    });

    await runBackfill();

    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: m,
      fromBranchId: null,
      toBranchAttendances: 0,
      totalAttendances: 0,
    });
  });

  it("excluye altas de Wellhub, cambios manuales y lo que no es día 1 a las 07 UTC", async () => {
    // Alta de Wellhub: 'auto', día 1 07:00 pero en el mismo instante del alta.
    await insertMember({
      branchId: branchB,
      source: "auto",
      eventAt: EVENT_AT,
      createdAt: EVENT_AT,
    });
    // Cambio manual el día 1 a las 07:00.
    await insertMember({
      branchId: branchB,
      source: "manual",
      eventAt: EVENT_AT,
    });
    // Auto pero el día 2.
    await insertMember({
      branchId: branchB,
      source: "auto",
      eventAt: "2026-10-02 07:00:00",
    });
    // Auto el día 1 pero a las 08.
    await insertMember({
      branchId: branchB,
      source: "auto",
      eventAt: "2026-10-01 08:00:00",
    });
    // Control positivo: este SÍ es del cron (otro mes).
    const cron = await insertMember({
      branchId: branchA,
      source: "auto",
      eventAt: "2026-08-01 07:00:00",
    });

    await runBackfill();

    const rows = await events();
    expect(rows.map((r) => r.memberId)).toEqual([cron]);
    expect(rows[0].reassignedAtStr).toBe("2026-08-01 07:00:00");
  });

  it("es idempotente: correrlo dos veces no duplica los eventos", async () => {
    await insertMember({
      branchId: branchB,
      source: "auto",
      eventAt: EVENT_AT,
    });
    await insertMember({
      branchId: branchA,
      source: "auto",
      eventAt: "2026-09-01 07:00:00",
    });

    await runBackfill();
    await runBackfill();

    expect(await events()).toHaveLength(2);
  });

  it("en una base sin candidatos no inserta nada ni falla", async () => {
    await runBackfill();
    expect(await events()).toEqual([]);
  });
});
