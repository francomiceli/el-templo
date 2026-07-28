/**
 * Fase 169 (CON-04, D-06/D-07) — Tests del helper `--tenant` de los scripts CLI.
 *
 * QUÉ PRUEBA
 * ----------
 * El parser de `--tenant=<id>` y la validación contra la DB que corren ANTES de
 * que un script escriba una sola fila de una tabla gym-owned. Es la última
 * superficie sin request de CON-04: en la línea de comandos no hay `attachScope`
 * ni payload firmado, así que el único dato que decide en qué gimnasio se
 * escribe es un argumento humano — y un typo en ese argumento escribe en el
 * gimnasio de otro (T-169-32/T-169-33).
 *
 * POR QUÉ ES UN TEST UNITARIO Y NO UNO MYSQL-BACKED
 * -------------------------------------------------
 * `requireTenant` recibe una `TenantQueryFn` inyectada — el mismo idioma de
 * `QueryFn` que ya usa `verify-tenant-uniques.ts` — así que todo lo que este
 * archivo afirma se prueba con una función falsa que REGISTRA el SQL y los
 * params recibidos. No se abre ninguna conexión, no se llama a `createTestApp`
 * y el archivo corre en milisegundos. La adaptación real de una `Connection` de
 * mysql2 (`queryFnFromConnection`) es tres líneas sin lógica; lo que tiene
 * reglas es lo que se prueba acá.
 *
 * LAS DOS AFIRMACIONES QUE NO SON OBVIAS
 * --------------------------------------
 * 1. El id viaja PARAMETRIZADO (T-169-34). La aserción es sobre los `params`
 *    capturados y sobre la AUSENCIA del número en el string del SQL — afirmar
 *    sólo "el SQL contiene el id" pasaría en verde con una interpolación.
 * 2. Un gimnasio con `status` distinto de `active` NO corta (D-07). Es un
 *    contrato deliberadamente distinto al de los crons y al del webhook, que sí
 *    filtran sólo activos: el CLI es tooling de operador y tiene que poder
 *    tocar un gimnasio suspendido (export, limpieza). El test afirma las dos
 *    mitades: que resuelve, y que avisa.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTenantArg,
  requireTenant,
  failTenantArg,
  TenantArgError,
  type TenantQueryFn,
} from "../../src/db/scripts/require-tenant";

// ─────────────────────────────────────────────────────────────────────────────
// Doble de la capa de DB
// ─────────────────────────────────────────────────────────────────────────────

interface CallSpy {
  statement: string;
  params: unknown[] | undefined;
}

/**
 * `TenantQueryFn` falsa: registra cada llamada y devuelve las filas que el test
 * le indique. Devolver `[]` es "el tenant no existe".
 */
function fakeQuery(rows: Record<string, unknown>[]): {
  query: TenantQueryFn;
  calls: CallSpy[];
} {
  const calls: CallSpy[] = [];
  const query: TenantQueryFn = async (statement, params) => {
    calls.push({ statement, params });
    return rows;
  };
  return { query, calls };
}

/** Error sintético para poder afirmar sobre `process.exit` sin matar al worker. */
class ProcessExitError extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

describe("parseTenantArg", () => {
  it("acepta la forma --tenant=<id>", () => {
    expect(parseTenantArg(["--tenant=7"])).toBe(7);
  });

  it("acepta la forma --tenant <id>", () => {
    expect(parseTenantArg(["--tenant", "7"])).toBe(7);
  });

  it("encuentra el flag entre otros argumentos", () => {
    expect(parseTenantArg(["--dry-run", "--tenant=12", "--verbose"])).toBe(12);
  });

  it("aborta con exit code 2 cuando el flag no está", () => {
    // Es un error de USO, no de datos: los códigos del repo son 0 OK,
    // 1 discrepancias de datos, 2 error de conexión o de uso
    // (verify-tenant-uniques.ts). Un script que abortara con 1 se confundiría
    // con "corrió y encontró problemas".
    let capturado: unknown;
    try {
      parseTenantArg([]);
    } catch (err: unknown) {
      capturado = err;
    }
    expect(capturado).toBeInstanceOf(TenantArgError);
    expect((capturado as TenantArgError).exitCode).toBe(2);
    // El mensaje tiene que ser accionable: decir el uso correcto.
    expect((capturado as TenantArgError).message).toContain("--tenant=");
  });

  it("aborta cuando el flag viene sin valor", () => {
    expect(() => parseTenantArg(["--tenant"])).toThrow(TenantArgError);
  });

  it("aborta cuando el valor no es un número", () => {
    expect(() => parseTenantArg(["--tenant=abc"])).toThrow(TenantArgError);
  });

  it("aborta cuando el valor no es un entero", () => {
    expect(() => parseTenantArg(["--tenant=1.5"])).toThrow(TenantArgError);
  });

  it("aborta con 0 y con negativos", () => {
    // `tenants.id` es un autoincrement: 0 y los negativos no son ids posibles y
    // atraparlos acá evita una query inútil contra la DB.
    expect(() => parseTenantArg(["--tenant=0"])).toThrow(TenantArgError);
    expect(() => parseTenantArg(["--tenant=-3"])).toThrow(TenantArgError);
  });
});

