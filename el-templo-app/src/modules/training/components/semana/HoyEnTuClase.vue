<template>
  <!-- Sin la vista de anatomía todavía no hay rótulos de grupo: la hoja ya muestra "Cargando…" -->
  <section v-if="lineas !== null" class="hoy-clase">
    <p class="hoy-clase__kicker">{{ kicker }}</p>

    <template v-if="lineas.length > 0">
      <p v-for="l in lineas" :key="l.id" class="hoy-clase__linea">
        <b class="hoy-clase__rotulo">{{ l.rotulo }}:</b> {{ l.nombres.join(SEPARADOR_NOMBRES) }}
      </p>
    </template>
    <p v-else class="hoy-clase__vacio">{{ vacio }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * Fase 200 D17 (sketch 021) + revisión 2026-10-23 (sketch 024 a · B, sin pills): "Hoy en tu clase", arriba
 * de la hoja de Tus músculos en Entrenar. Texto liviano sobre la hoja blanca, SIN toque (lo que se toca
 * son los ejercicios de abajo): una línea por grupo con los nombres de las RUTAS que trabajan la zona
 * en TODOS los bloques del día, sin repetir ("Hace el movimiento en: Front Lever · Muscle Up"). Los
 * bloques sin ruta suman "Movilidad en: …" o "También la trabaja: …". Las frases de los grupos salen
 * de `vista.grupos[].frase` del store, así el texto sigue al API. No calcula zonas: lee `block.zoneHits`
 * (D20) y la agregación vive en `../../utils/hoyEnTuClase.ts`.
 */
import { computed } from 'vue'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import { useAnatomyStore } from 'src/modules/anatomy/stores/anatomyStore'
import type { Block } from '../../types/session'
import {
  frasesDeGrupos,
  resumenHoyEnTuClase,
  SEPARADOR_NOMBRES,
  type LineaHoy,
} from '../../utils/hoyEnTuClase'

const props = defineProps<{
  /** Slug de la zona tocada */
  zona: ZoneSlug
  blocks: Block[]
  /** "Hoy en tu clase" (hoy) o "En esta clase" (otro día) */
  kicker: string
  /** Texto cuando ningún bloque trabaja la zona */
  vacio: string
}>()

const store = useAnatomyStore()

/** `null` = todavía no cargó la vista de anatomía (no hay rótulos de grupo). */
const lineas = computed<LineaHoy[] | null>(() => {
  const frases = frasesDeGrupos(store.vista?.grupos)
  return frases ? resumenHoyEnTuClase(props.blocks, props.zona, frases) : null
})
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

// Texto sobre la hoja blanca, separado de lo de la zona por una línea
.hoy-clase {
  margin: 6px 0 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid $pd-light-line;
}

.hoy-clase__kicker {
  @include pd-role-label;
  margin: 0 0 8px;
  font-size: 11.5px;
  letter-spacing: 0.1em;
}

.hoy-clase__linea {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 15px;
  line-height: 1.45;
  color: $pd-ink;

  & + & {
    margin-top: 6px;
  }
}

.hoy-clase__rotulo {
  font-weight: 600;
}

.hoy-clase__vacio {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: $pd-ink-2;
}
</style>
