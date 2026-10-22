<template>
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    persistent
    @show="figureReady = true"
    @hide="figureReady = false"
  >
    <div class="cq-root cq-sheet" role="dialog" aria-label="Sesión guardada">
      <h2 class="cq-display cq-sheet__title">Guardado</h2>
      <p class="cq-ital cq-sheet__lead">{{ lead }}</p>

      <!-- BodyFigure mide con getBBox: se monta recién con el diálogo ya visible -->
      <CqBodyMap
        v-if="figureReady && zones > 0"
        :primary="lighting?.primary ?? []"
        :secondary="lighting?.secondary ?? []"
        :gender="gender"
        :height="200"
      />

      <div v-for="item in calibration" :key="item.exerciseId" class="cq-card cq-sheet__calib">
        <div class="cq-sheet__calib-text">{{ calibrationText(item) }}</div>
        <div v-if="canResolve(item)" class="cq-sheet__calib-actions">
          <button
            type="button"
            class="cq-small cq-small--fill"
            :disabled="resolving"
            @click="emit('resolve', item.exerciseId, true)"
          >
            Aceptar
          </button>
          <button
            type="button"
            class="cq-small"
            :disabled="resolving"
            @click="emit('resolve', item.exerciseId, false)"
          >
            Ahora no
          </button>
        </div>
      </div>

      <CqCloudButton label="Listo" :disabled="resolving" @click="emit('done')" />
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { isZoneSlug } from 'src/components/anatomy/zones'
import type { CalibrationProposal, Lighting } from '../../types'
import CqBodyMap from '../CqBodyMap.vue'
import CqCloudButton from '../brand/CqCloudButton.vue'

// El diálogo se monta fuera de .cq-root (teleport): la hoja lleva su propia raíz con los tokens.
// Fase 201 D-13 a, S12-4: la hoja de después de Guardar. Muestra la figura con lo que se encendió
// hoy (sin números de series ni porcentajes ni rojo) y, por cada ejercicio con propuesta de
// calibración, "Aceptar" o "Ahora no". "Listo" cierra la hoja (la página vuelve a Inicio).
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    lighting: Lighting | null
    calibration: CalibrationProposal[]
    gender: string | null
    resolving?: boolean
  }>(),
  { resolving: false },
)

const emit = defineEmits<{
  resolve: [exerciseId: number, accept: boolean]
  done: []
}>()

const figureReady = ref(false)

/** Zonas distintas que la figura sabe dibujar. */
const zones = computed(() => {
  const all = [...(props.lighting?.primary ?? []), ...(props.lighting?.secondary ?? [])]
  return new Set(all.filter(isZoneSlug)).size
})

const lead = computed(() => {
  if (zones.value === 0) return 'Tu sesión quedó registrada.'
  return zones.value === 1 ? 'Hoy trabajaste 1 zona' : `Hoy trabajaste ${zones.value} zonas`
})

/** Solo se puede aceptar o rechazar si el API propone mover el ejercicio y hay a dónde. */
function canResolve(item: CalibrationProposal): boolean {
  return item.proposal !== 'quedarse' && item.toRungName !== null
}

function calibrationText(item: CalibrationProposal): string {
  if (item.proposal === 'quedarse') return `${item.exerciseName}: quedate en ${item.fromRungName}`
  if (item.toRungName === null) {
    return item.proposal === 'subir'
      ? `${item.exerciseName}: ya estás en la más difícil`
      : `${item.exerciseName}: ya estás en la más fácil`
  }
  const verb = item.proposal === 'subir' ? 'subir a' : 'bajar a'
  return `Tu primera sesión de ${item.exerciseName} propone ${verb} ${item.toRungName}`
}
</script>

<style scoped lang="scss">
.cq-sheet {
  --cq-pad-x: 22px;
  --cq-pad-bottom: 22px;

  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 460px;
  max-height: 92vh;
  overflow-y: auto;
  padding: 24px var(--cq-pad-x) var(--cq-pad-bottom);
  border-radius: 20px 20px 0 0;
  background: linear-gradient(180deg, var(--cq-sky2), var(--cq-sky1));
  border: 1px solid var(--cq-hair);
  border-bottom: 0;

  &__title {
    text-align: center;
    font-size: 30px;
  }

  &__lead {
    margin: 0;
    text-align: center;
    font-size: 19px;
  }

  &__calib {
    gap: 10px;
  }

  &__calib-text {
    font-size: 14px;
    color: var(--cq-cream);
  }

  &__calib-actions {
    display: flex;
    gap: 8px;

    button {
      flex: 1;
    }
  }
}
</style>
