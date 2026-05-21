<template>
  <q-page class="bar-challenge-explicacion">
    <div class="bar-challenge-explicacion__content">
      <h1 class="bar-challenge-explicacion__heading">Desafío de la Barra</h1>

      <p class="bar-challenge-explicacion__body">
        Aguantá colgado de la barra por al menos 1:30. Si lo lográs, compartí tu foto etiquetando a
        @eltemplo y mostrásela al staff para llevarte tu premio. Tenés un solo intento.
      </p>

      <ul class="bar-challenge-explicacion__rules">
        <li class="bar-challenge-explicacion__rule">
          <q-icon name="check" size="18px" class="bar-challenge-explicacion__rule-icon" />
          <span>Un solo intento.</span>
        </li>
        <li class="bar-challenge-explicacion__rule">
          <q-icon name="check" size="18px" class="bar-challenge-explicacion__rule-icon" />
          <span>El staff opera el cronómetro.</span>
        </li>
        <li class="bar-challenge-explicacion__rule">
          <q-icon name="check" size="18px" class="bar-challenge-explicacion__rule-icon" />
          <span>
            Para reclamar el premio, mostrá la foto con la etiqueta @eltemplo al staff del local.
          </span>
        </li>
      </ul>

      <button
        class="bar-challenge-explicacion__cta"
        type="button"
        :aria-label="ctaLabel"
        @click="onPrimaryCta"
      >
        <span class="bar-challenge-explicacion__cta-text">{{ ctaLabel }}</span>
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Phase 115 — Explicacion.vue
 *
 * Pantalla explicativa del desafío. Cuerpo (heading + body + 3 rules) siempre
 * visible — sirve de contexto incluso para quien ya intentó. El CTA hace swap
 * según `userStore.profile.barChallengeAttemptedAt` (R11 defensa en
 * profundidad sobre el 409 del backend):
 *
 *  - sin intento previo → "Comenzar" → /desafio-barra/timer
 *  - con intento previo → "Ver mi intento" → /desafio-barra/resultado
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'

defineOptions({ name: 'BarChallengeExplicacion' })

const router = useRouter()
const userStore = useUserStore()

const alreadyAttempted = computed(() => userStore.profile?.barChallengeAttemptedAt != null)

const ctaLabel = computed(() => (alreadyAttempted.value ? 'Ver mi intento' : 'Comenzar'))

function onPrimaryCta(): void {
  if (alreadyAttempted.value) {
    void router.push('/desafio-barra/resultado')
  } else {
    void router.push('/desafio-barra/timer')
  }
}
</script>

<style lang="scss" scoped>
.bar-challenge-explicacion {
  background: #1a1612;
  color: #f0e6d6;
  min-height: 100vh;
  padding: 64px 24px 32px;
}

.bar-challenge-explicacion__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
  margin: 0 auto;
}

.bar-challenge-explicacion__heading {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
  font-family: 'Montserrat', sans-serif;
  color: #f0e6d6;
  margin: 0;
}

.bar-challenge-explicacion__body {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  font-family: 'Geologica', sans-serif;
  color: #f0e6d6;
  margin: 0;
}

.bar-challenge-explicacion__rules {
  list-style: none;
  padding: 0;
  margin: 16px 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bar-challenge-explicacion__rule {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: #f0e6d6;
  font-family: 'Geologica', sans-serif;
}

.bar-challenge-explicacion__rule-icon {
  color: #f0e6d6;
  flex-shrink: 0;
  margin-top: 2px;
}

.bar-challenge-explicacion__cta {
  margin-top: 16px;
  width: 100%;
  background: linear-gradient(135deg, #c4956a, #a07850);
  border: none;
  border-radius: 10px;
  padding: 12px 20px;
  min-height: 44px;
  cursor: pointer;
  transition: all 0.25s ease;
  -webkit-tap-highlight-color: transparent;
  &:hover {
    filter: brightness(1.08);
  }
  &:active {
    transform: scale(0.98);
  }
}

.bar-challenge-explicacion__cta-text {
  font-size: 14px;
  font-weight: 600;
  color: #f0e6d6;
  letter-spacing: 0.3px;
  font-family: 'Montserrat', sans-serif;
}
</style>
