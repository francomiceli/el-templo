<template>
  <section v-if="hits.length > 0" class="hoy-clase">
    <p class="hoy-clase__kicker">{{ kicker }}</p>

    <div v-for="block in hits" :key="block.blockId" class="hoy-clase__bloque">
      <div class="hoy-clase__top">
        <b class="hoy-clase__rol">{{ ROLE_LABELS[block.role] }}</b>
        <span class="hoy-clase__nombre">{{ blockDisplayName(block) }}</span>
      </div>

      <p v-if="detalle(block) !== null" class="hoy-clase__linea">{{ detalle(block) }}</p>
      <p v-for="g in lineasDe(block)" :key="g.id" class="hoy-clase__linea">
        <em class="hoy-clase__grupo">{{ g.rotulo }}:</em> {{ g.nombres }}
      </p>

      <p v-if="primerosEjercicios(block) !== ''" class="hoy-clase__ejercicios">
        {{ primerosEjercicios(block) }}
      </p>
    </div>
  </section>

  <section v-else class="hoy-clase hoy-clase--vacio">
    <p class="hoy-clase__kicker">{{ kicker }}</p>
    <p class="hoy-clase__vacio">{{ vacio }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * Fase 200 D17 (sketch 021, "Hoy en tu clase"): bloque oscuro arriba de la hoja de Tu cuerpo en
 * Entrenar. Por cada bloque de la sesión que trabaja la zona tocada dice qué hace con esos músculos
 * (trabaja fuerte · te sostiene · se estira) y sus primeros ejercicios. No calcula nada de zonas:
 * lee `block.zoneHits`, que el API arma desde el modelo (D20). Los nombres de los músculos salen del
 * store de anatomía; un id que el store no conoce (todavía no cargó) se omite.
 */
import { computed } from 'vue'
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import { useAnatomyStore } from 'src/modules/anatomy/stores/anatomyStore'
import type { GrupoAlumno } from 'src/modules/anatomy/types'
import type { Block } from '../../types/session'
import { blockDisplayName } from '../../utils/blockMeta'

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

// Orden fijo: primero lo que más trabaja
const GRUPOS: readonly { id: GrupoAlumno; rotulo: string }[] = [
  { id: 'fuerte', rotulo: 'Hace el movimiento' },
  { id: 'sostiene', rotulo: 'Sostiene el movimiento' },
  { id: 'estira', rotulo: 'Se estira' },
]

const hits = computed<Block[]>(() => props.blocks.filter((b) => b.zoneHits?.[props.zona]))

/** Línea suelta de los bloques sin detalle por músculo (ROM sin ruta, pliometría...). */
function detalle(block: Block): string | null {
  const hit = block.zoneHits?.[props.zona]
  if (!hit) return null
  if (hit.movilidad) return 'Trabaja la movilidad de esta zona'
  if (hit.sinDetalle) return 'Este bloque trabaja esta zona'
  return null
}

/** Una línea por grupo con músculos; los ids sin nombre en el store se omiten. */
function lineasDe(block: Block): { id: GrupoAlumno; rotulo: string; nombres: string }[] {
  const hit = block.zoneHits?.[props.zona]
  if (!hit || hit.movilidad || hit.sinDetalle) return []
  const lineas: { id: GrupoAlumno; rotulo: string; nombres: string }[] = []
  for (const g of GRUPOS) {
    const nombres = hit[g.id]
      .map((id) => store.musculo(id)?.nombre)
      .filter((n): n is string => typeof n === 'string' && n !== '')
    if (nombres.length > 0) lineas.push({ id: g.id, rotulo: g.rotulo, nombres: nombres.join(', ') })
  }
  return lineas
}

function primerosEjercicios(block: Block): string {
  return block.exercises
    .slice(0, 3)
    .map((e) => e.exerciseName)
    .join(' · ')
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

// Estilo oscuro de la card de hoy (superficie sólida + línea luminosa abajo)
.hoy-clase {
  @include pd-card;
  margin: 10px 0 6px;
  padding: 12px 14px;
  border-radius: 14px;

  &::after {
    content: '';
    @include pd-line;
  }
}

// Sin bloques que trabajen la zona: arena clara, sin línea
.hoy-clase--vacio {
  background: #f3ede4;
  color: $pd-ink-2;

  &::after {
    display: none;
  }
}

.hoy-clase__kicker {
  margin: 0 0 6px;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.hoy-clase--vacio .hoy-clase__kicker {
  color: $pd-terra-ink;
}

.hoy-clase__vacio {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: $pd-ink-2;
}

.hoy-clase__bloque + .hoy-clase__bloque {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #44392c;
}

.hoy-clase__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.hoy-clase__rol {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.hoy-clase__nombre {
  min-width: 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: $pd-cream;
}

.hoy-clase__linea {
  margin: 4px 0 0;
  font-family: 'Geologica', sans-serif;
  font-size: 13.5px;
  line-height: 1.4;
  color: $pd-cream;
}

.hoy-clase__grupo {
  font-style: normal;
  color: $pd-cream-3;
}

.hoy-clase__ejercicios {
  margin: 4px 0 0;
  font-family: 'Geologica', sans-serif;
  font-size: 12.5px;
  line-height: 1.4;
  color: $pd-cream-3;
}
</style>
