<template>
  <!--
    Olvidé mi contraseña (código de 6 dígitos por mail, 2026-09-15).
    Dos pasos en la misma pantalla: (1) pedir el código con el email,
    (2) tipear el código + contraseña nueva. Sin link ni deep link a
    propósito: en iOS los Universal Links están deshabilitados, y un código
    tipeado funciona igual en Android, iOS y web.
    Al terminar hace el login normal con la contraseña nueva, así el socio
    queda adentro sin volver a la pantalla de login.
  -->
  <q-layout>
    <q-page-container>
      <q-page class="forgot-page">
        <div class="bg-vignette"></div>

        <div class="forgot-container">
          <img src="/logo.webp" alt="El Templo" class="logo-img" />
          <p class="brand-welcome">Recuperá tu contraseña</p>
          <p class="brand-subtitle text-elegance">
            {{
              step === 'email'
                ? 'Te mandamos un código por mail para elegir una nueva.'
                : 'Ingresá el código que te llegó por mail.'
            }}
          </p>

          <div class="forgot-card">
            <!-- Paso 1: pedir el código -->
            <q-form v-if="step === 'email'" class="q-gutter-y-md" @submit="onRequestCode">
              <q-input
                v-model="email"
                type="email"
                label="Email"
                :rules="emailRules"
                lazy-rules
                dark
                outlined
                autocomplete="email"
                label-color="cream"
                input-class="text-cream"
                color="primary"
              />

              <q-btn
                type="submit"
                label="Enviar código"
                :loading="loading"
                class="full-width enter-btn"
                unelevated
                no-caps
              />
            </q-form>

            <!-- Paso 2: código + contraseña nueva -->
            <q-form v-else class="q-gutter-y-md" @submit="onResetPassword">
              <p class="sent-hint">
                Si <strong>{{ email }}</strong> está registrado, te llegó un código de 6 dígitos.
                Vence en {{ CODE_TTL_MINUTES }} minutos. Revisá también la carpeta de spam.
              </p>

              <q-input
                v-model="code"
                label="Código de 6 dígitos"
                inputmode="numeric"
                mask="######"
                unmasked-value
                :rules="codeRules"
                lazy-rules
                dark
                outlined
                autocomplete="one-time-code"
                label-color="cream"
                input-class="text-cream code-input"
                color="primary"
              />

              <q-input
                v-model="newPassword"
                :type="showPassword ? 'text' : 'password'"
                label="Nueva contraseña"
                :rules="passwordRules"
                lazy-rules
                dark
                outlined
                autocomplete="new-password"
                label-color="cream"
                input-class="text-cream"
                color="primary"
              >
                <template #append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer text-cream"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>

              <q-input
                v-model="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                label="Repetir contraseña"
                :rules="confirmRules"
                lazy-rules
                dark
                outlined
                autocomplete="new-password"
                label-color="cream"
                input-class="text-cream"
                color="primary"
              />

              <q-btn
                type="submit"
                label="Cambiar contraseña"
                :loading="loading"
                class="full-width enter-btn"
                unelevated
                no-caps
              />
            </q-form>

            <div class="card-links">
              <template v-if="step === 'email'">
                <a href="#" class="card-link" @click.prevent="goToCodeStep">Ya tengo un código</a>
                <span class="card-link-separator">·</span>
              </template>
              <template v-else>
                <a href="#" class="card-link" @click.prevent="step = 'email'">Pedir otro código</a>
                <span class="card-link-separator">·</span>
              </template>
              <router-link to="/login" class="card-link">Volver a ingresar</router-link>
            </div>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { useAuthStore } from 'stores/useAuthStore'
import { extractError, isExpectedClientError } from 'src/utils/extract-error'
import { createLogger } from 'src/utils/logger'

/** Espejo de PASSWORD_RESET_CODE_TTL_MS de la API (solo para el texto). */
const CODE_TTL_MINUTES = 15

const log = createLogger('ForgotPasswordPage')
const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const authStore = useAuthStore()

type Step = 'email' | 'code'
const step = ref<Step>('email')

// El login manda el email ya tipeado por query para no hacérselo escribir dos veces.
const emailFromQuery = typeof route.query.email === 'string' ? route.query.email : ''
const email = ref(emailFromQuery)
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)

