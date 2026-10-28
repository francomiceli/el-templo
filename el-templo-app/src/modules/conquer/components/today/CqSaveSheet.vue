<template>
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    persistent
    @show="figureReady = true"
    @hide="figureReady = false"
  >
    <div class="cq-root cq-sheet" role="dialog" aria-label="Sesión guardada">
      <div class="cq-sheet__scroll">
        <p class="cq-kicker">Guardado</p>
        <h2 class="cq-title">Sesión guardada</h2>

        <!-- BodyFigure mide con getBBox: se monta recién con el diálogo ya visible -->
        <div v-if="figureReady && zones > 0" class="cq-card cq-sheet__fig">
          <CqBodyMap
            :primary="lighting?.primary ?? []"
            :secondary="lighting?.secondary ?? []"
            :gender="gender"
            :height="200"
          />
        </div>
        <p class="cq-sheet__lead">{{ lead }}</p>

        <!-- Anexo §9 `fin_sesion_techo`: los techos los calcula el API, el app solo los muestra -->
        <p
          v-for="item in techo"
          :key="`${item.exerciseName}-${item.step}`"
          class="cq-notice cq-sheet__techo"
        >
          {{ techoText(item) }}
        </p>

        <div v-for="item in calibration" :key="item.exerciseId" class="cq-card cq-sheet__calib">
          <p class="cq-sheet__calib-text">{{ calibrationText(item) }}</p>
          <div v-if="canResolveCalibration(item)" class="cq-sheet__calib-actions">
            <CqButton
              class="cq-sheet__calib-btn"
              label="Aceptar"
              small
              :disabled="resolving"
              @click="emit('resolve', item.exerciseId, true)"
            />
            <CqButton
              class="cq-sheet__calib-btn"
              label="Ahora no"
              variant="secondary"
              small
              :disabled="resolving"
              @click="emit('resolve', item.exerciseId, false)"
            />
          </div>
        </div>
      </div>

      <!-- Fuera del scroll: "Listo" queda siempre a la vista -->
      <div class="cq-sheet__foot">
        <CqButton label="Listo" :disabled="resolving" @click="emit('done')" />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import '../../styles/conquer.scss'
import { isZoneSlug } from 'src/components/anatomy/zones'
import { calibrationText, canResolveCalibration, techoText } from '../../utils/format'
import type { CalibrationProposal, Lighting, SessionTecho } from '../../types'
import CqBodyMap from '../CqBodyMap.vue'
import CqButton from '../brand/CqButton.vue'

// El diálogo se monta fuera de .cq-root (teleport): la hoja lleva su propia raíz con los tokens.
// Fase 201 D-13 a, S12-4, DA-32: la hoja clara de después de Guardar. Muestra la figura en azul noche y
// dorado con lo que se encendió hoy (sin números de series ni porcentajes ni rojo) y, por cada ejercicio con propuesta de
// calibración, "Aceptar" o "Ahora no". "Listo" cierra la hoja (la página vuelve a Inicio).
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    lighting: Lighting | null
    calibration: CalibrationProposal[]
    /** Escalones que llegaron al techo por primera vez (lo manda el API). */
    techo?: SessionTecho[]
    gender: string | null
    resolving?: boolean
  }>(),
  { resolving: false, techo: () => [] },
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
</script>

<style scoped lang="scss">
.cq-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 460px;
  // El contenido scrollea adentro y "Listo" (`__foot`) no se mueve
  max-height: 90vh;
  overflow: hidden;
  border-radius: 20px 20px 0 0;
  background: var(--cq-surface-2);

  &__scroll {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 16px 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  &__foot {
    flex: none;
    padding: 12px 16px 24px;
  }

  &__fig {
    align-items: center;
  }

  &__lead {
    margin: 0;
    text-align: center;
    font-size: 15px;
    font-weight: 600;
    color: var(--cq-night);
  }

  &__techo {
    margin: 0;
    font-size: 14px;
  }

  &__calib-text {
    margin: 0;
    font-size: 14px;
    color: var(--cq-text);
  }

  &__calib-actions {
    display: flex;
    gap: 8px;
  }

  &__calib-btn {
    flex: 1;
  }
}
</style>
