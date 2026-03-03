<script setup lang="ts">
/**
 * AppLandingFormWaitlist -- Notification waitlist form for /app page.
 *
 * 4-field form: nombre, email, moduloInteres (multi-select checkboxes), ciudadPais.
 * Submits to POST /api/app/waitlist.
 * Shows confirmation + WhatsApp link on success.
 *
 * BEM prefix: app-landing-form. Background: Warm Stone #D9CFC1.
 * Target anchor: #formulario-waitlist.
 */

import { appLandingConfig } from "~/data/app-landing";

// --- Reactive Form State ---
const form = reactive({
  nombre: "",
  email: "",
  ciudadPais: "",
});

// Multi-select checkboxes for module interest
const moduleInterest = reactive({
  olympicAcademy: false,
  labs: false,
});

type FormField = keyof typeof form;

const errors = reactive<Record<FormField | "moduloInteres", string>>({
  nombre: "",
  email: "",
  ciudadPais: "",
  moduloInteres: "",
});
const submitting = ref(false);
const submitted = ref(false);
const submitError = ref("");

// --- Validation ---
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requiredFields: { key: FormField; label: string }[] = [
  { key: "nombre", label: "Nombre" },
  { key: "email", label: "Email" },
];

function validateField(field: FormField | "moduloInteres"): void {
  errors[field] = "";

  if (field === "moduloInteres") {
    if (!moduleInterest.olympicAcademy && !moduleInterest.labs) {
      errors.moduloInteres = "Seleccion\u00E1 al menos un m\u00F3dulo";
    }
    return;
  }

  const value = form[field];

  const requiredField = requiredFields.find((f) => f.key === field);
  if (requiredField && (!value || value.trim() === "")) {
    errors[field] = `${requiredField.label} es obligatorio`;
    return;
  }

  if (field === "email" && value && !emailRegex.test(value)) {
    errors[field] = "Ingres\u00E1 un email v\u00E1lido";
    return;
  }

  if (field === "nombre" && value && value.length > 255) {
    errors[field] = "M\u00E1ximo 255 caracteres";
  }

  if (field === "ciudadPais" && value && value.length > 255) {
    errors[field] = "M\u00E1ximo 255 caracteres";
  }
}

function validateAll(): boolean {
  for (const { key } of requiredFields) {
    validateField(key);
  }
  validateField("moduloInteres");
  return Object.values(errors).every((e) => e === "");
}

// --- Build moduloInteres value ---
function buildModuloInteres(): string {
  const parts: string[] = [];
  if (moduleInterest.olympicAcademy) parts.push("olympic-academy");
  if (moduleInterest.labs) parts.push("labs");
  return parts.join(",");
}

// --- Submission ---
const config = useRuntimeConfig();

