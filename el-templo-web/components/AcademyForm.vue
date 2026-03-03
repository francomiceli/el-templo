<script setup lang="ts">
/**
 * AcademyForm — "EMPEZÁ TU FORMACIÓN." enrollment form section.
 *
 * 10-field form with inline validation, API submission to
 * POST /api/academy/inquire, loading state, confirmation state
 * with WhatsApp link. Analytics: GA4 + Meta Pixel.
 *
 * Target anchor: #formulario-academy (all CTAs scroll here).
 */

import { formSelects, academyConfig } from "~/data/academy";

// --- Reactive Form State ---
const form = reactive({
  nombre: "",
  email: "",
  telefono: "",
  ciudadPais: "",
  nivelInteres: "",
  modalidad: "",
  experiencia: "",
  alumnoElTemplo: "",
  origen: "",
  mensaje: "",
});

type FormField = keyof typeof form;

const errors = reactive<Record<FormField, string>>({
  nombre: "",
  email: "",
  telefono: "",
  ciudadPais: "",
  nivelInteres: "",
  modalidad: "",
  experiencia: "",
  alumnoElTemplo: "",
  origen: "",
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
  { key: "ciudadPais", label: "Ciudad / Pa\u00EDs" },
  { key: "nivelInteres", label: "Nivel de inter\u00E9s" },
  { key: "modalidad", label: "Modalidad" },
  { key: "experiencia", label: "Experiencia" },
  { key: "alumnoElTemplo", label: "\u00BFSos alumno/a?" },
  { key: "origen", label: "\u00BFC\u00F3mo nos conociste?" },
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
    await $fetch(`${baseUrl}/academy/inquire`, {
      method: "POST",
      body: {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        ciudadPais: form.ciudadPais.trim(),
        nivelInteres: form.nivelInteres,
        modalidad: form.modalidad,
        experiencia: form.experiencia,
        alumnoElTemplo: form.alumnoElTemplo,
        origen: form.origen,
        mensaje: form.mensaje.trim() || undefined,
      },
    });

    submitted.value = true;

    // Analytics: academy form submission
    const { trackEvent, trackLead } = useAnalytics();
    trackEvent("form_submit_academy");
    trackLead();
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
  <section id="formulario-academy" class="academy-form">
    <div class="academy-form__container">
      <!-- Confirmation State -->
      <div v-if="submitted" class="academy-form__confirmation">
        <div class="academy-form__check-icon">
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

        <h2 class="academy-form__confirmation-title">
          &iexcl;Consulta recibida!
        </h2>

        <p class="academy-form__confirmation-text">
          Recibimos tu consulta. Te vamos a escribir con toda la info del
          pr&oacute;ximo programa.
        </p>

        <p class="academy-form__confirmation-cta-text">
          &iquest;Quer&eacute;s hablar ahora? Escribinos.
        </p>

        <a
          :href="academyConfig.whatsappUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--primary academy-form__whatsapp-link"
        >
          ESCRIBINOS POR WHATSAPP
        </a>
      </div>

      <!-- Form State -->
      <template v-else>
        <h2 class="academy-form__title">EMPEZ&Aacute; TU FORMACI&Oacute;N.</h2>
        <p class="academy-form__subtitle">
          Complet&aacute; el formulario y te contactamos con toda la
          informaci&oacute;n del pr&oacute;ximo programa.
        </p>

        <!-- Submit Error -->
        <div v-if="submitError" class="academy-form__submit-error" role="alert">
          {{ submitError }}
        </div>

        <form
          class="academy-form__form"
          novalidate
          @submit.prevent="handleSubmit"
        >
          <!-- Nombre -->
          <div class="academy-form__field">
            <label for="academy-nombre" class="academy-form__label"
              >Nombre completo</label
            >
            <input
              id="academy-nombre"
              v-model="form.nombre"
              type="text"
              class="academy-form__input"
              :class="{ 'academy-form__input--error': errors.nombre }"
              autocomplete="name"
              @blur="validateField('nombre')"
            >
            <span v-if="errors.nombre" class="academy-form__error">{{
              errors.nombre
            }}</span>
          </div>

          <!-- Email -->
          <div class="academy-form__field">
            <label for="academy-email" class="academy-form__label">Email</label>
            <input
              id="academy-email"
              v-model="form.email"
              type="email"
              class="academy-form__input"
              :class="{ 'academy-form__input--error': errors.email }"
              autocomplete="email"
              @blur="validateField('email')"
            >
            <span v-if="errors.email" class="academy-form__error">{{
              errors.email
            }}</span>
          </div>

          <!-- Telefono -->
          <div class="academy-form__field">
            <label for="academy-telefono" class="academy-form__label"
              >Tel&eacute;fono / WhatsApp</label
            >
            <input
              id="academy-telefono"
              v-model="form.telefono"
              type="tel"
              class="academy-form__input"
              :class="{ 'academy-form__input--error': errors.telefono }"
              autocomplete="tel"
              @blur="validateField('telefono')"
            >
            <span v-if="errors.telefono" class="academy-form__error">{{
              errors.telefono
            }}</span>
          </div>

          <!-- Ciudad / Pais -->
          <div class="academy-form__field">
            <label for="academy-ciudad" class="academy-form__label"
              >Ciudad / Pa&iacute;s</label
            >
            <input
              id="academy-ciudad"
              v-model="form.ciudadPais"
              type="text"
              class="academy-form__input"
              :class="{ 'academy-form__input--error': errors.ciudadPais }"
              autocomplete="address-level2"
              @blur="validateField('ciudadPais')"
            >
            <span v-if="errors.ciudadPais" class="academy-form__error">{{
              errors.ciudadPais
            }}</span>
          </div>

          <!-- Nivel de Interes -->
          <div class="academy-form__field">
            <label for="academy-nivel" class="academy-form__label"
              >Nivel de inter&eacute;s</label
            >
            <select
              id="academy-nivel"
              v-model="form.nivelInteres"
              class="academy-form__select"
              :class="{ 'academy-form__select--error': errors.nivelInteres }"
              @blur="validateField('nivelInteres')"
              @change="validateField('nivelInteres')"
            >
              <option value="" disabled>Seleccion&aacute;</option>
              <option
                v-for="opt in formSelects.nivelInteres"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span v-if="errors.nivelInteres" class="academy-form__error">{{
              errors.nivelInteres
            }}</span>
          </div>

          <!-- Modalidad -->
          <div class="academy-form__field">
            <label for="academy-modalidad" class="academy-form__label"
              >Modalidad de inter&eacute;s</label
            >
            <select
              id="academy-modalidad"
              v-model="form.modalidad"
              class="academy-form__select"
              :class="{ 'academy-form__select--error': errors.modalidad }"
              @blur="validateField('modalidad')"
              @change="validateField('modalidad')"
            >
              <option value="" disabled>Seleccion&aacute;</option>
              <option
                v-for="opt in formSelects.modalidad"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span v-if="errors.modalidad" class="academy-form__error">{{
              errors.modalidad
            }}</span>
          </div>

          <!-- Experiencia -->
          <div class="academy-form__field">
            <label for="academy-experiencia" class="academy-form__label"
              >Experiencia previa</label
            >
            <select
              id="academy-experiencia"
              v-model="form.experiencia"
              class="academy-form__select"
              :class="{ 'academy-form__select--error': errors.experiencia }"
              @blur="validateField('experiencia')"
              @change="validateField('experiencia')"
            >
              <option value="" disabled>Seleccion&aacute;</option>
              <option
                v-for="opt in formSelects.experiencia"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span v-if="errors.experiencia" class="academy-form__error">{{
              errors.experiencia
            }}</span>
          </div>

          <!-- Alumno El Templo -->
          <div class="academy-form__field">
            <label for="academy-alumno" class="academy-form__label"
              >&iquest;Sos alumno/a de El Templo?</label
            >
            <select
              id="academy-alumno"
              v-model="form.alumnoElTemplo"
              class="academy-form__select"
              :class="{
                'academy-form__select--error': errors.alumnoElTemplo,
              }"
              @blur="validateField('alumnoElTemplo')"
              @change="validateField('alumnoElTemplo')"
            >
              <option value="" disabled>Seleccion&aacute;</option>
              <option
                v-for="opt in formSelects.alumnoElTemplo"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span v-if="errors.alumnoElTemplo" class="academy-form__error">{{
              errors.alumnoElTemplo
            }}</span>
          </div>

          <!-- Origen -->
          <div class="academy-form__field">
            <label for="academy-origen" class="academy-form__label"
              >&iquest;C&oacute;mo nos conociste?</label
            >
            <select
              id="academy-origen"
              v-model="form.origen"
              class="academy-form__select"
              :class="{ 'academy-form__select--error': errors.origen }"
              @blur="validateField('origen')"
              @change="validateField('origen')"
            >
              <option value="" disabled>Seleccion&aacute;</option>
              <option
                v-for="opt in formSelects.origen"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span v-if="errors.origen" class="academy-form__error">{{
              errors.origen
            }}</span>
          </div>

          <!-- Mensaje (optional) -->
          <div class="academy-form__field">
            <label for="academy-mensaje" class="academy-form__label">
              Mensaje <span class="academy-form__optional">(opcional)</span>
            </label>
            <textarea
              id="academy-mensaje"
              v-model="form.mensaje"
              class="academy-form__textarea"
              :class="{ 'academy-form__textarea--error': errors.mensaje }"
              rows="4"
              maxlength="500"
              @blur="validateField('mensaje')"
            />
            <div class="academy-form__field-footer">
              <span v-if="errors.mensaje" class="academy-form__error">{{
                errors.mensaje
              }}</span>
              <span class="academy-form__counter">{{ mensajeCount }}/500</span>
            </div>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            class="btn btn--primary academy-form__submit"
            :disabled="submitting"
          >
            {{ submitting ? "ENVIANDO..." : "ENVIAR CONSULTA" }}
          </button>
        </form>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyForm — Enrollment Form Section
   BEM naming. Token variables only. Never pure black or white.
   Sandy Beige background.
   ========================================================================== */

.academy-form {
  background: var(--color-sandy-beige);
  padding: var(--space-hero) 0;
}

.academy-form__container {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 5%;
}

/* Title + Subtitle */
.academy-form__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
  text-align: center;
}

