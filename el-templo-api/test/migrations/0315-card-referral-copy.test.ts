/**
 * Migracion 0315 (2026-10-29): copy nuevo de la tarjeta de invitaciones del inicio
 * (aviso de sistema `card_referral`), alineado con la novedad + push de invitaciones.
 *
 * Mismo contrato que la 0261: solo pisa el copy si sigue con el texto por defecto
 * (el que dejo la 0261), respeta lo editado por el staff y reaplicar es no-op.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";
import { SYSTEM_AVISOS } from "../../src/modules/communications/system-avisos";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const MIG_0315 = path.resolve(
  __dirname,
  "../../src/db/migrations/0315_card_referral_copy_invitaciones.sql",
);

const AVISO_CODE = "card_referral";
// Copy por defecto antes de la 0315 (el que dejo la 0261).
const OLD_TITLE = "Vos decidís cuánto bajás tu cuota";
const OLD_BODY =
  "Invitá a entrenar: cada persona que invites y se sume baja tu cuota.";
const NEW_TITLE = "Invitá a entrenar a tus amigos";
const NEW_BODY =
  "Tienen 3 clases gratis y, si se suman, los dos tienen descuento.";

interface AvisoRow extends RowDataPacket {
  title: string;
  body: string;
  buttonText: string;
  destinationSection: string | null;
  status: string;
}

function readStatements(file: string): string[] {
  const source = readFileSync(file, "utf8");
  // Invariante Fase 103-01: ningun `;` dentro de un comentario `--`.
  const offending = source
    .split("\n")
    .filter((line) => /^\s*--/.test(line) && line.includes(";"));
  expect(offending).toEqual([]);
  const statements = splitSqlStatements(source);
  expect(statements.length).toBe(1);
  return statements;
}

describe("Migracion 0315 — copy de la tarjeta de invitaciones", () => {
  let app: FastifyInstance;
  let statements: string[];
  const avisoSeed = SYSTEM_AVISOS.find((s) => s.code === AVISO_CODE);

  beforeAll(async () => {
    app = await createTestApp();
    statements = readStatements(MIG_0315);
  });

  afterAll(async () => {
    // Deja la fila con el copy del seed (el estado de un deploy sano).
    await setAviso({
      title: avisoSeed?.title ?? "",
      body: avisoSeed?.body ?? "",
      buttonText: avisoSeed?.buttonText ?? "",
    });
    await app.close();
  });

  beforeEach(async () => {
    await setAviso({});
  });

  /** Upsert de la fila del Templo con el copy VIEJO (default de prod) salvo overrides. */
  async function setAviso(
    over: Partial<{ title: string; body: string; buttonText: string }>,
  ): Promise<void> {
    const v = {
      title: OLD_TITLE,
      body: OLD_BODY,
      buttonText: "Invitar",
      ...over,
    };
    await app.dbPool.query(
      `INSERT INTO avisos
         (tenant_id, kind, code, placement, title, body, button_text, destination_type,
          destination_section, frequency_type, status, sort_order)
       VALUES (?, 'system', ?, 'tarjeta', ?, ?, ?, 'app_section', 'referidos', 'every_open', 'active', 2)
       ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body), button_text = VALUES(button_text)`,
      [TENANT_TEMPLO, AVISO_CODE, v.title, v.body, v.buttonText],
    );
  }

  async function readAviso(): Promise<AvisoRow> {
    const [rows] = (await app.dbPool.query(
      `SELECT title, body, button_text AS buttonText, destination_section AS destinationSection, status
       FROM avisos WHERE code = ? AND kind = 'system' AND tenant_id = ?`,
      [AVISO_CODE, TENANT_TEMPLO],
    )) as [AvisoRow[], unknown];
    return { ...rows[0] };
  }

  async function apply(): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      for (const stmt of statements) {
        await conn.query(
          `/* tenant-safe: migracion aplicada tal cual la corre el runner, cambia el copy por clave en todos los gimnasios */ ${stmt}`,
        );
      }
    } finally {
      conn.release();
    }
  }

  it("el seed en codigo y el SQL tienen el mismo texto, byte a byte", () => {
    const sqlText = readFileSync(MIG_0315, "utf8");
    expect(avisoSeed?.title).toBe(NEW_TITLE);
    expect(avisoSeed?.body).toBe(NEW_BODY);
    expect(sqlText).toContain(`'${NEW_TITLE}'`);
    expect(sqlText).toContain(`'${NEW_BODY}'`);
    expect(sqlText).toContain(`'${OLD_TITLE}'`);
    expect(sqlText).toContain(`'${OLD_BODY}'`);
  });

  it("con el texto por defecto: titulo y texto nuevos, boton y destino intactos", async () => {
    await apply();

    const a = await readAviso();
    expect(a.title).toBe(NEW_TITLE);
    expect(a.body).toBe(NEW_BODY);
    expect(a.buttonText).toBe("Invitar");
    expect(a.destinationSection).toBe("referidos");
    expect(a.status).toBe("active");
  });

  it("con el titulo editado por el staff queda intacto", async () => {
    await setAviso({ title: "Sumá a tu gente" });
    const before = await readAviso();

    await apply();

    expect(await readAviso()).toEqual(before);
  });

  it("con solo el texto editado por el staff tambien queda intacto", async () => {
    await setAviso({ body: "Texto propio del staff." });
    const before = await readAviso();

    await apply();

    expect(await readAviso()).toEqual(before);
  });

  it("idempotente: reaplicar no cambia nada", async () => {
    await apply();
    const after = await readAviso();

    await apply();

    expect(await readAviso()).toEqual(after);
  });
});