const emailRules = [
  (v: string) => !!v || 'Ingresá tu email',
  (v: string) => /.+@.+\..+/.test(v) || 'Email inválido',
]
const codeRules = [(v: string) => /^[0-9]{6}$/.test(v) || 'Son 6 dígitos']
const passwordRules = [
  (v: string) => !!v || 'Ingresá una contraseña',
  (v: string) => v.length >= 6 || 'Mínimo 6 caracteres',
]
const confirmRules = [(v: string) => v === newPassword.value || 'Las contraseñas no coinciden']

function goToCodeStep() {
  if (!email.value) {
    $q.notify({ type: 'warning', message: 'Primero ingresá tu email' })
    return
  }
  step.value = 'code'
}

async function onRequestCode() {
  loading.value = true
  try {
    // La API responde 200 exista o no el email (anti-enumeración): el paso 2
    // se muestra siempre y el texto lo dice en condicional.
    await api.post('/auth/forgot-password', { email: email.value.trim() })
    step.value = 'code'
  } catch (err: unknown) {
    const message = extractError(err, 'No pudimos enviar el código. Probá de nuevo.')
    if (!isExpectedClientError(err)) {
      log.error('Error requesting password reset code', { error: message })
    }
    $q.notify({ type: 'negative', message })
  } finally {
    loading.value = false
  }
}

async function onResetPassword() {
  loading.value = true
  try {
    await api.post('/auth/reset-password', {
      email: email.value.trim(),
      code: code.value,
      newPassword: newPassword.value,
    })
  } catch (err: unknown) {
    const message = extractError(err, 'Código inválido o vencido')
    if (!isExpectedClientError(err)) {
      log.error('Error resetting password', { error: message })
    }
    $q.notify({ type: 'negative', message })
    loading.value = false
    return
  }

  // Contraseña cambiada: entrar directo con la nueva. Si el login fallara
  // igual (red, etc.) el cambio ya está hecho, así que se manda al login.
  try {
    await authStore.login(email.value.trim(), newPassword.value)
    $q.notify({ type: 'positive', message: 'Contraseña actualizada' })
    await router.replace('/')
  } catch {
    $q.notify({
      type: 'positive',
      message: 'Contraseña actualizada. Ingresá con tu contraseña nueva.',
    })
    await router.replace('/login')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;
$charcoal-mid: #3d3732;

// Misma paleta y tarjeta que LoginPage, sin las partículas ni la foto de
// fondo: es una pantalla utilitaria, no la portada.
.forgot-page {
  background-color: $charcoal !important;
  min-height: var(--app-vh);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.bg-vignette {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(
    ellipse at 50% 45%,
    rgba($terracotta, 0.08) 0%,
    transparent 40%,
    rgba(0, 0, 0, 0.5) 100%
  );
  pointer-events: none;
}

.forgot-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
  position: relative;
  z-index: 2;
}

.logo-img {
  width: 110px;
  height: auto;
  display: block;
  margin-bottom: 16px;
}

.brand-welcome {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.06em;
  color: $cream;
  margin: 0 0 6px 0;
  text-align: center;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

.brand-subtitle {
  color: rgba($cream, 0.5);
  font-size: 0.95rem;
  margin: 0 0 24px 0;
  text-align: center;
}

.forgot-card {
  width: 100%;
  background: rgba($charcoal-mid, 0.85);
  border-top: 2px solid rgba($terracotta, 0.6);
  border-radius: 8px;
  padding: 28px 24px 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.forgot-card :deep(.q-field--outlined .q-field__control:before) {
  border-color: rgba($cream, 0.2);
}

.forgot-card :deep(.q-field--outlined.q-field--focused .q-field__control:before) {
  border-color: $terracotta;
}

.forgot-card :deep(.q-field__label) {
  color: rgba($cream, 0.5);
}

.forgot-card :deep(.code-input) {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.4rem;
  letter-spacing: 0.4em;
  text-align: center;
}

.text-cream {
  color: $cream !important;
}

.sent-hint {
  color: rgba($cream, 0.6);
  font-size: 0.85rem;
  line-height: 1.4;
  margin: 0;

  strong {
    color: rgba($cream, 0.85);
  }
}

.enter-btn {
  background: linear-gradient(135deg, $terracotta 0%, #855038 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

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
