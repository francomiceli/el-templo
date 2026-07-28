/**
 * Fase 169 Plan 08 (CON-03): el `tenant_id` no entra por el borde.
 *
 * QUÉ PRUEBA ESTE ARCHIVO
 * -----------------------
 * Dos cosas distintas, en dos `describe` separados:
 *
 * 1. **Guard de mass-assignment (D-08).** Los 6 —y únicos— sitios de `src/`
 *    que spreadean el body de un request enumeran su superficie con
 *    `additionalProperties: false`. El guard importa los 6 objetos de schema y
 *    lo afirma. Es la mitigación de la REGRESIÓN, no del bug: la auditoría de
 *    la fase 169 encontró el repo casi limpio, y lo que faltaba era algo que
 *    se pusiera rojo cuando alguien lo aflojara.
 *
 * 2. **Batería D-09** (agregada por el Task 2 de este mismo plan): mandar
 *    `tenantId` en el body de una ruta de escritura clave no cambia el
 *    `tenant_id` de la fila creada.
 *
 * POR QUÉ EL GUARD ES POR IMPORT Y NO POR GREP
 * --------------------------------------------
 * Un `grep -c 'additionalProperties: false'` sobre el archivo del schema da
 * verde de mentira por dos caminos independientes:
 *
 *   (a) cuenta la palabra cuando aparece en un COMENTARIO — y estos schemas
 *       están llenos de comentarios que explican por qué el body va cerrado
 *       (incluido el docblock que este mismo plan le agregó a
 *       `createMemberSchema`);
 *   (b) cuenta la palabra cuando está en un SUB-SCHEMA anidado y no en la raíz
 *       del `body`. `createTransactionSchema` y `createCampaignSchema` tienen
 *       las dos cosas: un `additionalProperties: false` adentro de
 *       `links.items` / `copySlots` y otro en la raíz. Un grep no distingue
 *       cuál de los dos encontró, y el que importa es el de la raíz: es el que
 *       acota lo que el handler spreadea.
 *
 * Importar el objeto y leer `body.additionalProperties` es la única forma de
 * afirmar exactamente la propiedad que protege el spread.
 *
 * QUÉ HACER CUANDO ESTE GUARD SE CAIGA
 * ------------------------------------
 * **No borrar la aserción ni sumar el schema a una excepción.** El fallo dice
 * que una ruta que spreadea su body dejó de acotar qué acepta. Decidir
 * conscientemente:
 *
 *   - Si esa ruta NO puede aceptar propiedades libres (el caso normal):
 *     devolver el `additionalProperties: false` a la raíz de su `body`.
 *   - Si de verdad tiene que aceptarlas: entonces **dejar de spreadear el
 *     body** en el handler y enumerar los campos que el service necesita. Un
 *     body abierto y un spread son compatibles de a uno, nunca juntos.
 *
 * Si aparece un sitio de spread NUEVO que no está en la tabla de abajo, va al
 * guard con su schema. La tabla es el inventario conocido, no un límite.
 *
 * REGLA DEL MILESTONE QUE ESTO DEFIENDE
 * -------------------------------------
 * `src/db/schema/tenant-column.ts:11-16`: el valor de `tenant_id` SALE SIEMPRE
 * DEL SERVIDOR (`scope.tenantId` / `TenantContext`), JAMÁS de un payload, de
 * una query string ni del JWT. Mismo contrato que el precedente de
 * `members/routes.ts:766` ("Phase 114 D-31: createdBy comes from the JWT,
 * never the request body"), un escalón más arriba.
 *
 * Este `describe` NO toca la base de datos: es introspección de objetos
 * importados. Corre igual bajo el `setupFiles` del repo (que provisiona la DB
 * por worker para TODO archivo de test).
 */
import { describe, it, expect } from "vitest";

import {
  createMemberSchema,
  createTrialMemberSchema,
} from "../../src/modules/members/schemas";
import { rescheduleTrialSchema } from "../../src/modules/scheduling/schemas";
import { createTransactionSchema } from "../../src/modules/finance/schemas";
import { createCampaignSchema } from "../../src/modules/campaigns/schemas";
import { createProductSchema } from "../../src/modules/gladius/routes";

/**
 * Forma mínima que el guard necesita ver de un body-schema.
 *
 * `additionalProperties` es OPCIONAL y `unknown` a propósito: así un schema
 * que no la declare compila igual y la aserción es la que lo rechaza
 * (`undefined !== false`). Tiparlo como `false` obligatorio movería el fallo
 * al compilador, que suena mejor pero es peor: `tsc` no corre en el mismo gate
 * que la suite y el mensaje sería "no asignable" en vez de "el sitio X quedó
 * abierto".
 */
