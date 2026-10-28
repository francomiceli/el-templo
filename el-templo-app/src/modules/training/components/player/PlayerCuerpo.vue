<template>
  <!-- Qué trabaja el ejercicio de ahora: texto a la izquierda y la figura de Tu cuerpo a la derecha -->
  <section v-if="ruta" class="player-cuerpo">
    <div class="player-cuerpo__row">
      <div class="player-cuerpo__txt">
        <p class="player-cuerpo__kicker">Qué trabajás ahora</p>
        <p v-if="ruta.fuerte.length > 0" class="player-cuerpo__line player-cuerpo__line--fuerte">
          {{ musculosResumidos(ruta.fuerte, MAX_FUERTE) }}
          <small>Hace el movimiento</small>
        </p>
        <p
          v-if="ruta.sostiene.length > 0"
          class="player-cuerpo__line player-cuerpo__line--sostiene"
        >
          {{ musculosResumidos(ruta.sostiene, MAX_SOSTIENE) }}
          <small>Sostiene el movimiento</small>
        </p>
      </div>
      <BodyFigure side="both" :lit="[]" :roles="roles" :height="150" class="player-cuerpo__fig" />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Sketch 027 D: debajo del formato y el reloj, los músculos del ejercicio de ahora. La anatomía es
 * por RUTA (fase 200): todos los ejercicios de una ruta se pintan igual. Sin ruta en el modelo
 * (`rutaSlug` null) no se muestra nada.
 */
import { computed, onMounted } from 'vue'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import { useAnatomyStore } from 'src/modules/anatomy/stores/anatomyStore'
import { rolesDeRuta } from 'src/modules/anatomy/utils/rolesDeRuta'
import { MAX_FUERTE, MAX_SOSTIENE, musculosResumidos } from '../../utils/playerCuerpo'

const props = defineProps<{
  /** Slug de la ruta del ejercicio de ahora (`null` = sin ruta en el modelo) */
  rutaSlug: string | null
}>()

const store = useAnatomyStore()

// La vista de anatomía es la misma de la Guía: si ya se cargó no se pide de nuevo
onMounted(() => {
  void store.cargar()
})

const ruta = computed(() => (props.rutaSlug ? store.ruta(props.rutaSlug) : null))

const roles = computed(() => rolesDeRuta(ruta.value))
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.player-cuerpo {
  margin: 10px 16px 0;
}

.player-cuerpo__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

// BodyFigure ocupa todo el ancho por defecto (width: 100%): acá va al costado del texto
.player-cuerpo__row .player-cuerpo__fig {
  flex: none;
  width: auto;
}

.player-cuerpo__txt {
  flex: 1;
  min-width: 0;
}

.player-cuerpo__kicker {
  margin: 0 0 6px;
  font-family: 'Montserrat', sans-serif;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: $pd-ink-2;
}

.player-cuerpo__line {
  position: relative;
  margin: 0 0 7px;
  padding-left: 16px;
  font-size: 13px;
  line-height: 1.3;
  color: $pd-ink;

  // Muestra del color de la figura, como la leyenda de la ficha de ruta
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 3px;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    box-sizing: border-box;
  }

  small {
    display: block;
    font-size: 10.5px;
    color: $pd-ink-2;
  }
}

.player-cuerpo__line--fuerte::before {
  @include fig-lit-swatch;
}

.player-cuerpo__line--sostiene::before {
  background: $fig-sost;
  border: 1px solid $fig-lit2-edge;
}
</style>
