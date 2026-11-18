<template>
  <!-- Fase 215 (#33): tarjeta de celebración de Aura (boceto 037, variante D). Sale de la ficha de
       Aura del encabezado: tarjeta marfil con filete dorado, flecha hacia la ficha, "+N" en la
       pastilla de la derecha y una línea dorada que se vacía en 5 segundos. No es pantalla completa
       ni pide nada: se va sola, y tocarla abre el detalle de Aura. La anuncia un `aria-live`
       aparte (se rellena después de montar para que se lea una sola vez). -->
  <div class="acc" :class="{ 'acc--in': shown }">
    <span class="acc__arrow" aria-hidden="true" />
    <div class="acc__frame">
      <button
        type="button"
        class="acc__inner"
        :aria-label="`${card.announcement} Ver el detalle`"
        @click="emit('open')"
      >
        <span
          class="acc__face"
          :class="{
            'acc__face--coach': card.face.kind === 'initials' && card.face.coach,
            'acc__face--spark': card.face.kind !== 'initials',
          }"
          aria-hidden="true"
        >
          <template v-if="card.face.kind === 'initials'">{{ card.face.text }}</template>
          <q-icon v-else-if="card.face.kind === 'icon'" :name="card.face.name" size="22px" />
          <template v-else>✦</template>
        </span>
        <span class="acc__msg" aria-hidden="true">
          <template v-for="(segment, i) in card.segments" :key="i">
            <b v-if="segment.bold">{{ segment.text }}</b>
            <template v-else>{{ segment.text }}</template>
          </template>
          <small v-if="card.reasons.length > 0" class="acc__sub">
            <span v-for="reason in card.reasons" :key="reason">{{ reason }}</span>
            <span v-if="card.more">{{ card.more }}</span>
          </small>
        </span>
        <span class="acc__pill" aria-hidden="true">{{ card.pill }} <i>✦</i></span>
        <span class="acc__bar" aria-hidden="true" />
      </button>
    </div>
    <div class="acc__sr" aria-live="polite">{{ announcement }}</div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { CelebrationCardView } from 'src/utils/celebration-view'

const props = defineProps<{
  card: CelebrationCardView
  /** Estado "adentro": el CSS anima la entrada al pasar a true y la salida al volver a false. */
  shown: boolean
}>()

const emit = defineEmits<{
  open: []
}>()

const announcement = ref('')

onMounted(() => {
  void nextTick(() => {
    announcement.value = props.card.announcement
  })
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

// Cuelga del encabezado (`.mth` es `position: relative`), 8 px debajo.
.acc {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  right: 12px;
  left: 12px;
  transform: scale(0.6);
  transform-origin: 85% 0;
  opacity: 0;
  transition:
    transform 0.3s ease-in,
    opacity 0.3s ease-in;
  pointer-events: none;

  &--in {
    transform: none;
    opacity: 1;
    transition:
      transform 0.4s cubic-bezier(0.2, 1.3, 0.4, 1),
      opacity 0.2s;
    pointer-events: auto;
  }
}

.acc__arrow {
  position: absolute;
  z-index: 2;
  top: -6px;
  right: 38px;
  width: 14px;
  height: 14px;
  border-top: 1.5px solid $pd-gold;
  border-left: 1.5px solid $pd-gold;
  border-radius: 3px 0 0;
  background: $pd-aura-ivory-a;
  transform: rotate(45deg);
}

// El filete dorado va solo en el marco, nunca detrás de un texto.
.acc__frame {
  padding: 1.5px;
  border-radius: 18px;
  background: linear-gradient(135deg, #f5dd7e, $pd-gold 55%, #a8843a);
  box-shadow: 0 12px 30px rgba(44, 35, 24, 0.35);
}

.acc__inner {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 12px 14px;
  border: 0;
  border-radius: 16.5px;
  background: linear-gradient(180deg, $pd-aura-ivory-a, $pd-gold-tint);
  color: $pd-ink;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: -4px;
  }
}

.acc__face {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8a5236, #6b3a22);
  box-shadow:
    0 0 0 2px $pd-aura-ivory-a,
    0 0 0 3.5px $pd-gold;
  color: #fff;
  font-family: 'Montserrat', sans-serif;
  font-size: 13.6px;
  font-weight: 700;

  // Profe: carbón. Sin nombre o de una fuente sin cara: marfil con chispa.
  &--coach {
    background: linear-gradient(135deg, #5a4a3a, #3d3732);
  }

  &--spark {
    background: linear-gradient(180deg, $pd-aura-ivory-a, $pd-gold-tint);
    color: $pd-aura-spark;
    font-size: 20px;
  }
}

.acc__msg {
  flex: 1;
  min-width: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;

  b {
    font-weight: 700;
  }
}

.acc__sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  color: $pd-ink-2;

  span {
    display: block;
  }
}

// El "+N" va en la pastilla de la derecha. Tinta sobre tinte: 6.5:1.
.acc__pill {
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  background: $pd-gold-tint;
  box-shadow: inset 0 0 0 1.2px #d9bf74;
  color: $pd-aura-deep;
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;

  i {
    font-style: normal;
    color: $pd-aura-spark;
  }
}

// La línea dorada que se vacía en 5 segundos.
.acc__bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: $pd-gold;
  transform-origin: left;
}

.acc--in .acc__bar {
  animation: acc-drain 5s linear forwards;
}

@keyframes acc-drain {
  to {
    transform: scaleX(0);
  }
}

.acc__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

// Movimiento reducido: aparece y desaparece sin deslizar ni escalar, y la línea queda quieta.
@media (prefers-reduced-motion: reduce) {
  .acc,
  .acc--in {
    transform: none !important;
    transition: opacity 0.2s !important;
  }

  .acc--in .acc__bar {
    animation: none;
  }
}
</style>
