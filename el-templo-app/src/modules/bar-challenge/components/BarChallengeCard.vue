<template>
  <div class="bar-challenge-card" @click="onCtaTap">
    <div class="bar-challenge-card__inner">
      <!-- Decorative glow + bottom line (reused tokens de UpsellBadge) -->
      <div class="bar-challenge-card__glow" />
      <div class="bar-challenge-card__bottom-line" />

      <!-- Header: chip DESAFÍO + icono -->
      <div class="bar-challenge-card__header">
        <div class="bar-challenge-card__chip">
          <q-icon name="fitness_center" size="12px" class="bar-challenge-card__chip-icon" />
          <span class="bar-challenge-card__chip-text">DESAFÍO AURA</span>
        </div>
      </div>

      <!-- Heading + Body -->
      <h3 class="bar-challenge-card__heading">{{ heading }}</h3>

      <div class="bar-challenge-card__footer">
        <p v-if="body" class="bar-challenge-card__body">{{ body }}</p>
        <button class="bar-challenge-card__cta" type="button" @click.stop="onCtaTap">
          <span class="bar-challenge-card__cta-text">{{ ctaLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Phase 115 — BarChallengeCard
 *
 * Card "Desafío de la Barra" inserted as the first slide of the premium
 * carousel in MiTemplo.vue during the event window (D-05). Reuses 100% of the
 * premium-dark token system from `UpsellBadge.vue` — same shimmer border, same
 * inner gradient, same chip + CTA tokens. The only net-new content is copy +
 * icon + tap-handler routing.
 *
 * Visual states (driven by `userStore.profile.barChallenge*`):
 *
 * | State                            | Heading                                | Body                          | CTA                |
 * | -------------------------------- | -------------------------------------- | ----------------------------- | ------------------ |
 * | not attempted                    | "Aguantá 1:30 colgado de la barra"     | "Mostralo al staff y llevate
 *                                                                              tu premio."                  | "Iniciar desafío"  |
 * | attempted, completed=true        | "Lograste el desafío"                  | "Aguantaste {N}s."            | "Ver mi intento"   |
 * | attempted, completed=false       | "Tu intento quedó"                     | "Aguantaste {N}s."            | "Ver mi intento"   |
 *
 * Tap routing:
 *  - not attempted → `/desafio-barra` (explainer)
 *  - attempted     → `/desafio-barra/resultado` (single-attempt enforcement,
 *                    SPEC R11). The /resultado page reads photoBase64 from
 *                    the store if it's still in memory and surfaces "Compartir
 *                    foto" vs "Sacar foto ahora" CTAs.
 */
import { useRouter } from 'vue-router'

const router = useRouter()

// Post-launch 2026-05-21: la card es siempre el call-to-action inicial. No
// distingue estado de intento previo — los usuarios pueden volver a participar
// ilimitadamente.
const heading = '¿Te animás a colgarte de la barra?'
const body = 'Tenemos una sorpresa para vos'
const ctaLabel = 'Iniciar desafío'

function onCtaTap(): void {
  void router.push('/desafio-barra')
}
</script>

<style lang="scss" scoped>
@keyframes bar-challenge-card-shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes bar-challenge-card-fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bar-challenge-card-pulse-glow {
  0%,
  100% {
    opacity: 0.08;
  }
  50% {
    opacity: 0.18;
  }
}

.bar-challenge-card {
  position: relative;
  border-radius: 18px;
  padding: 1.5px;
  background: linear-gradient(
    135deg,
    rgba(180, 140, 80, 0.15),
    rgba(196, 149, 106, 0.4) 30%,
    rgba(220, 190, 130, 0.6) 50%,
    rgba(196, 149, 106, 0.4) 70%,
    rgba(180, 140, 80, 0.15)
  );
  background-size: 200% 200%;
  animation: bar-challenge-card-shimmer 4s ease-in-out infinite;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bar-challenge-card__inner {
  background: linear-gradient(135deg, #1a1612 0%, #2c2318 50%, #1e1914 100%);
  border-radius: 16.5px;
  padding: 18px;
  position: relative;
  overflow: hidden;
  animation: bar-challenge-card-fade-up 0.6s ease-out both;
}

.bar-challenge-card__glow {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, rgba(196, 149, 106, 0.12) 0%, transparent 70%);
  pointer-events: none;
  animation: bar-challenge-card-pulse-glow 4s ease-in-out infinite;
}

.bar-challenge-card__bottom-line {
  position: absolute;
  bottom: 0;
  left: 22px;
  right: 22px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(196, 149, 106, 0.2) 20%,
    rgba(196, 149, 106, 0.35) 50%,
    rgba(196, 149, 106, 0.2) 80%,
    transparent
  );
}

.bar-challenge-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
}

.bar-challenge-card__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, rgba(196, 149, 106, 0.18), rgba(196, 149, 106, 0.08));
  border: 0.5px solid rgba(196, 149, 106, 0.3);
  border-radius: 20px;
  padding: 4px 12px 4px 8px;
}

.bar-challenge-card__chip-icon {
  color: #c4956a;
  flex-shrink: 0;
}

.bar-challenge-card__chip-text {
  font-size: 10px;
  font-weight: 600;
  color: #c4956a;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.bar-challenge-card__heading {
  font-size: 20px;
  font-weight: 600;
  color: #f0e6d6;
  letter-spacing: 0.3px;
  margin: 12px 0 0;
  animation: bar-challenge-card-fade-up 0.6s ease-out 0.15s both;
  position: relative;
}

.bar-challenge-card__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  position: relative;
}

.bar-challenge-card__body {
  font-size: 12px;
  color: rgba(240, 230, 214, 0.45);
  line-height: 1.855;
  flex: 1;
  margin: 0;
  animation: bar-challenge-card-fade-up 0.6s ease-out 0.25s both;
}

.bar-challenge-card__cta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #c4956a, #a07850);
  border: none;
  border-radius: 10px;
  // UI-SPEC: 44px touch target — operated by staff, sweaty hands
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.25s ease;
  animation: bar-challenge-card-fade-up 0.6s ease-out 0.35s both;
  text-decoration: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  &:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
  &:active {
    transform: translateY(0) scale(0.98);
  }
}

.bar-challenge-card__cta-text {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.3px;
  font-family: 'Montserrat', sans-serif;
}

@media (prefers-reduced-motion: reduce) {
  .bar-challenge-card {
    animation: none;
    background-size: 100% 100%;
  }
  .bar-challenge-card__inner,
  .bar-challenge-card__heading,
  .bar-challenge-card__body,
  .bar-challenge-card__cta {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .bar-challenge-card__glow {
    animation: none;
    opacity: 0.12;
  }
}
</style>
