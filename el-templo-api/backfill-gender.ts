/**
 * backfill-gender.ts -- Infer gender from existing member first names
 *
 * Uses a curated Argentine/Spanish name dictionary to map first names to male/female.
 * Ambiguous or unknown names are set to 'unspecified'.
 * Only updates users where gender IS NULL (per D-06: null = legacy never asked).
 * Idempotent: safe to re-run (skips already-set users).
 *
 * Usage: npx tsx backfill-gender.ts
 * Works against any environment: local, staging, production (via .env DATABASE_URL).
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { users } from "./src/db/schema";
import { isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

// ── Curated Argentine/Spanish Name Dictionary ─────────────────────────────

const NAME_GENDER_MAP: Record<string, "male" | "female"> = {
  // Female names (common Argentine/Spanish)
  maria: "female",
  ana: "female",
  laura: "female",
  carolina: "female",
  daniela: "female",
  florencia: "female",
  romina: "female",
  sol: "female",
  lucia: "female",
  valeria: "female",
  paula: "female",
  andrea: "female",
  gabriela: "female",
  silvina: "female",
  natalia: "female",
  mariana: "female",
  cecilia: "female",
  victoria: "female",
  agustina: "female",
  camila: "female",
  julieta: "female",
  milagros: "female",
  rocio: "female",
  micaela: "female",
  sofia: "female",
  valentina: "female",
  karen: "female",
  melina: "female",
  brenda: "female",
  daiana: "female",
  yanina: "female",
  noelia: "female",
  vanesa: "female",
  vanessa: "female",
  veronica: "female",
  sandra: "female",
  silvia: "female",
  patricia: "female",
  claudia: "female",
  marta: "female",
  alejandra: "female",
  fernanda: "female",
  eugenia: "female",
  soledad: "female",
  magdalena: "female",
  catalina: "female",
  martina: "female",
  pilar: "female",
  constanza: "female",
  josefina: "female",
  guadalupe: "female",
  abril: "female",
  candela: "female",
  lara: "female",
  aldana: "female",
  tamara: "female",
  cintia: "female",
  cynthia: "female",
  lorena: "female",
  liliana: "female",
  rosa: "female",
  susana: "female",
  graciela: "female",
  elena: "female",
  ines: "female",
  belen: "female",
  celeste: "female",
  clara: "female",
  nadia: "female",
  marina: "female",
  carla: "female",
  debora: "female",
  denise: "female",
  gisela: "female",
  gimena: "female",
  jimena: "female",
  ivana: "female",
  jessica: "female",
  sabrina: "female",
  luciana: "female",
  macarena: "female",
  mayra: "female",
  mercedes: "female",
  myriam: "female",
  miriam: "female",
  monica: "female",
  norma: "female",
  paola: "female",
  priscila: "female",
  romina: "female",
  silvana: "female",
  solange: "female",
  viviana: "female",
  yesica: "female",

  // Male names (common Argentine/Spanish)
  juan: "male",
  carlos: "male",
  martin: "male",
  pablo: "male",
  diego: "male",
  lucas: "male",
  matias: "male",
  nicolas: "male",
  alejandro: "male",
  sebastian: "male",
  gonzalo: "male",
  facundo: "male",
  ignacio: "male",
  santiago: "male",
  agustin: "male",
  francisco: "male",
  maximiliano: "male",
  leandro: "male",
  fernando: "male",
  gabriel: "male",
  andres: "male",
  daniel: "male",
  rodrigo: "male",
  marcos: "male",
  leonardo: "male",
  tomas: "male",
  cristian: "male",
  brian: "male",
  jonathan: "male",
  david: "male",
  jose: "male",
  sergio: "male",
  roberto: "male",
  gustavo: "male",
  jorge: "male",
  raul: "male",
  marcelo: "male",
  oscar: "male",
  miguel: "male",
  pedro: "male",
  alberto: "male",
  hernan: "male",
  mariano: "male",
  emilio: "male",
  mauro: "male",
  ariel: "male",
  ezequiel: "male",
  damian: "male",
  lautaro: "male",
  ramiro: "male",
  ivan: "male",
  axel: "male",
  bruno: "male",
  franco: "male",
  enzo: "male",
  alan: "male",
  kevin: "male",
  nahuel: "male",
  emiliano: "male",
  esteban: "male",
  patricio: "male",
  joaquin: "male",
  felipe: "male",
  guillermo: "male",
  claudio: "male",
  cesar: "male",
  cristopher: "male",
  dario: "male",
  fabian: "male",
  federico: "male",
  gaston: "male",
  hector: "male",
  hugo: "male",
  javier: "male",
  luis: "male",
  manuel: "male",
  maximiliano: "male",
  nestor: "male",
  omar: "male",
  rafael: "male",
  ricardo: "male",
  ruben: "male",
  victor: "male",
  walter: "male",
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract and normalize the first name for dictionary lookup.
 * Handles compound names like "Maria Jose" by taking only the first word.
 * Strips accents and converts to lowercase.
 */
