<template>
  <q-layout>
    <q-page-container>
      <q-page :class="['login-page', { 'login-page--exiting': isExiting }]">
        <!-- Background layers -->
        <div class="bg-texture"></div>
        <div class="bg-glow"></div>
        <div class="bg-vignette"></div>

        <!-- Dust particles -->
        <div class="dust-field">
          <div v-for="n in 40" :key="n" :class="`dust dust--${n}`"></div>
        </div>

        <div class="login-container">
          <!-- Logo -->
          <div class="logo-scene">
            <img src="/logo.webp" alt="El Templo" class="logo-img" />
            <div class="ember ember--1"></div>
            <div class="ember ember--2"></div>
            <div class="ember ember--3"></div>
            <div class="ember ember--4"></div>
            <div class="ember ember--5"></div>
          </div>

          <!-- Welcome with candle flames -->
          <div class="welcome-row">
            <p class="brand-welcome">Bienvenido al Templo</p>
          </div>
          <p class="brand-subtitle text-elegance">{{ dailyPhrase }}</p>

          <!-- Login Card -->
          <div class="login-card">
            <q-form @submit="onSubmit" class="q-gutter-y-md">
              <q-input
                v-model="email"
                type="email"
                label="Email"
                :rules="emailRules"
                lazy-rules
                dark
                outlined
                label-color="cream"
                input-class="text-cream"
                color="primary"
              />

              <q-input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                label="Contraseña"
                :rules="passwordRules"
                lazy-rules
                dark
                outlined
                label-color="cream"
                input-class="text-cream"
                color="primary"
              >
                <template v-slot:append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    :class="[
                      'cursor-pointer',
                      'text-cream',
                      'eye-icon',
                      { 'eye-icon--bounce': eyeBounce },
                    ]"
                    @click="togglePassword"
                  />
                </template>
              </q-input>

              <q-btn
                type="submit"
                label="Entrar"
                :loading="loading"
                class="full-width enter-btn"
                unelevated
                no-caps
              />
            </q-form>

            <p class="motivational-hint text-elegance">{{ motivationalHint }}</p>

            <div class="card-links">
              <router-link to="/register" class="card-link"> Crear cuenta </router-link>
              <span class="card-link-separator">·</span>
              <a href="#" class="card-link" @click.prevent> ¿Olvidaste tu contraseña? </a>
            </div>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/useAuthStore'

const router = useRouter()
const $q = useQuasar()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const eyeBounce = ref(false)
const isExiting = ref(false)
const flameState = ref<'normal' | 'intensify' | 'dim'>('normal')
const loginFailed = ref(false)

// Rotating daily phrases
const phrases = [
  'Disciplina. Fuerza. Evolución.',
  'Forja tu mejor versión.',
  'La constancia construye templos.',
  'Entrena con propósito.',
  'Tu cuerpo es tu templo.',
]

const dailyPhrase = computed(() => {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  )
  return phrases[dayOfYear % phrases.length]
})

// Motivational hint — changes after failed login
const failMessages = [
  'El progreso no es lineal. Intentá de nuevo.',
  'Cada caída fortalece. Volvé a intentar.',
  'La disciplina no se rinde.',
]

const motivationalHint = computed(() => {
  if (!loginFailed.value) return 'Tu progreso empieza hoy.'
  const idx = Math.floor(Math.random() * failMessages.length)
  return failMessages[idx]
})

const emailRules = [
  (val: string) => !!val || 'El email es requerido',
  (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || 'Email inválido',
]

const passwordRules = [(val: string) => !!val || 'La contraseña es requerida']

function togglePassword() {
  showPassword.value = !showPassword.value
  eyeBounce.value = true
  setTimeout(() => {
    eyeBounce.value = false
  }, 300)
}

async function onSubmit() {
  loading.value = true
  loginFailed.value = false
  try {
    await authStore.login(email.value, password.value)

    // Flames intensify on success
    flameState.value = 'intensify'

    $q.notify({
      type: 'positive',
      message: 'Bienvenido',
    })

    // "Enter the Temple" transition
    isExiting.value = true
    await new Promise((resolve) => setTimeout(resolve, 800))
    router.push('/')
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } } }

    // Flames dim on error
    flameState.value = 'dim'
    loginFailed.value = true
    setTimeout(() => {
      flameState.value = 'normal'
    }, 1500)

    $q.notify({
      type: 'negative',
      message: axiosError?.response?.data?.error || 'Error al iniciar sesión',
    })
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
// =========================================================================
// Brand tokens
// =========================================================================
$terracotta: #c07a56;
$amber: #d4a843;
$bronze: #d4b896;
$cream: #f2ede5;
$charcoal: #2e2a26;
$charcoal-mid: #3d3732;

