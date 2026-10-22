<template>
  <section class="cq-compare" aria-label="Antes y después">
    <div class="cq-seg cq-compare__tabs" role="tablist" aria-label="Pose">
      <button
        v-for="p in CONQUER_POSES"
        :key="p"
        type="button"
        role="tab"
        class="cq-seg__opt"
        :class="{ 'cq-seg__opt--on': p === pose }"
        :aria-selected="p === pose ? 'true' : 'false'"
        @click="pose = p"
      >
        {{ POSE_LABELS[p] }}
      </button>
    </div>

    <!-- DA-36: la pieza oscura es el marco de las dos hornacinas -->
    <div class="cq-compare__stage cq-dark">
      <figure v-for="side in sides" :key="side.key" class="cq-compare__fig">
        <div class="cq-compare__niche" :class="{ 'cq-compare__niche--now': side.now }">
          <CqCheckPhoto
            :check-id="side.check.id"
            :pose="pose"
            :has-photo="side.check.photos[pose]"
            :alt="`Foto de ${POSE_LABELS[pose].toLowerCase()} del ${shortDate(side.check.checkDate)}`"
          />
        </div>
        <figcaption class="cq-kicker">{{ side.label }}</figcaption>
      </figure>
    </div>

    <div class="cq-card cq-compare__table">
      <div class="cq-compare__row cq-compare__row--head" aria-hidden="true">
        <div class="cq-kicker">MEDIDA</div>
        <span class="cq-kicker">{{ fromHead }}</span>
        <span class="cq-kicker">HOY</span>
        <span class="cq-kicker">CAMBIO</span>
      </div>
      <div v-for="row in rows" :key="row.key" class="cq-compare__row">
        <div class="cq-compare__label">{{ row.label }}</div>
        <span class="cq-num">{{ row.from }}</span>
        <span class="cq-num">{{ row.to }}</span>
        <span class="cq-compare__change cq-num">{{ row.change }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BodyCheckView, CheckComparison, Pose } from '../../types'
import { CONQUER_POSES, POSE_LABELS, fromLabel, measureRows, toLabel } from '../../utils/bodyCheck'
import { shortDate } from '../../utils/format'
import CqCheckPhoto from './CqCheckPhoto.vue'

// Fase 201 §6, §7.1, DA-36 Evolución: día 0 contra el último control, lado a lado en una hornacina
// oscura, con la pose elegida en un segmentado claro. La foto se pide por URL firmada solo para la pose visible
// (cada `CqCheckPhoto` lo hace al mostrarse). Debajo, la tabla MEDIDA / DÍA 0 / HOY / CAMBIO con lo
// que calculó el API: el app no recalcula nada. El CAMBIO sale de `measureRows`, que lo formatea con
// `formatDiff` ("+1,5 cm", "−0,5 cm").
const props = defineProps<{
  compare: CheckComparison
  fromCheck: BodyCheckView
  toCheck: BodyCheckView
}>()

const pose = ref<Pose>('frente')

const sides = computed(() => [
  { key: 'from', check: props.fromCheck, label: fromLabel(props.fromCheck), now: false },
  { key: 'to', check: props.toCheck, label: toLabel(props.compare.weeks), now: true },
])
const rows = computed(() => measureRows(props.compare))
const fromHead = computed(() => (props.fromCheck.kind === 'dia0' ? 'DÍA 0' : 'ANTES'))
</script>

<style scoped lang="scss">
.cq-compare {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

// Las tres pestañas: el segmentado ya trae los 44 px de cada opcion
.cq-compare__tabs {
  width: 100%;
}

// La pieza oscura suelta: marco azul noche con la linea dorada de abajo (`::after` de `.cq-dark`).
// `.cq-compare__stage.cq-dark` mide una clase mas que `.cq-root .cq-dark`.
.cq-compare__stage.cq-dark {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 10px 14px;
  border-radius: 16px;
}

.cq-compare__fig {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  min-width: 0;
  text-align: center;
}

// Hornacina de 226 px: la foto con radio 12 sobre un fondo azul noche un poco mas claro
.cq-compare__niche {
  height: 226px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--cq-night-2);
  background: var(--cq-night-2);

  &--now {
    border-color: var(--cq-on-night-gold);
  }
}

// Rotulo en oscuro: `.cq-root .cq-dark .cq-kicker` (0,3,0) ya lo pone en oro claro
.cq-compare__fig figcaption {
  margin: 0;
  font-size: 11px;
}

// Tabla de medidas en una card clara
.cq-compare__table.cq-card {
  gap: 0;
  padding: 8px 16px;
}

.cq-compare__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 60px 60px 78px;
  gap: 4px;
  align-items: center;
  padding: 9px 0;
  border-top: 1px solid var(--cq-line);

  span {
    text-align: right;
  }

  &--head {
    border-top: 0;

    .cq-kicker {
      font-size: 11px;
      letter-spacing: 0.1em;
    }
  }

  // Valores: `.cq-root .cq-num` (0,2,0) los deja en azul noche, aca van en texto
  .cq-num {
    font-size: 15px;
    color: var(--cq-text);
  }
}

// Nombres largos de medida: la primera columna (60/60/78 px de las otras) cede y parte la palabra
.cq-compare__label {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 15px;
  color: var(--cq-text);
}

.cq-compare__row .cq-compare__change {
  color: var(--cq-text-2);
}
</style>