type BodySchema = {
  readonly body: { readonly additionalProperties?: unknown };
};

/**
 * Inventario D-08 — los 6 sitios de `src/` que spreadean el body de un
 * request, con el schema que los protege.
 *
 * Verificado sobre el worktree de la fase con
 * `grep -rn "\.\.\.request\.body" --include=*.ts src/`, que da exactamente
 * estos 6. El `<verify>` del plan 169-08 exige que ese conteo siga siendo 6:
 * un sitio nuevo rompe el plan y obliga a decidir en vez de colarse.
 */
const SITIOS_QUE_SPREADEAN_EL_BODY: ReadonlyArray<{
  schemaName: string;
  spreadSite: string;
  schema: BodySchema;
}> = [
  {
    schemaName: "createMemberSchema",
    spreadSite:
      "src/modules/members/routes.ts:650-655 — createMember({ ...request.body, createdBy, referredBy })",
    schema: createMemberSchema,
  },
  {
    schemaName: "createTrialMemberSchema",
    spreadSite:
      "src/modules/members/routes.ts:765-768 — createTrialMember({ ...request.body, createdBy })",
    schema: createTrialMemberSchema,
  },
  {
    schemaName: "rescheduleTrialSchema",
    spreadSite:
      "src/modules/scheduling/routes.ts:635-638 — rescheduleTrial({ bookingId, ...request.body })",
    schema: rescheduleTrialSchema,
  },
  {
    schemaName: "createTransactionSchema",
    spreadSite:
      "src/modules/finance/routes.ts:310 — transactionService.create({ ...request.body, validationStatus })",
    schema: createTransactionSchema,
  },
  {
    schemaName: "createCampaignSchema",
    spreadSite:
      "src/modules/campaigns/routes.ts:187 — service.create({ ...request.body, country })",
    schema: createCampaignSchema,
  },
  {
    schemaName: "createProductSchema",
    spreadSite:
      "src/modules/gladius/routes.ts:185-188 — createProduct({ ...request.body, country })",
    schema: createProductSchema,
  },
];

describe("guard de mass-assignment (D-08)", () => {
  it.each(SITIOS_QUE_SPREADEAN_EL_BODY)(
    "$schemaName acota su body con additionalProperties: false",
    ({ schemaName, spreadSite, schema }) => {
      expect(
        schema.body.additionalProperties,
        `${schemaName} dejó de declarar \`additionalProperties: false\` en la RAÍZ de su body, ` +
          `y ese schema es lo único que acota el spread de ${spreadSite}. ` +
          `Con el body abierto, una propiedad desconocida —\`tenantId\` la primera— viaja entera ` +
          `hasta el service. Regla del milestone: el gimnasio sale SIEMPRE del servidor, jamás del ` +
          `payload (src/db/schema/tenant-column.ts:11-16). ` +
          `Arreglo: devolvele el \`additionalProperties: false\` a la raíz del body, o —si esa ruta ` +
          `de verdad tiene que aceptar propiedades libres— dejá de spreadear el body en el handler ` +
          `y enumerá los campos. No borres esta aserción.`,
      ).toBe(false);
    },
  );

  it("el inventario cubre los 6 sitios de spread conocidos", () => {
    // Sanity del propio guard: si alguien borra una entrada de la tabla, el
    // `it.each` de arriba simplemente corre una vez menos y nadie se entera.
    // Este conteo es lo que hace ruidosa esa pérdida.
    expect(
      SITIOS_QUE_SPREADEAN_EL_BODY.length,
      "El inventario D-08 dejó de tener 6 entradas. Si aparecio un sitio de spread nuevo " +
        "(`grep -rn '\\.\\.\\.request\\.body' --include=*.ts src/`), sumalo acá con su schema. " +
        "Si desaparecio uno, sacalo — pero verificá primero que la ruta haya dejado de spreadear " +
        "el body y no que alguien haya borrado la entrada para que el guard deje de molestar.",
    ).toBe(6);

    const nombres = SITIOS_QUE_SPREADEAN_EL_BODY.map((s) => s.schemaName);
    expect(new Set(nombres).size, "hay schemas repetidos en el inventario").toBe(
      nombres.length,
    );
  });
});
