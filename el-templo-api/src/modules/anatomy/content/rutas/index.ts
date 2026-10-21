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
import { HR } from "./HR";
import type { RutaContenido } from "../../types";

/**
 * Fase 200 (D5, R2): las rutas con su contenido, en el orden del sketch (PUSH,
 * PULL, CORE). El plan 200-05 suma LOWER, MOVILIDAD y FLOW (30 en total).
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
  // CORE
  HR,
];

/** Acceso por código de ruta (el mismo de `ROUTE_PROGRESSION_MAP`). */
export const RUTAS_POR_CODIGO: ReadonlyMap<string, RutaContenido> = new Map(
  RUTAS.map((ruta) => [ruta.code, ruta]),
);