async function handleSubmit(): Promise<void> {
  submitError.value = "";

  if (!validateAll()) {
    return;
  }

  submitting.value = true;

  try {
    const baseUrl = config.public.apiUrl;
    await $fetch(`${baseUrl}/app/waitlist`, {
      method: "POST",
      body: {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        moduloInteres: buildModuloInteres(),
        ciudadPais: form.ciudadPais.trim() || undefined,
      },
    });

    submitted.value = true;

    // Analytics: waitlist form submission
    const { trackEvent } = useAnalytics();
    trackEvent("form_submit_app_waitlist");
  } catch (err: unknown) {
    if (err instanceof Error) {
      const fetchError = err as Error & {
        data?: { error?: string };
        statusCode?: number;
      };
      if (fetchError.data?.error) {
        submitError.value = fetchError.data.error;
      } else {
        submitError.value =
          "Error al enviar el formulario. Por favor, intent\u00E1 de nuevo.";
      }
    } else {
      submitError.value =
        "Error al enviar el formulario. Por favor, intent\u00E1 de nuevo.";
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    id="formulario-waitlist"
    class="app-landing-form app-landing-form--waitlist"
  >
    <!-- Confirmation State -->
    <div v-if="submitted" class="app-landing-form__confirmation">
      <div class="app-landing-form__check-icon">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          width="48"
          height="48"
          aria-hidden="true"
        >
          <circle
            cx="24"
            cy="24"
            r="22"
            stroke="currentColor"
            stroke-width="2"
          />
          <path
            d="M14 24l7 7 13-13"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>

      <h3 class="app-landing-form__confirmation-title">&iexcl;Te anotaste!</h3>

      <p class="app-landing-form__confirmation-text">
        Te vamos a avisar apenas est&eacute;n disponibles Olympic Academy y Labs
        en la plataforma.
      </p>

      <p class="app-landing-form__confirmation-cta-text">
        &iquest;Quer&eacute;s hablar ahora? Escribinos.
      </p>

      <a
        :href="appLandingConfig.whatsappUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn--primary app-landing-form__whatsapp-link"
      >
        ESCRIBINOS POR WHATSAPP
      </a>
    </div>

    <!-- Form State -->
    <template v-else>
      <h3 class="app-landing-form__title">
        &iquest;Quer&eacute;s saber cuando se activan?
      </h3>
      <p class="app-landing-form__subtitle">
        Dejanos tus datos y te avisamos cuando Olympic Academy y Labs
        est&eacute;n disponibles online.
      </p>

      <!-- Submit Error -->
      <div
        v-if="submitError"
        class="app-landing-form__submit-error"
        role="alert"
      >
        {{ submitError }}
      </div>

      <form
        class="app-landing-form__form"
        novalidate
        @submit.prevent="handleSubmit"
      >
        <!-- Nombre -->
        <div class="app-landing-form__field">
          <label for="waitlist-nombre" class="app-landing-form__label"
            >Nombre</label
          >
          <input
            id="waitlist-nombre"
            v-model="form.nombre"
            type="text"
            class="app-landing-form__input"
            :class="{ 'app-landing-form__input--error': errors.nombre }"
            autocomplete="name"
            maxlength="255"
            @blur="validateField('nombre')"
          >
          <span v-if="errors.nombre" class="app-landing-form__error">{{
            errors.nombre
          }}</span>
        </div>

        <!-- Email -->
        <div class="app-landing-form__field">
          <label for="waitlist-email" class="app-landing-form__label"
            >Email</label
          >
          <input
            id="waitlist-email"
            v-model="form.email"
            type="email"
            class="app-landing-form__input"
            :class="{ 'app-landing-form__input--error': errors.email }"
            autocomplete="email"
            @blur="validateField('email')"
          >
          <span v-if="errors.email" class="app-landing-form__error">{{
            errors.email
          }}</span>
        </div>

        <!-- Modulo de Interes (Multi-select checkboxes) -->
        <div class="app-landing-form__field">
          <span class="app-landing-form__label"
            >&iquest;Qu&eacute; m&oacute;dulo te interesa?</span
          >
          <div class="app-landing-form__checkbox-group">
            <label class="app-landing-form__checkbox-label">
              <input
                v-model="moduleInterest.olympicAcademy"
                type="checkbox"
                class="app-landing-form__checkbox"
                @change="validateField('moduloInteres')"
              >
              <span class="app-landing-form__checkbox-text"
                >Olympic Academy</span
              >
            </label>
            <label class="app-landing-form__checkbox-label">
              <input
                v-model="moduleInterest.labs"
                type="checkbox"
                class="app-landing-form__checkbox"
                @change="validateField('moduloInteres')"
              >
              <span class="app-landing-form__checkbox-text">Labs</span>
            </label>
          </div>
          <span v-if="errors.moduloInteres" class="app-landing-form__error">{{
            errors.moduloInteres
          }}</span>
        </div>

        <!-- Ciudad / Pais (optional) -->
        <div class="app-landing-form__field">
          <label for="waitlist-ciudad" class="app-landing-form__label">
            Ciudad / Pa&iacute;s
            <span class="app-landing-form__optional">(opcional)</span>
          </label>
          <input
            id="waitlist-ciudad"
            v-model="form.ciudadPais"
            type="text"
            class="app-landing-form__input"
            :class="{ 'app-landing-form__input--error': errors.ciudadPais }"
            autocomplete="address-level2"
            maxlength="255"
            @blur="validateField('ciudadPais')"
          >
          <span v-if="errors.ciudadPais" class="app-landing-form__error">{{
            errors.ciudadPais
          }}</span>
        </div>

        <!-- Submit -->
        <button
          type="submit"
          class="btn btn--primary app-landing-form__submit"
          :disabled="submitting"
        >
          {{ submitting ? "ENVIANDO..." : "AVISAME CUANDO ESTE DISPONIBLE" }}
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
/* ==========================================================================
   AppLandingFormWaitlist -- Waitlist notification form
   BEM prefix: app-landing-form. Shared background with Labs form.
   ========================================================================== */

/* ------------------------------------------------------------------
   Title + Subtitle
   ------------------------------------------------------------------ */
.app-landing-form__title {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 24px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
}

.app-landing-form__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
}

/* ------------------------------------------------------------------
   Submit Error
   ------------------------------------------------------------------ */
.app-landing-form__submit-error {
  background: rgba(192, 86, 86, 0.1);
  border: 1px solid #c05656;
  border-radius: var(--radius-base);
  padding: 12px 16px;
  margin-bottom: var(--space-comfortable);
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: #c05656;
  text-align: center;
}

/* ------------------------------------------------------------------
   Form
   ------------------------------------------------------------------ */
.app-landing-form__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Field
   ------------------------------------------------------------------ */
.app-landing-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.app-landing-form__label {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
}

.app-landing-form__optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-olive-stone);
  font-size: 13px;
}

