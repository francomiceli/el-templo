<script setup lang="ts">
/**
 * AppLandingFormLabs -- Labs external gym inquiry form for /app page.
 *
 * 8-field form for gym owners interested in Labs SaaS.
 * Submits to POST /api/app/labs-inquiry.
 * Shows confirmation + WhatsApp link on success.
 * Fires GA4 event + Meta Pixel trackLead.
 *
 * BEM prefix: app-landing-form. Background: Warm Stone #D9CFC1.
 * Target anchor: #formulario-labs (Labs dual CTA scrolls here).
 */

import { appLandingConfig } from "~/data/app-landing";

// --- Select options ---
const cantidadSociosOptions = [
  { value: "menos-de-50", label: "Menos de 50" },
  { value: "50-200", label: "50-200" },
  { value: "200-500", label: "200-500" },
  { value: "mas-de-500", label: "M\u00E1s de 500" },
];

const sistemaActualOptions = [
  { value: "ninguno", label: "Ninguno" },
  { value: "excel", label: "Excel" },
  { value: "fitco", label: "Fitco" },
  { value: "crosshero", label: "Crosshero" },
  { value: "otro", label: "Otro" },
];

// --- Reactive Form State ---
const form = reactive({
  nombre: "",
  email: "",
  telefono: "",
  nombreGimnasio: "",
  ciudadPais: "",
  cantidadSocios: "",
  sistemaActual: "",
  mensaje: "",
});

type FormField = keyof typeof form;

const errors = reactive<Record<FormField, string>>({
  nombre: "",
  email: "",
  telefono: "",
  nombreGimnasio: "",
  ciudadPais: "",
  cantidadSocios: "",
  sistemaActual: "",
  mensaje: "",
});
const submitting = ref(false);
const submitted = ref(false);
const submitError = ref("");

// --- Validation ---
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requiredFields: { key: FormField; label: string }[] = [
  { key: "nombre", label: "Nombre" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Tel\u00E9fono" },
  { key: "nombreGimnasio", label: "Nombre del gimnasio" },
  { key: "ciudadPais", label: "Ciudad / Pa\u00EDs" },
  { key: "cantidadSocios", label: "Cantidad de socios" },
  { key: "sistemaActual", label: "Sistema actual" },
];

function validateField(field: FormField): void {
  errors[field] = "";

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

  if (field === "mensaje" && value && value.length > 500) {
    errors[field] = "M\u00E1ximo 500 caracteres";
  }
}

function validateAll(): boolean {
  for (const { key } of requiredFields) {
    validateField(key);
  }
  if (form.mensaje) {
    validateField("mensaje");
  }
  return Object.values(errors).every((e) => e === "");
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
    await $fetch(`${baseUrl}/app/labs-inquiry`, {
      method: "POST",
      body: {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        nombreGimnasio: form.nombreGimnasio.trim(),
        ciudadPais: form.ciudadPais.trim(),
        cantidadSocios: form.cantidadSocios,
        sistemaActual: form.sistemaActual,
        mensaje: form.mensaje.trim() || undefined,
      },
    });

    submitted.value = true;

    // Analytics: labs inquiry form submission
    const { trackEvent, trackLead } = useAnalytics();
    trackEvent("form_submit_labs_inquiry");
    trackLead(); // Meta Pixel Lead event
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
          "Error al enviar la consulta. Por favor, intent\u00E1 de nuevo.";
      }
    } else {
      submitError.value =
        "Error al enviar la consulta. Por favor, intent\u00E1 de nuevo.";
    }
  } finally {
    submitting.value = false;
  }
}

// --- Character counter ---
const mensajeCount = computed(() => form.mensaje.length);
</script>

