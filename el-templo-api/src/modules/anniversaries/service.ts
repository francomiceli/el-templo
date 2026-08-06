/**
 * Cartelera de aniversarios de permanencia (admin/recepción).
 *
 * Lista, de un pantallazo, los alumnos activos de una sede que cumplen un hito
 * de antigüedad HOY (y opcionalmente MAÑANA como anticipo), para que recepción
 * o el profe los reconozcan sin abrir clase por clase. Superficie de sólo
 * lectura, calculada on-the-fly desde users.createdAt (misma fuente y tolerancia
 * que la línea de la lista de asistencia y el sello de la app).
 */
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { addDays } from "../shared/date-utils";
import { milestoneOnDate } from "../shared/tenure-milestones";

export interface AnniversaryEntry {
  memberId: number;
  memberName: string;
  /** Meses del hito (3, 6, 12, 24, ...). */
  months: number;
  /** Label corto ("6 meses", "1 año"). */
  label: string;
  /** Si el hito cae hoy o mañana (anticipo). */
  when: "today" | "tomorrow";
}

export class AnniversaryService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly log?: FastifyBaseLogger,
  ) {}

  /**
   * Aniversarios de la sede para `today` (y `today+1` si includeTomorrow).
   * `today` es una fecha "YYYY-MM-DD" ya resuelta en la zona horaria de la sede.
   * Orden: primero HOY, y dentro de cada día el hito más grande arriba.
   */
  async getBranchAnniversaries(
    branchId: number,
    opts: { today: string; includeTomorrow?: boolean },
  ): Promise<AnniversaryEntry[]> {
    const { today, includeTomorrow = false } = opts;
    const tomorrow = addDays(today, 1);

    const members = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, "member"),
          eq(schema.users.status, "activo"),
          eq(schema.users.branchId, branchId),
        ),
      );

    const entries: AnniversaryEntry[] = [];
    for (const m of members) {
      const name = [m.firstName, m.lastName].filter(Boolean).join(" ");

      const todayMilestone = milestoneOnDate(m.createdAt, today);
      if (todayMilestone !== null) {
        entries.push({
          memberId: m.id,
          memberName: name,
          months: todayMilestone.months,
          label: todayMilestone.label,
          when: "today",
        });
      }

      if (includeTomorrow) {
        const tomorrowMilestone = milestoneOnDate(m.createdAt, tomorrow);
        if (tomorrowMilestone !== null) {
          entries.push({
            memberId: m.id,
            memberName: name,
            months: tomorrowMilestone.months,
            label: tomorrowMilestone.label,
            when: "tomorrow",
          });
        }
      }
    }

    // Hoy antes que mañana; dentro de cada día, el hito más grande primero.
    const order = { today: 0, tomorrow: 1 };
    entries.sort(
      (a, b) => order[a.when] - order[b.when] || b.months - a.months,
    );
    return entries;
  }
}