function normalizeFirstName(rawName: string): string {
  return rawName
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const DB_NAME = process.env.DB_NAME || "eltemplo";
  console.log(`\n=== Gender Backfill Script ===`);
  console.log(`Database: ${DB_NAME}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const { db, connection } = await createSingleConnection();

  try {
    // Query all users with NULL gender (legacy members never asked)
    const nullGenderUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
      })
      .from(users)
      .where(isNull(users.gender));

    if (nullGenderUsers.length === 0) {
      console.log("No users with null gender found. Nothing to backfill.");
      return;
    }

    console.log(`Total users with null gender: ${nullGenderUsers.length}\n`);

    // Categorize users by resolved gender
    const maleIds: number[] = [];
    const femaleIds: number[] = [];
    const unspecifiedIds: number[] = [];

    const maleNames = new Set<string>();
    const femaleNames = new Set<string>();
    const unspecifiedNames = new Set<string>();

    for (const user of nullGenderUsers) {
      if (!user.firstName) {
        unspecifiedIds.push(user.id);
        unspecifiedNames.add("(no name)");
        continue;
      }

      const normalized = normalizeFirstName(user.firstName);
      const gender = NAME_GENDER_MAP[normalized];

      if (gender === "male") {
        maleIds.push(user.id);
        maleNames.add(user.firstName);
      } else if (gender === "female") {
        femaleIds.push(user.id);
        femaleNames.add(user.firstName);
      } else {
        unspecifiedIds.push(user.id);
        unspecifiedNames.add(user.firstName);
      }
    }

    // Batch update each group
    if (maleIds.length > 0) {
      await db.execute(
        sql`UPDATE users SET gender = 'male' WHERE id IN (${sql.join(
          maleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    if (femaleIds.length > 0) {
      await db.execute(
        sql`UPDATE users SET gender = 'female' WHERE id IN (${sql.join(
          femaleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    if (unspecifiedIds.length > 0) {
      await db.execute(
        sql`UPDATE users SET gender = 'unspecified' WHERE id IN (${sql.join(
          unspecifiedIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    // Report
    console.log(`=== Gender Backfill Report ===`);
    console.log(
      `Mapped to male: ${maleIds.length} (${[...maleNames].sort().join(", ")})`,
    );
    console.log(
      `Mapped to female: ${femaleIds.length} (${[...femaleNames].sort().join(", ")})`,
    );
    console.log(
      `Set to unspecified: ${unspecifiedIds.length} (${[...unspecifiedNames].sort().join(", ")})`,
    );
    console.log(
      `\nTotal updated: ${maleIds.length + femaleIds.length + unspecifiedIds.length}`,
    );
    console.log(`Done.`);
  } finally {
    await connection.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Backfill failed: ${message}`);
  process.exit(1);
});