.academy-form__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
}

/* Submit Error */
.academy-form__submit-error {
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

/* Form */
.academy-form__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-comfortable);
}

/* Field */
.academy-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.academy-form__label {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
}

.academy-form__optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-olive-stone);
  font-size: 13px;
}

/* Input + Select + Textarea */
.academy-form__input,
.academy-form__select,
.academy-form__textarea {
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

.academy-form__input:focus,
.academy-form__select:focus,
.academy-form__textarea:focus {
  outline: none;
  border-color: var(--color-terracotta);
  box-shadow: 0 0 0 2px rgba(192, 122, 86, 0.15);
}

/* Error state */
.academy-form__input--error,
.academy-form__select--error,
.academy-form__textarea--error {
  border-color: #c05656;
}

.academy-form__input--error:focus,
.academy-form__select--error:focus,
.academy-form__textarea--error:focus {
  border-color: #c05656;
  box-shadow: 0 0 0 2px rgba(192, 86, 86, 0.15);
}

/* Select (native) */
.academy-form__select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%233d3732' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 16px center;
  padding-right: 40px;
  cursor: pointer;
}

.academy-form__select:invalid,
.academy-form__select option[value=""] {
  color: var(--color-olive-stone);
}

/* Textarea */
.academy-form__textarea {
  resize: vertical;
  min-height: 100px;
}

