import { BL } from "./BL";
import { HD_ID } from "./HD-ID";
import { OAPU } from "./OAPU";
import { PL } from "./PL";
import { PLPU } from "./PLPU";
import { HS } from "./HS";
import { HSPU } from "./HSPU";
import { PHS } from "./PHS";
import { MU } from "./MU";
import { OAP } from "./OAP";
import { TTB } from "./TTB";
import { FL } from "./FL";
import { FLR } from "./FLR";
import { MN_RP } from "./MN-RP";
import { OAR } from "./OAR";
import { L } from "./L";
import { PS } from "./PS";
import { QC } from "./QC";
import { SS } from "./SS";
import { SU } from "./SU";
import { DS } from "./DS";
import { HT } from "./HT";
import { NC } from "./NC";
import { HR } from "./HR";
import { SPAGAT } from "./SPAGAT";
import { BRIDGE } from "./BRIDGE";
import { SIDE_PCK } from "./SIDE-PCK";
import { PIKE } from "./PIKE";
import { REVERSE_HYPER } from "./REVERSE-HYPER";
import { AF } from "./AF";
import type { RutaContenido } from "../../types";

/**
 * Fase 200 (D5, R2): las 30 rutas de `ROUTE_PROGRESSION_MAP` con su contenido,
 * en el orden del sketch (PUSH, PULL, LOWER, CORE, MOVILIDAD, FLOW). FB queda
 * fuera a propósito: sin ejercicios, la TV pinta el cuerpo entero. Sin PLYO,
 * CARDIO ni KL (D2).
 */
export const RUTAS: readonly RutaContenido[] = [
  // PUSH
  BL,
  HD_ID,
  OAPU,
  PL,
  PLPU,
  HS,
  HSPU,
  PHS,
  // PULL
  MU,
  OAP,
  TTB,
  FL,
  FLR,
  MN_RP,
  OAR,
  // LOWER
  L,
  PS,
  QC,
  SS,
  SU,
  DS,
  HT,
  NC,
  // CORE
  HR,
  // MOVILIDAD
  SPAGAT,
  BRIDGE,
  SIDE_PCK,
  PIKE,
  REVERSE_HYPER,
  // FLOW
  AF,
];

/** Acceso por código de ruta (el mismo de `ROUTE_PROGRESSION_MAP`). */
export const RUTAS_POR_CODIGO: ReadonlyMap<string, RutaContenido> = new Map(
  RUTAS.map((ruta) => [ruta.code, ruta]),
);
