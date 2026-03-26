import { eq, and } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { checkInResponses } from "../../db/schema";
import type * as schema from "../../db/schema";
import {
  VALID_VALUES,
  VALID_BODY_AREAS,
  QUESTION_TYPES,
  type CheckInAnswer,
  type CheckInQuestionType,
  type TodayCheckInState,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

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
}