/* Field Footer */
.academy-form__field-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}

/* Error Message */
.academy-form__error {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: #c05656;
}

/* Counter */
.academy-form__counter {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
  margin-left: auto;
}

/* Submit Button */
.academy-form__submit {
  width: 100%;
  margin-top: var(--space-base);
  text-align: center;
}

.academy-form__submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: var(--shadow-subtle);
}

/* Confirmation */
.academy-form__confirmation {
  text-align: center;
  padding: var(--space-large) 0;
}

.academy-form__check-icon {
  color: var(--color-terracotta);
  margin-bottom: var(--space-comfortable);
}

.academy-form__confirmation-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.academy-form__confirmation-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-spacious) 0;
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.academy-form__confirmation-cta-text {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  margin: 0 0 var(--space-base) 0;
}

.academy-form__whatsapp-link {
  display: inline-block;
}

/* Tablet */
@media (max-width: 768px) {
  .academy-form {
    padding: var(--space-large) 0;
  }

  .academy-form__title {
    font-size: 28px;
  }

  .academy-form__confirmation-title {
    font-size: 24px;
  }
}

/* Mobile */
@media (max-width: 480px) {
  .academy-form__title {
    font-size: 24px;
  }

  .academy-form__subtitle {
    font-size: 15px;
  }

  .academy-form__input,
  .academy-form__select,
  .academy-form__textarea {
    font-size: 16px;
    padding: 12px 14px;
  }

  .academy-form__select {
    padding-right: 36px;
    background-position: right 14px center;
  }

  .academy-form__confirmation-title {
    font-size: 22px;
  }

  .academy-form__confirmation-text {
    font-size: 15px;
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .academy-form__input,
  .academy-form__select,
  .academy-form__textarea {
    transition: none;
  }
}
</style>
