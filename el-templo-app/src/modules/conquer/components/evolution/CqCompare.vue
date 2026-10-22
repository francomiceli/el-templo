<template>
  <section class="cq-compare" aria-label="Antes y después">
    <div class="cq-compare__tabs" role="group" aria-label="Pose">
      <button
        v-for="p in CONQUER_POSES"
        :key="p"
        type="button"
        :aria-pressed="p === pose ? 'true' : 'false'"
        @click="pose = p"
      >
        {{ POSE_LABELS[p] }}
      </button>
    </div>

    <div class="cq-compare__photos">
      <figure v-for="side in sides" :key="side.key" class="cq-compare__fig">
        <div class="cq-compare__niche" :class="{ 'cq-compare__niche--now': side.now }">
          <CqCheckPhoto
            :check-id="side.check.id"
            :pose="pose"
            :has-photo="side.check.photos[pose]"
            :alt="`Foto de ${POSE_LABELS[pose].toLowerCase()} del ${shortDate(side.check.checkDate)}`"
          />
        </div>
        <div class="cq-compare__plinth" :class="{ 'cq-compare__plinth--now': side.now }" />
        <figcaption class="cq-ital" :class="{ 'cq-compare__cap--now': side.now }">
          {{ side.label }}
        </figcaption>
      </figure>
    </div>

    <div class="cq-card cq-compare__table">
      <div class="cq-compare__row cq-compare__row--head" aria-hidden="true">
        <div>MEDIDA</div>
        <span>{{ fromHead }}</span>
        <span>HOY</span>
        <span>CAMBIO</span>
      </div>
      <div v-for="row in rows" :key="row.key" class="cq-compare__row">
        <div>{{ row.label }}</div>
        <span class="cq-sub cq-num">{{ row.from }}</span>
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

// Fase 201 §6, §7.1 Evolución (prototipo `.photos` + `.meas`): día 0 contra el último control, lado
// a lado, con la pose elegida en tabs. La foto se pide por URL firmada solo para la pose visible
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

  &__tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;

    button {
      min-height: 44px;
      border-radius: 10px;
      border: 1px solid var(--cq-hair2);
      background: transparent;
      color: var(--cq-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      cursor: pointer;

      &[aria-pressed='true'] {
        background: var(--cq-sun);
        border-color: var(--cq-sun);
        color: var(--cq-ink);
      }
    }
  }

  &__photos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    text-align: center;
  }

  &__fig {
    margin: 0;
    min-width: 0;
  }

  // Hornacina: arco arriba (prototipo `.ph`)
  &__niche {
    height: 226px;
    overflow: hidden;
    border-radius: 120px 120px 4px 4px;
    border: 1px solid var(--cq-hair2);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));

    &--now {
      border-color: var(--cq-gold);
      box-shadow: 0 0 30px rgba(253, 241, 208, 0.14);
    }
  }

  &__plinth {
    height: 5px;
    margin: 4px 10px 0;
    border-radius: 1px;
    background: var(--cq-gold);
    opacity: 0.55;

    &--now {
      opacity: 1;
    }
  }

  figcaption {
    margin-top: 8px;
  }

  &__cap--now {
    color: var(--cq-gold-hi);
  }

  &__table {
    gap: 0;
    padding-block: 7px;
  }

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 60px 60px 78px;
    gap: 4px;
    padding: 9px 0;
    border-top: 1px solid var(--cq-hair2);
    font-size: 14px;

    span {
      text-align: right;
    }

    &--head {
      border-top: 0;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.2em;
      color: var(--cq-muted);
    }
  }

  &__change {
    color: var(--cq-gold-hi);
    font-weight: 500;
  }
}
</style>
