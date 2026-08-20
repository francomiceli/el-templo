import { eq, and, inArray, gte, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { checkInResponses } from "../../db/schema";
import type * as schema from "../../db/schema";
import { addDays } from "../shared/date-utils";
import {
  VALID_VALUES,
  VALID_BODY_AREAS,
  QUESTION_TYPES,
  type CheckInAnswer,
  type CheckInQuestionType,
  type DayCheckIn,
  type TodayCheckInState,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Diferencia en días entre dos fechas "YYYY-MM-DD" (ambas a medianoche UTC). */
function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000);
}

export class CheckInService {
  constructor(private readonly db: DbInstance) {}

  async submitAnswer(userId: number, answer: CheckInAnswer): Promise<void> {
    const { questionType, value, bodyArea } = answer;

    // Validate questionType
    if (!QUESTION_TYPES.includes(questionType)) {
      throw new Error("Tipo de pregunta invalido");
    }

    // Validate value against allowed values for this question type
    const validValues = VALID_VALUES[questionType];
    if (!validValues || !validValues.includes(value)) {
      throw new Error("Valor invalido para esta pregunta");
    }

    // Soreness-specific body area validation
    let resolvedBodyArea: string | null = null;
    if (questionType === "soreness") {
      if (value === "leve" || value === "moderada") {
        if (!bodyArea || !VALID_BODY_AREAS.includes(bodyArea)) {
          throw new Error(
            "Se requiere zona del cuerpo para molestia leve o moderada",
          );
        }
        resolvedBodyArea = bodyArea;
      }
      // For 'ninguna', bodyArea is always null regardless of what's sent
    }

    // Insert with today's date
    const todayStr = new Date().toISOString().split("T")[0];

    // Check if already answered today — update if so, insert if not
    const existing = await this.db
      .select({ id: checkInResponses.id })
      .from(checkInResponses)
      .where(
        and(
          eq(checkInResponses.userId, userId),
          eq(checkInResponses.questionType, questionType),
          eq(checkInResponses.date, todayStr),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(checkInResponses)
        .set({ value, bodyArea: resolvedBodyArea })
        .where(eq(checkInResponses.id, existing[0].id));
    } else {
      await this.db.insert(checkInResponses).values({
        userId,
        questionType,
        value,
        bodyArea: resolvedBodyArea,
        date: todayStr,
      });
    }
  }

  async getTodayState(userId: number): Promise<TodayCheckInState> {
    const todayStr = new Date().toISOString().split("T")[0];

    const rows = await this.db
      .select({
        questionType: checkInResponses.questionType,
        value: checkInResponses.value,
        bodyArea: checkInResponses.bodyArea,
      })
      .from(checkInResponses)
      .where(
        and(
          eq(checkInResponses.userId, userId),
          eq(checkInResponses.date, todayStr),
        ),
      );

    // Build answers record
    const answers: TodayCheckInState["answers"] = {
      energy: null,
      soreness: null,
      sleep: null,
    };

    for (const row of rows) {
      const qt = row.questionType as CheckInQuestionType;
      answers[qt] = {
        value: row.value,
        bodyArea: row.bodyArea,
      };
    }

    return { answers };
  }

  /**
   * El registro diario más reciente de cada socio dentro de la ventana
   * `[referenceDate - (windowDays-1), referenceDate]` (por defecto 7 días,
   * incluyendo el día de referencia). Devuelve un Map por userId; los socios sin
   * ningún registro en la ventana no aparecen.
   *
   * Lo consumen dos superficies del staff: la línea del alumno en la lista de
   * asistencia del slot y la card "Registros del día" de Horarios. Para cada
   * socio se toma el día MÁS RECIENTE con algún registro y se componen sus tres
   * preguntas de ese día (un socio puede haber registrado solo energía, p. ej.).
   *
   * Seguro entre gimnasios: `userIds` llega ya acotado a un solo gimnasio
   * (miembros de un slot o asistentes de una sede, ambos resueltos con
   * `tenantWhere` aguas arriba), y `users` es tenant-owned, así que filtrar
   * `check_in_responses` por ese conjunto de userId no cruza gimnasios.
   */
  async getRecentForUsers(
    userIds: number[],
    referenceDate: string,
    windowDays = 7,
  ): Promise<Map<number, DayCheckIn>> {
    const result = new Map<number, DayCheckIn>();
    if (userIds.length === 0) return result;

    const from = addDays(referenceDate, -(windowDays - 1));

    const rows = await this.db
      .select({
        userId: checkInResponses.userId,
        questionType: checkInResponses.questionType,
        value: checkInResponses.value,
        bodyArea: checkInResponses.bodyArea,
        date: checkInResponses.date,
      })
      .from(checkInResponses)
      .where(
        and(
          inArray(checkInResponses.userId, userIds),
          gte(checkInResponses.date, from),
          lte(checkInResponses.date, referenceDate),
        ),
      );

    // Fecha más reciente con algún registro, por usuario. Las fechas son
    // "YYYY-MM-DD", así que la comparación lexicográfica es cronológica.
    const latestDateByUser = new Map<number, string>();
    for (const r of rows) {
      const prev = latestDateByUser.get(r.userId);
      if (prev === undefined || r.date > prev) {
        latestDateByUser.set(r.userId, r.date);
      }
    }

    for (const [userId, date] of latestDateByUser) {
      const dayRows = rows.filter(
        (r) => r.userId === userId && r.date === date,
      );
      const byType = new Map(dayRows.map((r) => [r.questionType, r]));
      const soreness = byType.get("soreness");
      result.set(userId, {
        date,
        daysAgo: daysBetween(date, referenceDate),
        energy: byType.get("energy")?.value ?? null,
        soreness: soreness?.value ?? null,
        sorenessBodyArea: soreness?.bodyArea ?? null,
        sleep: byType.get("sleep")?.value ?? null,
      });
    }

    return result;
  }
}
