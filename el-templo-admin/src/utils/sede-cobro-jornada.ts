// deploy: redeploy tras CI rojo por test de lifecycle (2026-11-10)
/**
 * Aviso "sede del cobro ≠ sede donde estás" en la PoS (Cobros).
 *
 * Caso Pato 2026-11-07: con la jornada abierta en Moreno cobró $10.000 en
 * efectivo a una alumna de Alberti. La "Sede del cobro" arranca en la sede del
 * SOCIO (CR-CAJA), así que el cobro quedó en la caja de Alberti mientras el
 * billete estaba en Moreno → arqueo de Moreno con +$10.000 sin explicación.
 *
 * La referencia es la JORNADA ABIERTA (dónde está físicamente quien cobra), no
 * `users.branchId`: los profes rotan entre sedes. Sin jornada abierta no hay
 * aviso (gestión cobra a distancia para todas las sedes).
 */
export interface JornadaSede {
  branchId: number;
  branchName: string;
}

export function sedeCobroDistintaDeJornada(
  jornada: JornadaSede | null,
  sedeCobroId: number | null
): boolean {
  if (jornada == null || sedeCobroId == null) return false;
  return jornada.branchId !== sedeCobroId;
}