<template>
  <div id="formulario-labs" class="app-landing-form app-landing-form--labs">
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

      <h3 class="app-landing-form__confirmation-title">
        &iexcl;Consulta recibida!
      </h3>

      <p class="app-landing-form__confirmation-text">
        Recibimos tu consulta sobre Labs. Te vamos a contactar para contarte
        todo sobre la plataforma.
      </p>

      <p class="app-landing-form__confirmation-cta-text">
        &iquest;Quer&eacute;s hablar ahora? Escribinos.
      </p>

      <a
        :href="appLandingConfig.whatsappUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn--secondary-azul app-landing-form__whatsapp-link"
      >
        ESCRIBINOS POR WHATSAPP
      </a>
    </div>

    <!-- Form State -->
    <template v-else>
      <h3 class="app-landing-form__title">QUIERO LABS PARA MI GIMNASIO</h3>
      <p class="app-landing-form__subtitle">
        Contanos sobre tu gimnasio y te contactamos.
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
          <label for="labs-nombre" class="app-landing-form__label"
            >Nombre</label
          >
          <input
            id="labs-nombre"
            v-model="form.nombre"
            type="text"
            class="app-landing-form__input"
            :class="{ 'app-landing-form__input--error': errors.nombre }"
            autocomplete="name"
            @blur="validateField('nombre')"
          >
          <span v-if="errors.nombre" class="app-landing-form__error">{{
            errors.nombre
          }}</span>
        </div>

        <!-- Email -->
        <div class="app-landing-form__field">
          <label for="labs-email" class="app-landing-form__label">Email</label>
          <input
            id="labs-email"
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

        <!-- Telefono / WhatsApp -->
        <div class="app-landing-form__field">
          <label for="labs-telefono" class="app-landing-form__label"
            >Tel&eacute;fono / WhatsApp</label
          >
          <input
            id="labs-telefono"
            v-model="form.telefono"
            type="tel"
            class="app-landing-form__input"
            :class="{ 'app-landing-form__input--error': errors.telefono }"
            autocomplete="tel"
            @blur="validateField('telefono')"
          >
          <span v-if="errors.telefono" class="app-landing-form__error">{{
            errors.telefono
          }}</span>
        </div>

        <!-- Nombre del gimnasio -->
        <div class="app-landing-form__field">
          <label for="labs-gimnasio" class="app-landing-form__label"
            >Nombre del gimnasio</label
          >
          <input
            id="labs-gimnasio"
            v-model="form.nombreGimnasio"
            type="text"
            class="app-landing-form__input"
            :class="{ 'app-landing-form__input--error': errors.nombreGimnasio }"
            @blur="validateField('nombreGimnasio')"
          >
          <span v-if="errors.nombreGimnasio" class="app-landing-form__error">{{
            errors.nombreGimnasio
          }}</span>
        </div>

        <!-- Ciudad / Pais -->
        <div class="app-landing-form__field">
          <label for="labs-ciudad" class="app-landing-form__label"
            >Ciudad / Pa&iacute;s</label
          >
          <input
            id="labs-ciudad"
            v-model="form.ciudadPais"
            type="text"
            class="app-landing-form__input"
            :class="{ 'app-landing-form__input--error': errors.ciudadPais }"
            autocomplete="address-level2"
            @blur="validateField('ciudadPais')"
          >
          <span v-if="errors.ciudadPais" class="app-landing-form__error">{{
            errors.ciudadPais
          }}</span>
        </div>

        <!-- Cantidad de socios -->
        <div class="app-landing-form__field">
          <label for="labs-socios" class="app-landing-form__label"
            >Cantidad de socios</label
          >
          <select
            id="labs-socios"
            v-model="form.cantidadSocios"
            class="app-landing-form__select"
            :class="{
              'app-landing-form__select--error': errors.cantidadSocios,
            }"
            @blur="validateField('cantidadSocios')"
            @change="validateField('cantidadSocios')"
          >
            <option value="" disabled>Seleccion&aacute;</option>
            <option
              v-for="opt in cantidadSociosOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
          <span v-if="errors.cantidadSocios" class="app-landing-form__error">{{
            errors.cantidadSocios
          }}</span>
        </div>

        <!-- Sistema actual -->
        <div class="app-landing-form__field">
          <label for="labs-sistema" class="app-landing-form__label"
            >&iquest;Qu&eacute; sistema us&aacute;s actualmente?</label
          >
          <select
            id="labs-sistema"
            v-model="form.sistemaActual"
            class="app-landing-form__select"
            :class="{ 'app-landing-form__select--error': errors.sistemaActual }"
            @blur="validateField('sistemaActual')"
            @change="validateField('sistemaActual')"
          >
            <option value="" disabled>Seleccion&aacute;</option>
            <option
              v-for="opt in sistemaActualOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
          <span v-if="errors.sistemaActual" class="app-landing-form__error">{{
            errors.sistemaActual
          }}</span>
        </div>

        <!-- Mensaje (optional) -->
        <div class="app-landing-form__field">
          <label for="labs-mensaje" class="app-landing-form__label">
            Mensaje <span class="app-landing-form__optional">(opcional)</span>
          </label>
          <textarea
            id="labs-mensaje"
            v-model="form.mensaje"
            class="app-landing-form__textarea"
            :class="{ 'app-landing-form__textarea--error': errors.mensaje }"
            rows="4"
            maxlength="500"
            @blur="validateField('mensaje')"
          />
          <div class="app-landing-form__field-footer">
            <span v-if="errors.mensaje" class="app-landing-form__error">{{
              errors.mensaje
            }}</span>
            <span class="app-landing-form__counter"
              >{{ mensajeCount }}/500</span
            >
          </div>
        </div>

        <!-- Submit -->
        <button
          type="submit"
          class="btn btn--secondary-azul app-landing-form__submit"
          :disabled="submitting"
        >
          {{ submitting ? "ENVIANDO..." : "QUIERO LABS PARA MI GIMNASIO" }}
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
/* ==========================================================================
   AppLandingFormLabs -- Labs gym inquiry form
   BEM prefix: app-landing-form. Shared styles with waitlist form.
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
   Input + Select + Textarea (shared base)
   ------------------------------------------------------------------ */
