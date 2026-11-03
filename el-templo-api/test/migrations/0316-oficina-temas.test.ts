/**
 * Fase 205 Plan 01: migracion 0316 (Oficina, central de temas de gestion).
 *
 *  - D-01: cuatro tablas gym-owned `office_*` que nacen strict.
 *  - D-04: `office_topics.source_key` unico por tenant.
 *  - D-05: `office_topic_events.payload` es JSON.
 *  - D-06: `office_mentions` cuelga de `office_topic_events` con CASCADE.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";

const OFFICE_TABLES = [
  "office_mentions",
  "office_topic_events",
  "office_topic_reads",
  "office_topics",
];

interface ColumnRow extends RowDataPacket {
  tableName: string;
  columnName: string;
  isNullable: string;
  dataType: string;
}

interface IndexRow extends RowDataPacket {
  indexName: string;
  nonUnique: number;
  seqInIndex: number;
  columnName: string;
}

interface FkRow extends RowDataPacket {
  deleteRule: string;
  referencedTable: string;
}

describe("Migracion 0316 — tablas office_*", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("0316: las 4 tablas existen y tienen tenant_id NOT NULL", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName,
              COLUMN_NAME AS columnName,
              IS_NULLABLE AS isNullable,
              DATA_TYPE AS dataType
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('office_mentions', 'office_topic_events', 'office_topic_reads', 'office_topics')
          AND COLUMN_NAME = 'tenant_id'`,
    )) as [ColumnRow[], unknown];
    expect(rows.map((r) => r.tableName).sort()).toEqual(OFFICE_TABLES);
    for (const row of rows) {
      expect(row.isNullable, `${row.tableName}.tenant_id`).toBe("NO");
    }
  });

  it("0316: uq_office_topics_tenant_source es unica y arranca por tenant_id", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT INDEX_NAME AS indexName,
              NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'office_topics'
          AND INDEX_NAME = 'uq_office_topics_tenant_source'
        ORDER BY SEQ_IN_INDEX`,
    )) as [IndexRow[], unknown];
    expect(rows.length).toBe(2);
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
    expect(rows.map((r) => r.columnName)).toEqual(["tenant_id", "source_key"]);
  });

  it("0316: toda UNIQUE de las 4 tablas arranca por tenant_id", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName,
              INDEX_NAME AS indexName,
              NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('office_mentions', 'office_topic_events', 'office_topic_reads', 'office_topics')
          AND NON_UNIQUE = 0
          AND INDEX_NAME <> 'PRIMARY'
          AND SEQ_IN_INDEX = 1`,
    )) as [(IndexRow & { tableName: string })[], unknown];
    // topics (source), reads (topic+user), mentions (event+user).
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.columnName, `${row.tableName}.${row.indexName}`).toBe(
        "tenant_id",
      );
    }
  });

  it("0316: office_topic_events.payload es json", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName,
              COLUMN_NAME AS columnName,
              IS_NULLABLE AS isNullable,
              DATA_TYPE AS dataType
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'office_topic_events'
          AND COLUMN_NAME = 'payload'`,
    )) as [ColumnRow[], unknown];
    expect(rows.length).toBe(1);
    expect(rows[0].dataType).toBe("json");
    expect(rows[0].isNullable).toBe("YES");
  });

  it("0316: office_mentions tiene FK a office_topic_events con DELETE CASCADE", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT DELETE_RULE AS deleteRule,
              REFERENCED_TABLE_NAME AS referencedTable
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'office_mentions'
          AND REFERENCED_TABLE_NAME = 'office_topic_events'`,
    )) as [FkRow[], unknown];
    expect(rows.length).toBe(1);
    expect(rows[0].deleteRule).toBe("CASCADE");
  });
});
