<template>
  <!--
    Olvidé mi contraseña para el staff (código de 6 dígitos por mail,
    2026-09-15). Mismos endpoints que la app de socios. Al terminar vuelve al
    login: el admin exige rol de staff en el login y ahí se valida.
  -->
  <q-layout>
    <q-page-container>
      <q-page class="flex flex-center">
        <q-card style="min-width: 350px; max-width: 420px">
          <q-card-section class="bg-primary text-white">
            <div class="text-h6">Recuperar contraseña</div>
            <div class="text-caption">
              {{
                step === 'email'
                  ? 'Te mandamos un código por mail para elegir una nueva'
                  : 'Ingresá el código que te llegó por mail'
              }}
            </div>
          </q-card-section>

          <q-card-section>
            <q-form v-if="step === 'email'" class="q-gutter-md" @submit="onRequestCode">
              <q-input
                v-model="email"
                label="Email"
                type="email"
                autocomplete="email"
                :rules="[(val) => !!val || 'Email requerido']"
              />
              <div class="flex flex-center">
                <q-btn type="submit" label="Enviar código" color="primary" :loading="loading" />
              </div>
            </q-form>

            <q-form v-else class="q-gutter-md" @submit="onResetPassword">
              <div class="text-body2 text-grey-8">
                Si <strong>{{ email }}</strong> está registrado, te llegó un código de 6 dígitos.
                Vence en {{ CODE_TTL_MINUTES }} minutos. Revisá también la carpeta de spam.
              </div>
              <q-input
                v-model="code"
                label="Código de 6 dígitos"
                inputmode="numeric"
                mask="######"
                unmasked-value
                autocomplete="one-time-code"
                :rules="[(val) => /^[0-9]{6}$/.test(val) || 'Son 6 dígitos']"
              />
              <q-input
                v-model="newPassword"
                label="Nueva contraseña"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :rules="[
                  (val) => !!val || 'Contraseña requerida',
                  (val) => val.length >= 6 || 'Mínimo 6 caracteres',
                ]"
              >
                <template #append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>
              <q-input
                v-model="confirmPassword"
                label="Repetir contraseña"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :rules="[(val) => val === newPassword || 'Las contraseñas no coinciden']"
              />
              <div class="flex flex-center">
                <q-btn
                  type="submit"
                  label="Cambiar contraseña"
                  color="primary"
                  :loading="loading"
                />
              </div>
            </q-form>
          </q-card-section>

          <q-card-actions align="center" class="q-pb-md">
            <q-btn
              v-if="step === 'email'"
              flat
              dense
              no-caps
              color="primary"
              label="Ya tengo un código"
              @click="goToCodeStep"
            />
            <q-btn
              v-else
              flat
              dense
              no-caps
              color="primary"
              label="Pedir otro código"
              @click="step = 'email'"
            />
            <q-btn flat dense no-caps color="grey-8" label="Volver al login" to="/login" />
          </q-card-actions>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { api } from 'src/boot/axios';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { createLogger } from 'src/utils/logger';

/** Espejo de PASSWORD_RESET_CODE_TTL_MS de la API (solo para el texto). */
const CODE_TTL_MINUTES = 15;

const log = createLogger('ForgotPasswordPage');
const route = useRoute();
const router = useRouter();
const $q = useQuasar();

type Step = 'email' | 'code';
const step = ref<Step>('email');

const emailFromQuery = typeof route.query.email === 'string' ? route.query.email : '';
const email = ref(emailFromQuery);
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const loading = ref(false);

function goToCodeStep() {
  if (!email.value) {
    $q.notify({ type: 'warning', message: 'Primero ingresá tu email' });
    return;
  }
  step.value = 'code';
}

async function onRequestCode() {
  loading.value = true;
  try {
    // 200 exista o no el email (anti-enumeración): el paso 2 se muestra igual.
    await api.post('/auth/forgot-password', { email: email.value.trim() });
    step.value = 'code';
  } catch (err: unknown) {
    const message = extractError(err, 'No pudimos enviar el código. Probá de nuevo.');
    if (!isExpectedClientError(err)) {
      log.error('Error requesting password reset code', { error: message });
    }
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

async function onResetPassword() {
  loading.value = true;
  try {
    await api.post('/auth/reset-password', {
      email: email.value.trim(),
      code: code.value,
      newPassword: newPassword.value,
    });
    $q.notify({
      type: 'positive',
      message: 'Contraseña actualizada. Ingresá con tu contraseña nueva.',
    });
    await router.replace({ path: '/login', query: { email: email.value.trim() } });
  } catch (err: unknown) {
    const message = extractError(err, 'Código inválido o vencido');
    if (!isExpectedClientError(err)) {
      log.error('Error resetting password', { error: message });
    }
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}
</script>
