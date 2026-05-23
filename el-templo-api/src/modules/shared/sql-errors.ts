/**
 * Helpers to detect specific MySQL errors after Drizzle has wrapped them.
 * Drizzle puts the real MySQL error in `err.cause`.
 */

export function isDuplicateKeyError(err: unknown): {
  isDuplicate: boolean;
  detail: string;
} {
  if (!(err instanceof Error)) return { isDuplicate: false, detail: "" };

  const cause = err.cause as Record<string, unknown> | undefined;
  const causeCode = typeof cause?.code === "string" ? cause.code : "";
  const causeSqlMessage =
    typeof cause?.sqlMessage === "string" ? cause.sqlMessage : "";
  const causeMessage = cause instanceof Error ? cause.message : causeSqlMessage;

  const isDuplicate =
    causeCode === "ER_DUP_ENTRY" ||
    causeSqlMessage.includes("Duplicate entry") ||
    causeMessage.includes("Duplicate entry") ||
    err.message.includes("Duplicate entry");

  const detail = causeSqlMessage || causeMessage || err.message;

  return { isDuplicate, detail };
}