// =========================================================================
// Page layout
// =========================================================================
.login-page {
  background-color: $charcoal !important;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: opacity 0.8s ease;

  &--exiting {
    opacity: 0;
  }
}

// Background photo — visible fresco, vignette does the darkening
.bg-texture {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: url('/bar-train2.webp') center center / cover no-repeat;
  filter: saturate(0.2) sepia(0.6) contrast(1.1);
  opacity: 0.45;
  pointer-events: none;
}

// Warm breathing radial glow — firelight on the walls
.bg-glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(
    ellipse at 50% 40%,
    rgba($terracotta, 0.12) 0%,
    rgba($amber, 0.06) 25%,
    rgba($charcoal-mid, 0.03) 50%,
    transparent 75%
  );
  animation: bg-breathe 6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes bg-breathe {
  0%,
  100% {
    opacity: 0.7;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

// Vignette — heavy edges, transparent center lets the image show
.bg-vignette {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(
    ellipse at 50% 45%,
    transparent 20%,
    rgba(0, 0, 0, 0.25) 50%,
    rgba(0, 0, 0, 0.55) 75%,
    rgba(0, 0, 0, 0.8) 100%
  );
  pointer-events: none;
}

.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
  position: relative;
  z-index: 2;
}

// =========================================================================
// Dust particles — ambient temple atmosphere
// =========================================================================
.dust-field {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.dust {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba($bronze, 0.3);
  animation: dust-float linear infinite;
}

@keyframes dust-float {
  0% {
    opacity: 0;
    transform: translateY(0) translateX(0);
  }

  10% {
    opacity: 1;
  }

  90% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateY(-100vh) translateX(var(--drift));
  }
}

// Each particle has unique position, timing, and drift
.dust--1 {
  left: 8%;
  bottom: -5%;
  --drift: 20px;
  animation-duration: 14s;
  animation-delay: 0s;
}

.dust--2 {
  left: 22%;
  bottom: -8%;
  --drift: -15px;
  animation-duration: 18s;
  animation-delay: 2s;
}

.dust--3 {
  left: 35%;
  bottom: -3%;
  --drift: 25px;
  animation-duration: 16s;
  animation-delay: 5s;
}

.dust--4 {
  left: 50%;
  bottom: -10%;
  --drift: -10px;
  animation-duration: 20s;
  animation-delay: 1s;
}

.dust--5 {
  left: 65%;
  bottom: -6%;
  --drift: 18px;
  animation-duration: 15s;
  animation-delay: 7s;
}

.dust--6 {
  left: 78%;
  bottom: -4%;
  --drift: -22px;
  animation-duration: 17s;
  animation-delay: 3s;
}

.dust--7 {
  left: 90%;
  bottom: -7%;
  --drift: 12px;
  animation-duration: 19s;
  animation-delay: 9s;
}

.dust--8 {
  left: 15%;
  bottom: -9%;
  --drift: -18px;
  animation-duration: 22s;
  animation-delay: 4s;
}

.dust--9 {
  left: 42%;
  bottom: -2%;
  --drift: 30px;
  animation-duration: 13s;
  animation-delay: 6s;
}

.dust--10 {
  left: 58%;
  bottom: -11%;
  --drift: -8px;
  animation-duration: 21s;
  animation-delay: 8s;
}

.dust--11 {
  left: 72%;
  bottom: -5%;
  --drift: 14px;
  animation-duration: 16s;
  animation-delay: 10s;
}

.dust--12 {
  left: 5%;
  bottom: -8%;
  --drift: -25px;
  animation-duration: 18s;
  animation-delay: 12s;
}

.dust--13 {
  left: 30%;
  bottom: -6%;
  --drift: 16px;
  animation-duration: 15s;
  animation-delay: 1.5s;
}

.dust--14 {
  left: 48%;
  bottom: -4%;
  --drift: -20px;
  animation-duration: 19s;
  animation-delay: 3.5s;
}

.dust--15 {
  left: 82%;
  bottom: -9%;
  --drift: 10px;
  animation-duration: 16s;
  animation-delay: 5.5s;
}

.dust--16 {
  left: 12%;
  bottom: -3%;
  --drift: -14px;
  animation-duration: 20s;
  animation-delay: 7.5s;
}

.dust--17 {
  left: 55%;
  bottom: -7%;
  --drift: 22px;
  animation-duration: 14s;
  animation-delay: 2.5s;
}

.dust--18 {
  left: 68%;
  bottom: -10%;
  --drift: -12px;
  animation-duration: 17s;
  animation-delay: 9.5s;
}

.dust--19 {
  left: 38%;
  bottom: -5%;
  --drift: 28px;
  animation-duration: 21s;
  animation-delay: 11s;
}

.dust--20 {
  left: 85%;
  bottom: -2%;
  --drift: -18px;
  animation-duration: 15s;
  animation-delay: 0.5s;
}

.dust--21 {
  left: 3%;
  bottom: -7%;
  --drift: 15px;
  animation-duration: 16s;
  animation-delay: 1s;
}

.dust--22 {
  left: 18%;
  bottom: -4%;
  --drift: -22px;
  animation-duration: 19s;
  animation-delay: 6s;
}

.dust--23 {
  left: 27%;
  bottom: -9%;
  --drift: 8px;
  animation-duration: 14s;
  animation-delay: 3s;
}

.dust--24 {
  left: 33%;
  bottom: -2%;
  --drift: -16px;
  animation-duration: 21s;
  animation-delay: 8s;
}

.dust--25 {
  left: 44%;
  bottom: -6%;
  --drift: 24px;
  animation-duration: 17s;
  animation-delay: 0s;
}

.dust--26 {
  left: 52%;
  bottom: -11%;
  --drift: -9px;
  animation-duration: 15s;
  animation-delay: 4.5s;
}

.dust--27 {
  left: 61%;
  bottom: -3%;
  --drift: 19px;
  animation-duration: 20s;
  animation-delay: 10s;
}

.dust--28 {
  left: 70%;
  bottom: -8%;
  --drift: -13px;
  animation-duration: 18s;
  animation-delay: 2s;
}

.dust--29 {
  left: 76%;
  bottom: -5%;
  --drift: 26px;
  animation-duration: 13s;
  animation-delay: 7s;
}

.dust--30 {
  left: 88%;
  bottom: -10%;
  --drift: -20px;
  animation-duration: 16s;
  animation-delay: 11s;
}

.dust--31 {
  left: 95%;
  bottom: -4%;
  --drift: 11px;
  animation-duration: 22s;
  animation-delay: 1.5s;
}

.dust--32 {
  left: 10%;
  bottom: -12%;
  --drift: -7px;
  animation-duration: 19s;
  animation-delay: 5s;
}

.dust--33 {
  left: 24%;
  bottom: -1%;
  --drift: 21px;
  animation-duration: 15s;
  animation-delay: 9s;
}

.dust--34 {
  left: 40%;
  bottom: -8%;
  --drift: -17px;
  animation-duration: 17s;
  animation-delay: 3.5s;
}

.dust--35 {
  left: 46%;
  bottom: -3%;
  --drift: 13px;
  animation-duration: 20s;
  animation-delay: 6.5s;
}

.dust--36 {
  left: 57%;
  bottom: -9%;
  --drift: -24px;
  animation-duration: 14s;
  animation-delay: 12s;
}

.dust--37 {
  left: 64%;
  bottom: -6%;
  --drift: 9px;
  animation-duration: 18s;
  animation-delay: 0.8s;
}

.dust--38 {
  left: 73%;
  bottom: -2%;
  --drift: -15px;
  animation-duration: 21s;
  animation-delay: 4s;
}

.dust--39 {
  left: 81%;
  bottom: -7%;
  --drift: 17px;
  animation-duration: 16s;
  animation-delay: 8.5s;
}

.dust--40 {
  left: 92%;
  bottom: -5%;
  --drift: -11px;
  animation-duration: 19s;
  animation-delay: 2.5s;
}

// =========================================================================
// Keyframes
// =========================================================================
@keyframes ember-pulse {
  0%,
  100% {
    filter: brightness(0.9) drop-shadow(0 0 8px rgba($terracotta, 0.4));
  }

  50% {
    filter: brightness(1.1) drop-shadow(0 0 18px rgba($amber, 0.6));
  }
}

@keyframes ember-rise-wide {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(1);
  }

  15% {
    opacity: 0.7;
  }

  100% {
    opacity: 0;
    transform: translate(var(--dx), -70px) scale(0.2);
  }
}