describe("requireTenant", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve el TenantContext de un gimnasio activo", async () => {
    const { query } = fakeQuery([{ id: 1, status: "active" }]);
    await expect(requireTenant(query, ["--tenant=1"])).resolves.toEqual({
      tenantId: 1,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("aborta nombrando el id cuando el gimnasio no existe", async () => {
    // La validación contra la DB es la mitigación de T-169-33: un typo en el id
    // corta ANTES de escribir nada, en vez de escribir en un gimnasio real ajeno.
    const { query } = fakeQuery([]);
    let capturado: unknown;
    try {
      await requireTenant(query, ["--tenant=42"]);
    } catch (err: unknown) {
      capturado = err;
    }
    expect(capturado).toBeInstanceOf(TenantArgError);
    expect((capturado as TenantArgError).exitCode).toBe(2);
    expect((capturado as TenantArgError).message).toContain("42");
  });

  it("D-07: un gimnasio suspendido resuelve igual, avisando", async () => {
    const { query } = fakeQuery([{ id: 9, status: "suspended" }]);
    await expect(requireTenant(query, ["--tenant=9"])).resolves.toEqual({
      tenantId: 9,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const aviso = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(aviso).toContain("suspended");
    expect(aviso).toContain("9");
  });

  it("D-07: un gimnasio archivado tampoco corta", async () => {
    // Se recorren los DOS estados no activos del enum: un helper que cortara
    // sólo con 'suspended' pasaría un test que probara nada más ese valor.
    const { query } = fakeQuery([{ id: 5, status: "archived" }]);
    await expect(requireTenant(query, ["--tenant=5"])).resolves.toEqual({
      tenantId: 5,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T-169-34: el id viaja parametrizado, no interpolado en el SQL", async () => {
    const { query, calls } = fakeQuery([{ id: 777, status: "active" }]);
    await requireTenant(query, ["--tenant=777"]);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.params).toEqual([777]);
    // La aserción que importa: el número NO está en el string. Sin esta línea,
    // una interpolación (`WHERE id = ${id}`) pasaría el test de arriba igual,
    // porque `params` podría llevar el id además de interpolarlo.
    expect(call.statement).not.toContain("777");
    expect(call.statement).toContain("?");
    expect(call.statement).toContain("tenants");
  });

  it("no consulta la DB si el flag falta (corta antes)", async () => {
    const { query, calls } = fakeQuery([{ id: 1, status: "active" }]);
    await expect(requireTenant(query, [])).rejects.toBeInstanceOf(
      TenantArgError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("failTenantArg", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ProcessExitError(code ?? 0);
    }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sale con 2 ante un error de uso", () => {
    expect(() =>
      failTenantArg(new TenantArgError("falta --tenant=<id>"), "seed-de-prueba"),
    ).toThrow(ProcessExitError);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(String(errorSpy.mock.calls[0]?.[0] ?? "")).toContain(
      "seed-de-prueba",
    );
  });

  it("sale con 1 ante cualquier otro error", () => {
    // 1 es "el script corrió y falló"; 2 queda reservado para "lo invocaste mal".
    expect(() =>
      failTenantArg(new Error("ER_NO_SUCH_TABLE"), "seed-de-prueba"),
    ).toThrow(ProcessExitError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
