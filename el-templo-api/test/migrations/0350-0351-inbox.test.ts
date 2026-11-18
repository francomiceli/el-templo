/**
 * Fase 215 Plan 02: migraciones 0350 (tabla `member_notifications`, la bandeja
 * de avisos) y 0351 (`inbox_kind` e `inbox_ref_id` en `pending_notifications`).
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations` (el
 * runner de tests tolera errores de DDL). Los dos UNIQUE (el aviso que viene de
 * la cola y el aviso sin cola, con `dedupe_key`) se prueban insertando filas de
 * verdad.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanAllTestData, createTestMember, createTestApp } from "../helpers";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");
const MIGRATION_SQL_FILES = [
  path.join(MIGRATIONS_DIR, "0350_member_notifications.sql"),
  path.join(MIGRATIONS_DIR, "0351_pending_notifications_inbox.sql"),
];

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

describe("Migraciones 0350-0351 — bandeja de avisos", () => {
  let app: FastifyInstance;
  let userId: number;
  let otherUserId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const user = await createTestMember(app);
    const other = await createTestMember(app);
    userId = user.id;
    otherUserId = other.id;
  });

  async function columns(table: string): Promise<Map<string, ColumnRow>> {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS columnType,
              IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    )) as [ColumnRow[], unknown];
    return new Map(rows.map((r) => [r.name, r]));
  }

  async function insertNotification(values: {
    userId: number;
    pendingNotificationId: number | null;
    dedupeKey: string | null;
  }): Promise<void> {
    await app.dbPool.query(
      `INSERT INTO member_notifications
         (user_id, pending_notification_id, dedupe_key, kind, title, body)
       VALUES (?, ?, ?, 'aura_gift', 'Titulo', 'Cuerpo')`,
      [values.userId, values.pendingNotificationId, values.dedupeKey],
    );
  }

  it("member_notifications tiene tenant_id NOT NULL default 1 y todas las columnas con su nulabilidad y defaults", async () => {
    const cols = await columns("member_notifications");
    const expected: Record<string, "NO" | "YES"> = {
      id: "NO",
      tenant_id: "NO",
      user_id: "NO",
      pending_notification_id: "YES",
      dedupe_key: "YES",
      kind: "NO",
      ref_id: "YES",
      title: "NO",
      body: "NO",
      route: "YES",
      destination_type: "NO",
      destination_section: "YES",
      whatsapp_text: "YES",
      shown_at: "NO",
      read_at: "YES",
      created_at: "NO",
    };
    for (const [name, nullable] of Object.entries(expected)) {
      const col = cols.get(name);
      expect(col, `falta la columna ${name}`).toBeDefined();
      expect(col!.nullable, `nulabilidad de ${name}`).toBe(nullable);
    }
    expect(cols.size).toBe(Object.keys(expected).length);
    expect(String(cols.get("tenant_id")!.defaultValue)).toBe("1");
    expect(cols.get("destination_type")!.columnType).toBe("varchar(20)");
    expect(String(cols.get("destination_type")!.defaultValue)).toBe(
      "app_section",
    );
    expect(cols.get("dedupe_key")!.columnType).toBe("varchar(160)");
    expect(cols.get("kind")!.columnType).toBe("varchar(32)");
    // shown_at tiene default (el envío) y read_at arranca NULL (sin leer).
    expect(cols.get("shown_at")!.defaultValue).not.toBeNull();
    expect([null, "NULL"]).toContain(cols.get("read_at")!.defaultValue);
  });

  it("tiene las 2 FKs nombradas y ninguna hacia pending_notifications", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT k.CONSTRAINT_NAME AS name, k.REFERENCED_TABLE_NAME AS referenced,
              r.DELETE_RULE AS deleteRule
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
         JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
          AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
          AND r.TABLE_NAME = k.TABLE_NAME
        WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'member_notifications'
          AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as [FkRow[], unknown];
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.size).toBe(2);
    expect(byName.get("fk_member_notifications_tenant")?.referenced).toBe(
      "tenants",
    );
    expect(byName.get("fk_member_notifications_user")?.referenced).toBe(
      "users",
    );
    expect(byName.get("fk_member_notifications_user")?.deleteRule).toBe(
      "CASCADE",
    );
    expect(rows.some((r) => r.referenced === "pending_notifications")).toBe(
      false,
    );
  });

  it("los dos UNIQUE y los 3 índices llevan tenant_id primero, salvo el de la purga", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seq, COLUMN_NAME AS \`column\`
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_notifications'
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    )) as [IndexColumnRow[], unknown];
    const byIndex = new Map<string, string[]>();
    const unique = new Set<string>();
    for (const r of rows) {
      byIndex.set(r.name, [...(byIndex.get(r.name) ?? []), r.column]);
      if (Number(r.nonUnique) === 0) unique.add(r.name);
    }
    expect(byIndex.get("uq_member_notifications_tenant_pending")).toEqual([
      "tenant_id",
      "pending_notification_id",
    ]);
    expect(byIndex.get("uq_member_notifications_tenant_user_dedupe")).toEqual([
      "tenant_id",
      "user_id",
      "dedupe_key",
    ]);
    expect(byIndex.get("idx_member_notifications_tenant_user_shown")).toEqual([
      "tenant_id",
      "user_id",
      "shown_at",
    ]);
    expect(byIndex.get("idx_member_notifications_tenant_user_read")).toEqual([
      "tenant_id",
      "user_id",
      "read_at",
    ]);
    // Purga a 90 días, cross-tenant: sin tenant_id a propósito.
    expect(byIndex.get("idx_member_notifications_shown")).toEqual(["shown_at"]);
    expect(Array.from(unique).sort()).toEqual([
      "PRIMARY",
      "uq_member_notifications_tenant_pending",
      "uq_member_notifications_tenant_user_dedupe",
    ]);
  });

  it("dos avisos con el mismo pending_notification_id en el mismo tenant chocan, con NULL no", async () => {
    await insertNotification({
      userId,
      pendingNotificationId: 990001,
      dedupeKey: null,
    });
    await expect(
      insertNotification({
        userId,
        pendingNotificationId: 990001,
        dedupeKey: null,
      }),
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    // Otro id de cola no choca.
    await insertNotification({
      userId,
      pendingNotificationId: 990002,
      dedupeKey: null,
    });
    // Los avisos sin cola (pending_notification_id NULL) no chocan entre sí.
    await insertNotification({
      userId,
      pendingNotificationId: null,
      dedupeKey: "clave-a",
    });
    await insertNotification({
      userId,
      pendingNotificationId: null,
      dedupeKey: "clave-b",
    });
    const [rows] = (await app.dbPool.query(
      "SELECT COUNT(*) AS n FROM member_notifications WHERE user_id = ?",
      [userId],
    )) as [Array<RowDataPacket & { n: number }>, unknown];
    expect(Number(rows[0].n)).toBe(4);
  });

  it("el mismo usuario con la misma dedupe_key choca (aviso sin cola pedido dos veces)", async () => {
    await insertNotification({
      userId,
      pendingNotificationId: null,
      dedupeKey: "class_reminder:booking:123",
    });
    await expect(
      insertNotification({
        userId,
        pendingNotificationId: null,
        dedupeKey: "class_reminder:booking:123",
      }),
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });

  it("la misma dedupe_key en dos usuarios distintos no choca", async () => {
    await insertNotification({
      userId,
      pendingNotificationId: null,
      dedupeKey: "class_reminder:booking:123",
    });
    await insertNotification({
      userId: otherUserId,
      pendingNotificationId: null,
      dedupeKey: "class_reminder:booking:123",
    });
    const [rows] = (await app.dbPool.query(
      "SELECT COUNT(*) AS n FROM member_notifications WHERE dedupe_key = ?",
      ["class_reminder:booking:123"],
    )) as [Array<RowDataPacket & { n: number }>, unknown];
    expect(Number(rows[0].n)).toBe(2);
  });

  it("dos avisos del mismo usuario con dedupe_key NULL no chocan", async () => {
    await insertNotification({
      userId,
      pendingNotificationId: 990101,
      dedupeKey: null,
    });
    await insertNotification({
      userId,
      pendingNotificationId: 990102,
      dedupeKey: null,
    });
    const [rows] = (await app.dbPool.query(
      "SELECT COUNT(*) AS n FROM member_notifications WHERE user_id = ? AND dedupe_key IS NULL",
      [userId],
    )) as [Array<RowDataPacket & { n: number }>, unknown];
    expect(Number(rows[0].n)).toBe(2);
  });

  it("pending_notifications tiene inbox_kind varchar(32) NULL e inbox_ref_id int NULL", async () => {
    const cols = await columns("pending_notifications");
    const kind = cols.get("inbox_kind");
    const ref = cols.get("inbox_ref_id");
    expect(kind, "falta inbox_kind").toBeDefined();
    expect(ref, "falta inbox_ref_id").toBeDefined();
    expect(kind!.columnType).toBe("varchar(32)");
    expect(kind!.nullable).toBe("YES");
    expect([null, "NULL"]).toContain(kind!.defaultValue);
    expect(ref!.columnType).toMatch(/^int/);
    expect(ref!.nullable).toBe("YES");
    expect([null, "NULL"]).toContain(ref!.defaultValue);
  });

  it("guard estatico: ningun comentario SQL de las dos migraciones contiene punto y coma", () => {
    for (const file of MIGRATION_SQL_FILES) {
      const offenders = readFileSync(file, "utf8")
        .split("\n")
        .filter(
          (line) => line.trimStart().startsWith("--") && line.includes(";"),
        );
      expect(offenders, path.basename(file)).toEqual([]);
    }
  });
});