@keyframes eye-bounce {
  0% {
    transform: scale(1);
  }

  40% {
    transform: scale(1.3);
  }

  100% {
    transform: scale(1);
  }
}

// =========================================================================
// Logo scene — Ember Glow
// =========================================================================

.logo-img {
  position: relative;
  z-index: 2;
  width: 150px;
  height: auto;
  display: block;
  animation: ember-pulse 2.5s ease-in-out infinite;
}

// Floating embers around logo
.ember {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: $amber;
  z-index: 3;
}

.ember--1 {
  bottom: 60%;
  left: 15%;
  --dx: -12px;
  animation: ember-rise-wide 3s ease-out infinite;
}

.ember--2 {
  bottom: 50%;
  right: 18%;
  --dx: 15px;
  animation: ember-rise-wide 2.8s ease-out infinite 0.6s;
}

.ember--3 {
  bottom: 70%;
  left: 40%;
  --dx: -5px;
  animation: ember-rise-wide 3.5s ease-out infinite 1.2s;
}

.ember--4 {
  bottom: 45%;
  left: 60%;
  --dx: 10px;
  animation: ember-rise-wide 2.6s ease-out infinite 0.3s;
}

.ember--5 {
  bottom: 55%;
  left: 25%;
  --dx: -8px;
  animation: ember-rise-wide 3.2s ease-out infinite 1.8s;
}

