/**
 * One-time seed script: add onboarding_completion source type to aura_config.
 *
 * Run with: npx tsx scripts/seed-onboarding-aura.ts --tenant=1
 *
 * Idempotente POR GIMNASIO: si la fila ya existe para el gimnasio pedido no hace
 * nada, y correrlo con otro `--tenant` siembra la fila de ESE gimnasio.
 *
 * `--tenant=<id>` es OBLIGATORIO (fase 169, CON-04/D-06): `aura_config` es una
 * tabla gym-owned y este script escribe sin request, así que no hay ningún scope
 * del cual sacar el gimnasio. Hasta la fase 169 caía en el `DEFAULT 1` de la
 * columna sin declararlo — con dos gimnasios, eso escribe en el equivocado sin
 * decir una palabra. Sin el flag el script aborta con exit code 2 antes de tocar
 * la base, y con un id inexistente también (se valida contra `tenants`).
 *
 * Es además el EJEMPLAR de los dos helpers de tenancy en un camino sin request:
 * `tenantWhere` en el SELECT y `tenantValues` en el INSERT.
 */
import "dotenv/config";
import { createSingleConnection } from "../src/db";
import { auraConfig } from "../src/db/schema";
import { and, eq } from "drizzle-orm";
import {
  failTenantArg,
  queryFnFromConnection,
  requireTenant,
} from "../src/db/scripts/require-tenant";
import { tenantValues, tenantWhere } from "../src/modules/shared/tenant";

async function main() {
  const { db, connection } = await createSingleConnection();

  // ANTES de cualquier query: si falta `--tenant` o el gimnasio no existe, esto
  // corta con exit code 2 y no se escribe nada (T-169-32/T-169-33).
  const ctx = await requireTenant(queryFnFromConnection(connection));

  // Check if already exists — `tenantWhere` va como PRIMER término del `and(...)`,
  // que es la convención de todo WHERE sobre tabla gym-owned (doc 03 §3).
  const existing = await db
    .select({ id: auraConfig.id })
    .from(auraConfig)
    .where(
      and(
        tenantWhere(auraConfig, ctx),
        eq(auraConfig.sourceType, "onboarding_completion"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `onboarding_completion aura_config already exists for tenant ${ctx.tenantId}, skipping.`,
    );
  } else {
    // `tenantValues` estampa el gimnasio DESPUÉS del spread de los valores, así
    // que el tenant sale del servidor incluso si alguien agregara un `tenantId`
    // acá adentro (mitigación de mass-assignment, T-169-02).
    await db.insert(auraConfig).values(
      tenantValues(ctx, {
        sourceType: "onboarding_completion" as const,
        defaultAmount: 50,
        description: "AURA reward for completing onboarding quiz",
        isActive: true,
      }),
    );
    console.log(
      `Inserted aura_config row: onboarding_completion (50 AURA) for tenant ${ctx.tenantId}`,
    );
  }

  await connection.end();
  process.exit(0);
}

// `failTenantArg` sale con 2 ante un error de USO (falta el flag, el gimnasio no
// existe) y con 1 ante cualquier otro fallo.
main().catch((err: unknown) => failTenantArg(err, "seed-onboarding-aura"));
