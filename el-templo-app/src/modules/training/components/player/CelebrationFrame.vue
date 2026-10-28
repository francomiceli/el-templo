<template>
  <!-- Marco de las celebraciones (fase 197 D-15, pantalla 4): overlay oscuro, card premium con
       kicker, título y un único CTA. Lo usan FreeBlockCelebration (bloque libre) y
       CelebrationScreen (sesión completa); lo del medio (AURA, meta, cita) va por el slot. -->
  <div class="cf-overlay" role="dialog" aria-modal="true" :aria-labelledby="titleId">
    <PremiumDialogCard :kicker="kicker || undefined">
      <div class="cf-body">
        <h2 :id="titleId" class="cf-title">{{ title }}</h2>

        <slot />

        <div class="pd-acts">
          <button ref="ctaBtn" type="button" class="pd-cta" @click="emit('cta')">
            {{ ctaLabel }}
          </button>
        </div>

        <!-- Acción secundaria opcional, como texto ("Volver al último ejercicio") -->
        <button v-if="linkLabel" type="button" class="cf-link" @click="emit('link')">
          {{ linkLabel }}
        </button>
      </div>
    </PremiumDialogCard>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'

interface Props {
  /** Título chico en Cinzel sobre el título ("Bloque libre"); sin él no se muestra */
  kicker?: string
  /** Título grande ("¡Bloque completado!") */
  title: string
  /** Texto del botón principal ("Ver resumen") */
  ctaLabel: string
  /** Texto clickeable debajo del botón; sin él no se muestra */
  linkLabel?: string
}

interface Emits {
  (e: 'cta'): void
  (e: 'link'): void
}

withDefaults(defineProps<Props>(), { kicker: '', linkLabel: '' })
const emit = defineEmits<Emits>()

const titleId = `cf-title-${useId()}`
const ctaBtn = ref<HTMLButtonElement | null>(null)

// Foco inicial en el CTA: el diálogo es modal.
onMounted(() => {
  ctaBtn.value?.focus()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.cf-overlay {
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
.cf-overlay :deep(.pd-kicker) {
  text-align: center;
}

.cf-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  text-align: center;
}

.cf-title {
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 28px;
  line-height: 1.15;
  color: $pd-cream;
}

.cf-body .pd-acts {
  align-self: stretch;
  margin-top: 4px;
}

// Como "Volver al último ejercicio" de la pantalla entre bloques: texto subrayado, sin caja
.cf-link {
  min-height: 44px;
  border: 0;
  background: none;
  color: $pd-cream-2;
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
</style>