.app-landing-form__input,
.app-landing-form__select,
.app-landing-form__textarea {
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

.app-landing-form__input:focus,
.app-landing-form__select:focus,
.app-landing-form__textarea:focus {
  outline: none;
  border-color: var(--color-azul-noche);
  box-shadow: 0 0 0 2px rgba(45, 65, 95, 0.15);
}

/* Error state */
.app-landing-form__input--error,
.app-landing-form__select--error,
.app-landing-form__textarea--error {
  border-color: #c05656;
}

.app-landing-form__input--error:focus,
.app-landing-form__select--error:focus,
.app-landing-form__textarea--error:focus {
  border-color: #c05656;
  box-shadow: 0 0 0 2px rgba(192, 86, 86, 0.15);
}

/* ------------------------------------------------------------------
   Select (native)
   ------------------------------------------------------------------ */
.app-landing-form__select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%233d3732' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 16px center;
  padding-right: 40px;
  cursor: pointer;
}

.app-landing-form__select:invalid,
.app-landing-form__select option[value=""] {
  color: var(--color-olive-stone);
}

/* ------------------------------------------------------------------
   Textarea
   ------------------------------------------------------------------ */
.app-landing-form__textarea {
  resize: vertical;
  min-height: 100px;
}

/* ------------------------------------------------------------------
   Field Footer (error + counter)
   ------------------------------------------------------------------ */
.app-landing-form__field-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
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
   Character Counter
   ------------------------------------------------------------------ */
.app-landing-form__counter {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
  margin-left: auto;
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
  color: var(--color-azul-noche);
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

  .app-landing-form__input,
  .app-landing-form__select,
  .app-landing-form__textarea {
    font-size: 16px; /* Prevent iOS zoom on focus */
    padding: 12px 14px;
  }

  .app-landing-form__select {
    padding-right: 36px;
    background-position: right 14px center;
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
  .app-landing-form__input,
  .app-landing-form__select,
  .app-landing-form__textarea {
    transition: none;
  }
}
</style>