// =========================================================================
// Logo area
// =========================================================================
.logo-scene {
  position: relative;
  margin-bottom: 8px;

  // Dark halo behind logo for visibility
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 140%;
    height: 160%;
    background: radial-gradient(
      ellipse,
      rgba($charcoal, 0.85) 0%,
      rgba($charcoal, 0.55) 40%,
      transparent 70%
    );
    z-index: 0;
    pointer-events: none;
  }
}

// =========================================================================
// Welcome row with candle flames
// =========================================================================
.welcome-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.brand-welcome {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.35rem;
  letter-spacing: 0.08em;
  color: $cream;
  margin: 0;
  text-align: center;
  white-space: nowrap;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

// =========================================================================
// Brand subtitle
// =========================================================================
.brand-subtitle {
  color: rgba($cream, 0.5);
  font-size: 0.95rem;
  margin: 0 0 32px 0;
  text-align: center;
}

// =========================================================================
// Login Card
// =========================================================================
.login-card {
  width: 100%;
  background: rgba($charcoal-mid, 0.85);
  border-top: 2px solid rgba($terracotta, 0.6);
  border-radius: 8px;
  padding: 28px 24px 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

// Input premium feel — inner shadow + smooth focus
.login-card :deep(.q-field__control) {
  border-color: rgba($cream, 0.15);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.25);
  transition:
    box-shadow 0.3s ease,
    border-color 0.3s ease;
}

.login-card :deep(.q-field--outlined .q-field__control:before) {
  border-color: rgba($cream, 0.2);
  transition: border-color 0.3s ease;
}

.login-card :deep(.q-field--outlined:hover .q-field__control:before) {
  border-color: rgba($cream, 0.35);
}

.login-card :deep(.q-field--outlined.q-field--focused .q-field__control) {
  box-shadow:
    inset 0 1px 4px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba($terracotta, 0.3);
}

.login-card :deep(.q-field--outlined.q-field--focused .q-field__control:before) {
  border-color: $terracotta;
}

.login-card :deep(.q-field__label) {
  color: rgba($cream, 0.5);
  transition:
    color 0.3s ease,
    transform 0.3s ease;
}

.login-card :deep(.q-field--float .q-field__label) {
  color: rgba($cream, 0.7);
}

.text-cream {
  color: $cream !important;
}

// Eye icon microinteraction
.eye-icon {
  transition: transform 0.3s ease;
}

.eye-icon--bounce {
  animation: eye-bounce 0.3s ease;
}

// Enter button — ritual action
.enter-btn {
  background: linear-gradient(135deg, $terracotta 0%, darken($terracotta, 8%) 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition:
    box-shadow 0.3s ease,
    transform 0.2s ease;

  &:hover {
    box-shadow:
      0 4px 24px rgba($terracotta, 0.5),
      0 0 40px rgba($terracotta, 0.15);
    transform: scale(1.02);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}

// Motivational hint below form
.motivational-hint {
  text-align: center;
  color: rgba($cream, 0.35);
  font-size: 0.8rem;
  margin: 16px 0 0 0;
}

// Card links (register + forgot password)
.card-links {
  text-align: center;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba($cream, 0.08);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.card-link {
  color: rgba($cream, 0.45);
  text-decoration: none;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  transition: color 0.2s ease;

  &:hover {
    color: $terracotta;
  }
}

.card-link-separator {
  color: rgba($cream, 0.2);
  font-size: 0.8rem;
}
</style>
