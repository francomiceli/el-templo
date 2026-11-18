/**
 * Fase 214 Plan 12: migraciones 0345 (fuente de AURA `profile_photo`, D-30) y
 * 0346 (tabla `member_photos`, D-30/D-31/D-34/D-45/D-50).
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations` (el
 * runner de tests tolera errores de DDL). El seed de `aura_config` NO se afirma
 * contra la fila viva (otros archivos del worker borran `aura_config`): se hace
 * un guard ESTATICO sobre el texto del SQL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestApp } from "../helpers";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");
const AURA_SQL = path.join(
  MIGRATIONS_DIR,
  "0345_aura_source_profile_photo.sql",
);
const PHOTOS_SQL = path.join(MIGRATIONS_DIR, "0346_member_photos.sql");

interface ColumnRow extends RowDataPacket {
  name: string;
  columnType: string;
  nullable: string;
  defaultValue: string | null;
}

interface FkRow extends RowDataPacket {
  name: string;
  referenced: string;
}

interface IndexRow extends RowDataPacket {
  name: string;
  nonUnique: number;
}

/** `enum('a','b')` -> ["a", "b"] */
function parseEnumValues(columnType: string): string[] {
  return Array.from(columnType.matchAll(/'([^']+)'/g), (m) => m[1]);
}

describe("Migraciones 0345-0346 — foto propia", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
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

  async function enumValues(table: string, column: string): Promise<string[]> {
    const cols = await columns(table);
    const col = cols.get(column);
    expect(col, `${table}.${column} no existe`).toBeDefined();
    return parseEnumValues(col!.columnType);
  }

  it("las dos listas de ENUM incluyen profile_photo y son identicas", async () => {
    const tx = await enumValues("aura_transactions", "source_type");
    const cfg = await enumValues("aura_config", "aura_config_source_type");
    expect(tx).toContain("profile_photo");
    expect(cfg).toContain("profile_photo");
    expect(cfg).toEqual(tx);
  });

  it("conserva los valores anteriores (stretch sigue en su lugar)", async () => {
    const tx = await enumValues("aura_transactions", "source_type");
    expect(tx).toContain("extra_block");
    expect(tx).toContain("stretch");
    expect(tx.indexOf("stretch")).toBeLessThan(tx.indexOf("profile_photo"));
  });

  it("guard estatico: siembra profile_photo en 5 con INSERT IGNORE", () => {
    const source = readFileSync(AURA_SQL, "utf8");
    expect(source).toContain("INSERT IGNORE INTO `aura_config`");
    expect(source).toContain("('profile_photo', 5,");
  });

  it("member_photos tiene tenant_id NOT NULL default 1 y todas las columnas", async () => {
    const cols = await columns("member_photos");
    for (const name of [
      "id",
      "tenant_id",
      "user_id",
      "storage_key",
      "photo_origin",
      "source_url",
      "member_photo_status",
      "rules_accepted_at",
      "uploaded_at",
      "reviewed_at",
      "reviewed_by",
      "rejection_reason",
      "report_count",
      "reporter_ids",
      "last_reported_at",
      "created_at",
      "updated_at",
    ]) {
      expect(cols.has(name), `falta la columna ${name}`).toBe(true);
    }
    const tenant = cols.get("tenant_id")!;
    expect(tenant.nullable).toBe("NO");
    expect(String(tenant.defaultValue)).toBe("1");
    expect(cols.get("rules_accepted_at")!.nullable).toBe("YES");
    expect(cols.get("source_url")!.nullable).toBe("YES");
    expect(cols.get("reporter_ids")!.nullable).toBe("YES");
    expect(cols.get("rejection_reason")!.nullable).toBe("YES");
    expect(cols.get("storage_key")!.nullable).toBe("NO");
  });

  it("member_photo_status tiene los 6 estados", async () => {
    const values = await enumValues("member_photos", "member_photo_status");
    expect(values).toEqual([
      "pendiente",
      "aprobada",
      "rechazada",
      "quitada",
      "reemplazada",
      "fallida",
    ]);
  });

  it("member_photos tiene las 3 FKs nombradas", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT CONSTRAINT_NAME AS name, REFERENCED_TABLE_NAME AS referenced
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as [FkRow[], unknown];
    const byName = new Map(rows.map((r) => [r.name, r.referenced]));
    expect(byName.get("fk_member_photos_tenant")).toBe("tenants");
    expect(byName.get("fk_member_photos_user")).toBe("users");
    expect(byName.get("fk_member_photos_reviewed_by")).toBe("users");
  });

  it("member_photos no tiene indices UNIQUE salvo la PK", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT DISTINCT INDEX_NAME AS name, NON_UNIQUE AS nonUnique
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'`,
    )) as [IndexRow[], unknown];
    const unique = rows
      .filter((r) => Number(r.nonUnique) === 0)
      .map((r) => r.name);
    expect(unique).toEqual(["PRIMARY"]);
    const names = rows.map((r) => r.name);
    expect(names).toContain("idx_member_photos_tenant_status_uploaded");
    expect(names).toContain("idx_member_photos_tenant_user_status");
  });

  it("guard estatico: ningun comentario SQL contiene punto y coma", () => {
    for (const file of [AURA_SQL, PHOTOS_SQL]) {
      const offenders = readFileSync(file, "utf8")
        .split("\n")
        .filter(
          (line) => line.trimStart().startsWith("--") && line.includes(";"),
        );
      expect(offenders, file).toEqual([]);
    }
  });
});
