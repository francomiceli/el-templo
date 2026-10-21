<template>
  <!-- Fase 197 D-15 (pantalla 1): inicio del bloque libre. Hermano de los pop-ups (sketch 010 A):
       marco con degradé, línea luminosa y `pd-cta` "Empezar". Sketch 016. -->
  <div class="fb-overlay" role="dialog" aria-modal="true" :aria-labelledby="titleId">
    <PremiumDialogCard :kicker="kicker">
      <div class="fb-body">
        <h2 :id="titleId" class="fb-title">{{ blockDisplayName(block) }}</h2>
        <p class="fb-meta">{{ metaLine }}</p>

        <span class="fb-chip" :class="{ 'fb-chip--off': !auraAvailable }">
          <template v-if="auraAvailable">
            <q-icon name="auto_awesome" size="16px" aria-hidden="true" />
            +5 AURA al completarlo
          </template>
          <template v-else>Ya sumaste tu AURA de hoy</template>
        </span>

        <figure class="fb-quote">
          <blockquote class="fb-quote__text">
            {{ quote.text }}<span v-if="quote.goldText" class="fb-quote__hl">{{
              quote.goldText
            }}</span>
          </blockquote>
          <figcaption class="fb-quote__author">&mdash; {{ quote.author }}</figcaption>
        </figure>

        <div class="pd-acts">
          <button ref="startBtn" type="button" class="pd-cta" @click="emit('start')">
            Empezar
          </button>
          <button type="button" class="fb-link" @click="emit('back')">Volver</button>
        </div>
      </div>
    </PremiumDialogCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import type { Quote } from '../../data/quotes'
import type { FreeBlockItem } from '../../types/free-blocks'
import { blockDisplayName, formatLabel, keepHyphenWords } from '../../utils/blockMeta'
import { formatLevelName } from '../../utils/levelDisplay'

interface Props {
  /** Bloque elegido en Libre */
  block: FreeBlockItem
  /** Nivel del socio (ej. "sigma") */
  level: string
  /** false si ya cobró el AURA del bloque libre hoy */
  auraAvailable: boolean
  /** Cita de bienvenida */
  quote: Quote
}

interface Emits {
  (e: 'start'): void
  (e: 'back'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const titleId = `fb-splash-title-${useId()}`
const startBtn = ref<HTMLButtonElement | null>(null)

// Foco inicial en el CTA: el diálogo es modal.
onMounted(() => {
  startBtn.value?.focus()
})

const kicker = computed(() => `Bloque libre · Nivel ${formatLevelName(props.level)}`)

const metaLine = computed(() => {
  const n = props.block.exercises.length
  const count = `${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`
  const label = formatLabel(props.block)
  return keepHyphenWords(label ? `${label} · ${count}` : count)
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.fb-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(30, 24, 18, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

// El kicker lo pinta PremiumDialogCard alineado a la izquierda: acá va centrado.
.fb-overlay :deep(.pd-kicker) {
  text-align: center;
}

.fb-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  text-align: center;
}

.fb-title {
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 28px;
  line-height: 1.15;
  color: $pd-cream;
  overflow-wrap: anywhere;
}

.fb-meta {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-cream-3;
}

.fb-chip {
  @include pd-chip-aura(dark, true);

  &--off {
    @include pd-chip-aura(dark, false);
  }
}

.fb-quote {
  margin: 4px 0 0;
  padding: 0;
}

.fb-quote__text {
  margin: 0;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  font-size: 17px;
  line-height: 1.4;
  color: $pd-cream-2;
}

// D-18: el dorado es solo de AURA. El tramo destacado de la cita va en crema, más pesado.
.fb-quote__hl {
  font-weight: 600;
  color: $pd-cream;
}

.fb-quote__author {
  margin-top: 6px;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-cream-3;
}

.fb-body .pd-acts {
  align-self: stretch;
  margin-top: 4px;
}

.fb-link {
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: $pd-cream-2;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
</style>