/* ------------------------------------------------------------------
   Input (shared base)
   ------------------------------------------------------------------ */
.app-landing-form__input {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  background: var(--color-marble-cream);
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-base);
  padding: 14px 16px;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
  width: 100%;
  box-sizing: border-box;
}

.app-landing-form__input:focus {
  outline: none;
  border-color: var(--color-terracotta);
  box-shadow: 0 0 0 2px rgba(192, 122, 86, 0.15);
}

/* Error state */
.app-landing-form__input--error {
  border-color: #c05656;
}

.app-landing-form__input--error:focus {
  border-color: #c05656;
  box-shadow: 0 0 0 2px rgba(192, 86, 86, 0.15);
}

/* ------------------------------------------------------------------
   Checkbox Group
   ------------------------------------------------------------------ */
.app-landing-form__checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.app-landing-form__checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.app-landing-form__checkbox {
  width: 20px;
  height: 20px;
  accent-color: var(--color-terracotta);
  cursor: pointer;
  flex-shrink: 0;
}

.app-landing-form__checkbox-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
}

/* ------------------------------------------------------------------
   Error Message
   ------------------------------------------------------------------ */
.app-landing-form__error {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: #c05656;
}

/* ------------------------------------------------------------------
   Submit Button
   ------------------------------------------------------------------ */
.app-landing-form__submit {
  width: 100%;
  margin-top: var(--space-base);
  text-align: center;
}

.app-landing-form__submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: var(--shadow-subtle);
}

/* ------------------------------------------------------------------
   Confirmation State
   ------------------------------------------------------------------ */
.app-landing-form__confirmation {
  text-align: center;
  padding: var(--space-large) 0;
}

.app-landing-form__check-icon {
  color: var(--color-terracotta);
  margin-bottom: var(--space-comfortable);
}

.app-landing-form__confirmation-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 24px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.app-landing-form__confirmation-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-spacious) 0;
}

.app-landing-form__confirmation-cta-text {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  margin: 0 0 var(--space-base) 0;
}

.app-landing-form__whatsapp-link {
  display: inline-block;
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .app-landing-form__title {
    font-size: 20px;
  }

  .app-landing-form__subtitle {
    font-size: 14px;
  }

  .app-landing-form__input {
    font-size: 16px; /* Prevent iOS zoom on focus */
    padding: 12px 14px;
  }

  .app-landing-form__confirmation-title {
    font-size: 20px;
  }

  .app-landing-form__confirmation-text {
    font-size: 14px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .app-landing-form__input {
    transition: none;
  }
}
</style>
