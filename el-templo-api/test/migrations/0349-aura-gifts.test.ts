/**
 * Fase 215 Plan 01: migración 0349 (tabla `aura_gifts`, D-02/D-03/D-20).
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations` (el
 * runner de tests tolera errores de DDL). Los dos candados (un regalo por
 * asistencia de quien da, y el profe una vez por día a cada persona) se prueban
 * insertando filas de verdad.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanAllTestData, createTestMember, createTestApp } from "../helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const MIGRATION_SQL = path.resolve(
  __dirname,
  "../../src/db/migrations/0349_aura_gifts.sql",
);

interface ColumnRow extends RowDataPacket {
  name: string;
  columnType: string;
  nullable: string;
  defaultValue: string | null;
}

interface FkRow extends RowDataPacket {
  name: string;
  referenced: string;
  deleteRule: string;
}

interface IndexColumnRow extends RowDataPacket {
  name: string;
  nonUnique: number;
  seq: number;
  column: string;
}

/** `enum('a','b')` -> ["a", "b"] */
function parseEnumValues(columnType: string): string[] {
  return Array.from(columnType.matchAll(/'([^']+)'/g), (m) => m[1]);
}

describe("Migración 0349 — aura_gifts", () => {
  let app: FastifyInstance;
  let giverId: number;
  let receiverId: number;
  let otherReceiverId: number;
  let branchId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const giver = await createTestMember(app);
    const receiver = await createTestMember(app);
    const other = await createTestMember(app);
    giverId = giver.id;
    receiverId = receiver.id;
    otherReceiverId = other.id;
    branchId = Number(giver.branchId ?? 1);
  });

  async function columns(): Promise<Map<string, ColumnRow>> {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS columnType,
              IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aura_gifts'`,
    )) as [ColumnRow[], unknown];
    return new Map(rows.map((r) => [r.name, r]));
  }

  async function insertGift(values: {
    giverUserId: number;
    receiverUserId: number;
    giverKind: "alumno" | "profe";
    giverAttendanceId: number | null;
    receiverAttendanceId: number;
    coachGiftDate: string | null;
  }): Promise<void> {
    await app.dbPool.query(
      `INSERT INTO aura_gifts
         (tenant_id, giver_user_id, receiver_user_id, giver_kind, branch_id,
          session_date, giver_attendance_id, receiver_attendance_id,
          coach_gift_date, reason, amount)
       VALUES (?, ?, ?, ?, ?, '2026-11-18', ?, ?, ?, 'tecnica', 1)`,
      [
        TENANT_TEMPLO,
        values.giverUserId,
        values.receiverUserId,
        values.giverKind,
        branchId,
        values.giverAttendanceId,
        values.receiverAttendanceId,
        values.coachGiftDate,
      ],
    );
  }

  it("aura_gifts tiene tenant_id NOT NULL default 1 y todas las columnas con su nulabilidad", async () => {
    const cols = await columns();
    const expected: Record<string, "NO" | "YES"> = {
      id: "NO",
      tenant_id: "NO",
      giver_user_id: "NO",
      receiver_user_id: "NO",
      giver_kind: "NO",
      branch_id: "NO",
      schedule_id: "YES",
      session_date: "NO",
      giver_attendance_id: "YES",
      receiver_attendance_id: "NO",
      coach_gift_date: "YES",
      reason: "NO",
      amount: "NO",
      aura_gift_status: "NO",
      voided_by_user_id: "YES",
      voided_at: "YES",
      void_cause: "YES",
      created_at: "NO",
    };
    for (const [name, nullable] of Object.entries(expected)) {
      const col = cols.get(name);
      expect(col, `falta la columna ${name}`).toBeDefined();
      expect(col!.nullable, `nulabilidad de ${name}`).toBe(nullable);
    }
    expect(cols.size).toBe(Object.keys(expected).length);
    expect(String(cols.get("tenant_id")!.defaultValue)).toBe("1");
  });

  it("aura_gift_status es ENUM con vigente y anulado, default vigente", async () => {
    const col = (await columns()).get("aura_gift_status");
    expect(col).toBeDefined();
    expect(parseEnumValues(col!.columnType)).toEqual(["vigente", "anulado"]);
    expect(String(col!.defaultValue)).toBe("vigente");
  });

  it("tiene las 6 FKs nombradas con sus reglas ON DELETE", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT k.CONSTRAINT_NAME AS name, k.REFERENCED_TABLE_NAME AS referenced,
              r.DELETE_RULE AS deleteRule
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
         JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
          AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
          AND r.TABLE_NAME = k.TABLE_NAME
        WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'aura_gifts'
          AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as [FkRow[], unknown];
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.size).toBe(6);
    expect(byName.get("fk_aura_gifts_tenant")?.referenced).toBe("tenants");
    expect(byName.get("fk_aura_gifts_giver")?.referenced).toBe("users");
    expect(byName.get("fk_aura_gifts_giver")?.deleteRule).toBe("CASCADE");
    expect(byName.get("fk_aura_gifts_receiver")?.referenced).toBe("users");
    expect(byName.get("fk_aura_gifts_receiver")?.deleteRule).toBe("CASCADE");
    expect(byName.get("fk_aura_gifts_branch")?.referenced).toBe("branches");
    expect(byName.get("fk_aura_gifts_schedule")?.referenced).toBe("schedules");
    expect(byName.get("fk_aura_gifts_schedule")?.deleteRule).toBe("SET NULL");
    expect(byName.get("fk_aura_gifts_voided_by")?.referenced).toBe("users");
    expect(byName.get("fk_aura_gifts_voided_by")?.deleteRule).toBe("SET NULL");
  });

  it("los dos UNIQUE llevan tenant_id primero y las columnas en orden", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seq, COLUMN_NAME AS \`column\`
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aura_gifts'
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    )) as [IndexColumnRow[], unknown];
    const byIndex = new Map<string, string[]>();
    const unique = new Set<string>();
    for (const r of rows) {
      byIndex.set(r.name, [...(byIndex.get(r.name) ?? []), r.column]);
      if (Number(r.nonUnique) === 0) unique.add(r.name);
    }
    expect(byIndex.get("uq_aura_gifts_tenant_giver_attendance")).toEqual([
      "tenant_id",
      "giver_attendance_id",
    ]);
    expect(byIndex.get("uq_aura_gifts_tenant_coach_day")).toEqual([
      "tenant_id",
      "giver_user_id",
      "receiver_user_id",
      "coach_gift_date",
    ]);
    expect(Array.from(unique).sort()).toEqual([
      "PRIMARY",
      "uq_aura_gifts_tenant_coach_day",
      "uq_aura_gifts_tenant_giver_attendance",
    ]);
    for (const name of [
      "idx_aura_gifts_tenant_receiver_created",
      "idx_aura_gifts_tenant_giver_date",
      "idx_aura_gifts_tenant_branch_date",
      "idx_aura_gifts_tenant_receiver_attendance",
    ]) {
      expect(byIndex.get(name)?.[0], name).toBe("tenant_id");
    }
  });

  it("dos regalos de alumno con la misma asistencia de quien da chocan", async () => {
    // Los ids de asistencia son arbitrarios: la tabla no tiene FK a attendance.
    const attendanceId = 880001;
    await insertGift({
      giverUserId: giverId,
      receiverUserId: receiverId,
      giverKind: "alumno",
      giverAttendanceId: attendanceId,
      receiverAttendanceId: 880002,
      coachGiftDate: null,
    });
    await expect(
      insertGift({
        giverUserId: giverId,
        receiverUserId: otherReceiverId,
        giverKind: "alumno",
        giverAttendanceId: attendanceId,
        receiverAttendanceId: 880003,
        coachGiftDate: null,
      }),
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });

  it("el profe puede regalar sin asistencia propia: los NULL no chocan entre días", async () => {
    await insertGift({
      giverUserId: giverId,
      receiverUserId: receiverId,
      giverKind: "profe",
      giverAttendanceId: null,
      receiverAttendanceId: 880011,
      coachGiftDate: "2026-11-18",
    });
    await insertGift({
      giverUserId: giverId,
      receiverUserId: receiverId,
      giverKind: "profe",
      giverAttendanceId: null,
      receiverAttendanceId: 880012,
      coachGiftDate: "2026-11-19",
    });
    // Mismo día pero otra persona: tampoco choca.
    await insertGift({
      giverUserId: giverId,
      receiverUserId: otherReceiverId,
      giverKind: "profe",
      giverAttendanceId: null,
      receiverAttendanceId: 880013,
      coachGiftDate: "2026-11-18",
    });
    const [rows] = (await app.dbPool.query(
      "SELECT COUNT(*) AS n FROM aura_gifts WHERE tenant_id = ? AND giver_user_id = ?",
      [TENANT_TEMPLO, giverId],
    )) as [Array<RowDataPacket & { n: number }>, unknown];
    expect(Number(rows[0].n)).toBe(3);
  });

  it("el profe no puede regalar dos veces el mismo día a la misma persona", async () => {
    await insertGift({
      giverUserId: giverId,
      receiverUserId: receiverId,
      giverKind: "profe",
      giverAttendanceId: null,
      receiverAttendanceId: 880021,
      coachGiftDate: "2026-11-18",
    });
    await expect(
      insertGift({
        giverUserId: giverId,
        receiverUserId: receiverId,
        giverKind: "profe",
        giverAttendanceId: null,
        receiverAttendanceId: 880022,
        coachGiftDate: "2026-11-18",
      }),
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });

  it("guard estatico: ningun comentario SQL contiene punto y coma", () => {
    const offenders = readFileSync(MIGRATION_SQL, "utf8")
      .split("\n")
      .filter(
        (line) => line.trimStart().startsWith("--") && line.includes(";"),
      );
    expect(offenders).toEqual([]);
  });
});
