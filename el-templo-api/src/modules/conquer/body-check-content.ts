// Módulo: conquer — regla de contenido del control físico (Fase 201 §6, D-15)
//
// Un control "vacío" (fila creada pero sin fotos confirmadas ni medidas) NO
// cuenta como día 0 ni como último control (decisión del orquestador). La regla
// vive acá, en una versión pura (`checkHasContent`) y en su gemela para SQL
// (`checkHasContentSql`): si cambia una, cambia la otra. La reusa 201-12.
import { or, isNotNull, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/** Las 8 columnas que dan contenido a un control (3 fotos, 4 perímetros y peso). */
export interface BodyCheckContentRow {
  photoFrontKey: string | null;
  photoSideKey: string | null;
  photoBackKey: string | null;
  armCm: string | number | null;
  chestCm: string | number | null;
  shouldersCm: string | number | null;
  waistCm: string | number | null;
  weightKg: string | number | null;
}

/** ¿El control tiene al menos una clave de foto o una medida no nula? */
export function checkHasContent(row: BodyCheckContentRow): boolean {
  return (
    row.photoFrontKey !== null ||
    row.photoSideKey !== null ||
    row.photoBackKey !== null ||
    row.armCm !== null ||
    row.chestCm !== null ||
    row.shouldersCm !== null ||
    row.waistCm !== null ||
    row.weightKg !== null
  );
}

/** Fragmento SQL equivalente a `checkHasContent` (columnas calificadas, unidas por OR). */
export function checkHasContentSql(): SQL {
  const t = schema.conquerBodyChecks;
  const condition = or(
    isNotNull(t.photoFrontKey),
    isNotNull(t.photoSideKey),
    isNotNull(t.photoBackKey),
    isNotNull(t.armCm),
    isNotNull(t.chestCm),
    isNotNull(t.shouldersCm),
    isNotNull(t.waistCm),
    isNotNull(t.weightKg),
  );
  // `or` con argumentos definidos nunca devuelve undefined.
  if (!condition) throw new Error("checkHasContentSql: condición vacía");
  return condition;
}
