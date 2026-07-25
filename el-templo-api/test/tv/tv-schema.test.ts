/**
 * Integration tests del schema de la pantalla TV (fase 164, plan 01).
 *
 * Cubre los dos invariantes que el schema TS por si solo no garantiza — tsc
 * pasa en verde aunque la DB fisica no coincida, asi que estos casos corren
 * contra MySQL real (eltemplo_test_<POOL_ID>):
 *
 *  - Round-trip de milisegundos en `timer_started_at` (Pitfall 9). Si la
 *    columna quedara en `timestamp` a segundos, MySQL redondea y el timer
 *    arranca hasta 1s adelantado — sobre un tabata de 20s es 5% de error.
 *  - Un unico `tv_class_state` por sede (D-04 / T-164-05): el invariante lo
 *    impone la DB con `uq_tv_class_state_branch`, no el codigo de aplicacion.
 *  - Unicidad de `tv_devices.token_hash`: dos dispositivos no pueden compartir
 *    el mismo secreto.
 *
 * Ademas, por el solo hecho de correr, este archivo prueba que
 * `0189_tv_screen.sql` parsea: la provision de la DB por worker aplica todas
 * las migraciones con el mismo splitter que el runner de produccion.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, todayStr } from "../helpers";
import * as schema from "../../src/db/schema";
import { eq } from "drizzle-orm";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

/**
 * Afirma que la DB rechazo un insert por violacion de unicidad.
 *
 * Drizzle envuelve el error de mysql2: el `message` de la capa de arriba es
 * solo "Failed query: insert into ...", y el `ER_DUP_ENTRY` real queda en
 * `cause`. Asertar sobre el mensaje externo daria un falso verde ante
 * cualquier otro fallo de query.
 */
async function expectDuplicateEntry(run: () => Promise<unknown>) {
  let caught: unknown;
  try {
    await run();
  } catch (err: unknown) {
    caught = err;
  }
  expect(caught, "se esperaba que la DB rechazara el insert").toBeDefined();

  const cause = (caught as { cause?: unknown }).cause;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String((cause as { code: unknown }).code)
      : undefined;
  const causeMessage = cause instanceof Error ? cause.message : "";
  expect(code ?? causeMessage).toMatch(/ER_DUP_ENTRY|Duplicate entry/i);
}

async function createBranch(app: FastifyInstance): Promise<number> {
  const [branch] = await app.db
    .insert(schema.branches)
    .values({
      name: "TV-Schema-Test",
      code: nextSuffix("TVS"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  return branch.id;
}

describe("Fase 164 — schema del TV de sucursal", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("conserva los milisegundos de timer_started_at en el round-trip", async () => {
    const branchId = await createBranch(app);

    // Sello con milisegundos NO nulos: si la columna fuese timestamp a
    // segundos, MySQL redondea y el .123 se pierde.
    const startedAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 123);
    expect(startedAt.getTime() % 1000).toBe(123);

    await app.db.insert(schema.tvClassState).values({
      branchId,
      classDate: todayStr(),
      blockRole: "NUCLEUS",
      level: "alfa",
      timerStatus: "running",
      timerStartedAt: startedAt,
    });

    const [row] = await app.db
      .select()
      .from(schema.tvClassState)
      .where(eq(schema.tvClassState.branchId, branchId))
      .limit(1);

    expect(row).toBeDefined();
    expect(row.timerStartedAt).toBeInstanceOf(Date);
    expect(row.timerStartedAt?.getTime()).toBe(startedAt.getTime());
    expect(row.timerStartedAt!.getTime() % 1000).toBe(123);

    // Defaults del plan que el resto de la fase asume.
    expect(row.screen).toBe("class");
    expect(row.exerciseIndex).toBe(0);
    expect(row.pausedAccumMs).toBe(0);
    expect(row.soundEnabled).toBe(false);
    expect(row.pausedAt).toBeNull();
  });

  it("rechaza un segundo estado de clase para la misma sede (D-04)", async () => {
    const branchId = await createBranch(app);

    await app.db.insert(schema.tvClassState).values({
      branchId,
      classDate: todayStr(),
      blockRole: "INITIUM",
      level: "kairos",
    });

    await expectDuplicateEntry(() =>
      app.db.insert(schema.tvClassState).values({
        branchId,
        classDate: todayStr(),
        blockRole: "NUCLEUS",
        level: "alfa",
      }),
    );

    // La sede sigue con exactamente una fila, la primera.
    const rows = await app.db
      .select()
      .from(schema.tvClassState)
      .where(eq(schema.tvClassState.branchId, branchId));
    expect(rows).toHaveLength(1);
    expect(rows[0].blockRole).toBe("INITIUM");
  });

  it("rechaza dos dispositivos con el mismo token_hash", async () => {
    const branchId = await createBranch(app);
    const tokenHash = "a".repeat(64);

    await app.db.insert(schema.tvDevices).values({
      branchId,
      tokenHash,
      name: "TV Sala 1",
    });

    await expectDuplicateEntry(() =>
      app.db.insert(schema.tvDevices).values({
        branchId,
        tokenHash,
        name: "TV Sala 2",
      }),
    );

    const devices = await app.db
      .select()
      .from(schema.tvDevices)
      .where(eq(schema.tvDevices.branchId, branchId));
    expect(devices).toHaveLength(1);
    expect(devices[0].isActive).toBe(true);
    expect(devices[0].revokedAt).toBeNull();
    expect(devices[0].lastSeenAt).toBeNull();
  });
});
