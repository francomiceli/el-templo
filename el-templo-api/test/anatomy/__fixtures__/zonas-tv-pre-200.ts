/**
 * Pintura de la TV antes de la fase 200: `zonasDelGrupo` del mapeo anterior por
 * categoría sobre todos los ejercicios de cada ruta, catálogo local
 * 2026-10-21. Congelado: no se actualiza.
 *
 * Fuente: columna "TV hoy" de la tabla "Diferencias reales por ruta" de
 * 200-RESEARCH.md (las 30 rutas del modelo).
 */
export const ZONAS_TV_PRE_200: Readonly<Record<string, readonly string[]>> = {
  AF: ["abs", "obliques"],
  BL: ["chest", "deltoids", "triceps", "abs"],
  BRIDGE: ["deltoids", "lower-back", "gluteal"],
  DS: ["lower-back", "gluteal", "hamstring"],
  FL: ["deltoids", "biceps", "trapezius", "upper-back", "abs"],
  FLR: ["deltoids", "biceps", "trapezius", "upper-back"],
  "HD/ID": ["chest", "deltoids", "triceps"],
  HR: ["lower-back", "abs", "obliques", "gluteal"],
  HS: ["deltoids", "triceps", "trapezius", "abs"],
  HSPU: ["deltoids", "triceps", "trapezius"],
  HT: ["lower-back", "gluteal", "hamstring"],
  L: ["gluteal", "quadriceps", "adductors"],
  "MN/RP": ["deltoids", "triceps", "biceps", "trapezius", "upper-back", "abs"],
  MU: ["biceps", "forearm", "upper-back"],
  NC: ["lower-back", "gluteal", "hamstring"],
  OAP: ["biceps", "forearm", "upper-back"],
  OAPU: ["chest", "deltoids", "triceps"],
  OAR: ["deltoids", "biceps", "trapezius", "upper-back"],
  PHS: ["deltoids", "triceps", "trapezius", "abs"],
  PIKE: ["lower-back", "abs", "gluteal", "hamstring"],
  PL: ["chest", "deltoids", "triceps", "abs"],
  PLPU: ["chest", "deltoids", "triceps"],
  PS: ["gluteal", "quadriceps", "adductors"],
  QC: ["gluteal", "quadriceps", "adductors"],
  "REVERSE HYPER": ["lower-back", "gluteal"],
  "SIDE PCK": ["abs", "obliques", "gluteal", "hamstring"],
  SPAGAT: ["quadriceps", "hamstring", "adductors"],
  SS: ["gluteal", "quadriceps", "adductors"],
  SU: ["lower-back", "gluteal", "quadriceps", "hamstring", "adductors"],
  TTB: ["biceps", "forearm", "upper-back", "abs", "obliques"],
};
