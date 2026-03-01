<script setup lang="ts">
/**
 * FranForm -- "APLICA AHORA." franchise application form section.
 *
 * Sandy Beige background. 9-field form with inline validation,
 * API submission to POST /api/franchise/apply, loading state,
 * confirmation state with WhatsApp link.
 *
 * Target anchor: #formulario-franquicia (all "QUIERO APLICAR" CTAs scroll here).
 */

import { formSelects, franquiciasConfig } from "~/data/franquicias";

// --- Reactive Form State ---
const form = reactive({
  nombre: "",
  email: "",
  telefono: "",
  ciudadPais: "",
  modelo: "",
  experiencia: "",
  capital: "",
  origen: "",
  mensaje: "",
});

type FormField = keyof typeof form;

const errors = reactive<Record<FormField, string>>({
  nombre: "",
  email: "",
  telefono: "",
  ciudadPais: "",
  modelo: "",
  experiencia: "",
  capital: "",
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
  { key: "modelo", label: "Modelo" },
  { key: "experiencia", label: "Experiencia" },
  { key: "capital", label: "Capital disponible" },
  { key: "origen", label: "Origen" },
];

function validateField(field: FormField): void {
  // Clear previous error
  errors[field] = "";

  const value = form[field];

  // Required check for all required fields
  const requiredField = requiredFields.find((f) => f.key === field);
  if (requiredField && (!value || value.trim() === "")) {
    errors[field] = `${requiredField.label} es obligatorio`;
    return;
  }

  // Email format
  if (field === "email" && value && !emailRegex.test(value)) {
    errors[field] = "Ingres\u00E1 un email v\u00E1lido";
    return;
  }

  // Mensaje max length
  if (field === "mensaje" && value && value.length > 500) {
    errors[field] = "M\u00E1ximo 500 caracteres";
  }
}

function validateAll(): boolean {
  // Validate all required fields
  for (const { key } of requiredFields) {
    validateField(key);
  }
  // Also validate mensaje if it has content
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
    const baseUrl = config.public.apiUrl || "http://localhost:3000";
    await $fetch(`${baseUrl}/api/franchise/apply`, {
      method: "POST",
      body: {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        ciudadPais: form.ciudadPais.trim(),
        modelo: form.modelo,
        experiencia: form.experiencia,
        capital: form.capital,
        origen: form.origen,
        mensaje: form.mensaje.trim() || undefined,
      },
    });

    submitted.value = true;
  } catch (err: unknown) {
    if (err instanceof Error) {
      // Try to extract API error message
      const fetchError = err as Error & {
        data?: { error?: string };
        statusCode?: number;
      };
      if (fetchError.data?.error) {
        submitError.value = fetchError.data.error;
      } else {
        submitError.value =
          "Error al enviar la aplicaci\u00F3n. Por favor, intent\u00E1 de nuevo.";
      }
    } else {
      submitError.value =
        "Error al enviar la aplicaci\u00F3n. Por favor, intent\u00E1 de nuevo.";
    }
  } finally {
    submitting.value = false;
  }
}

// --- Character counter ---
const mensajeCount = computed(() => form.mensaje.length);
</script>

<template>
  <section id="formulario-franquicia" class="fran-form">
    <div class="fran-form__container">
      <!-- Confirmation State -->
      <div v-if="submitted" class="fran-form__confirmation">
        <div class="fran-form__check-icon">
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

        <h2 class="fran-form__confirmation-title">
          &iexcl;Aplicaci&oacute;n recibida!
        </h2>

        <p class="fran-form__confirmation-text">
          Recibimos tu aplicaci&oacute;n. Nuestro equipo se va a comunicar con
          vos en las pr&oacute;ximas 48 horas.
        </p>

        <p class="fran-form__confirmation-cta-text">
          &iquest;Quer&eacute;s hablar ahora? Escribinos.
        </p>

        <a
          :href="franquiciasConfig.whatsappUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--primary fran-form__whatsapp-link"
        >
          ESCRIBINOS POR WHATSAPP
        </a>
      </div>

      <!-- Form State -->
      <template v-else>
        <h2 class="fran-form__title">APLIC&Aacute; AHORA.</h2>
        <p class="fran-form__subtitle">
          Complet&aacute; el formulario y nuestro equipo te contacta en las
          pr&oacute;ximas 48 horas.
        </p>

        <!-- Submit Error -->
        <div v-if="submitError" class="fran-form__submit-error" role="alert">
          {{ submitError }}
        </div>

        <form class="fran-form__form" novalidate @submit.prevent="handleSubmit">
          <!-- Nombre -->
          <div class="fran-form__field">
            <label for="fran-nombre" class="fran-form__label"
              >Nombre completo</label
            >
            <input
              id="fran-nombre"
              v-model="form.nombre"
              type="text"
              class="fran-form__input"
              :class="{ 'fran-form__input--error': errors.nombre }"
              autocomplete="name"
              @blur="validateField('nombre')"
            >
            <span v-if="errors.nombre" class="fran-form__error">{{
              errors.nombre
            }}</span>
          </div>

          <!-- Email -->
          <div class="fran-form__field">
            <label for="fran-email" class="fran-form__label">Email</label>
            <input
              id="fran-email"
              v-model="form.email"
              type="email"
              class="fran-form__input"
              :class="{ 'fran-form__input--error': errors.email }"
              autocomplete="email"
              @blur="validateField('email')"
            >
            <span v-if="errors.email" class="fran-form__error">{{
              errors.email
            }}</span>
          </div>

          <!-- Telefono -->
          <div class="fran-form__field">
            <label for="fran-telefono" class="fran-form__label"
              >Tel&eacute;fono</label
            >
            <input
              id="fran-telefono"
              v-model="form.telefono"
              type="tel"
              class="fran-form__input"
              :class="{ 'fran-form__input--error': errors.telefono }"
              autocomplete="tel"
              @blur="validateField('telefono')"
            >
            <span v-if="errors.telefono" class="fran-form__error">{{
              errors.telefono
            }}</span>
          </div>

          <!-- Ciudad / Pais -->
          <div class="fran-form__field">
            <label for="fran-ciudad" class="fran-form__label"
              >Ciudad / Pa&iacute;s</label
            >
            <input
              id="fran-ciudad"
              v-model="form.ciudadPais"
              type="text"
              class="fran-form__input"
              :class="{ 'fran-form__input--error': errors.ciudadPais }"
              autocomplete="address-level2"
              @blur="validateField('ciudadPais')"
            >
            <span v-if="errors.ciudadPais" class="fran-form__error">{{
              errors.ciudadPais
            }}</span>
          </div>

          <!-- Modelo -->
          <div class="fran-form__field">
            <label for="fran-modelo" class="fran-form__label"
              >Modelo de franquicia</label
            >
            <select
              id="fran-modelo"
              v-model="form.modelo"
              class="fran-form__select"
              :class="{ 'fran-form__select--error': errors.modelo }"
              @blur="validateField('modelo')"
              @change="validateField('modelo')"
            >
              <option value="" disabled>Seleccion&aacute;</option>
              <option
                v-for="opt in formSelects.modelo"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span v-if="errors.modelo" class="fran-form__error">{{
              errors.modelo
            }}</span>
          </div>

          <!-- Experiencia -->
          <div class="fran-form__field">
            <label for="fran-experiencia" class="fran-form__label"
              >&iquest;Ten&eacute;s experiencia?</label
            >
            <select
              id="fran-experiencia"
              v-model="form.experiencia"
              class="fran-form__select"
              :class="{ 'fran-form__select--error': errors.experiencia }"
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
            <span v-if="errors.experiencia" class="fran-form__error">{{
              errors.experiencia
            }}</span>
          </div>

          <!-- Capital -->
          <div class="fran-form__field">
            <label for="fran-capital" class="fran-form__label"
              >Capital disponible</label
            >
            <select
              id="fran-capital"
              v-model="form.capital"
              class="fran-form__select"
              :class="{ 'fran-form__select--error': errors.capital }"
              @blur="validateField('capital')"
              @change="validateField('capital')"
            >
              <option value="" disabled>Seleccion&aacute;</option>
              <option
                v-for="opt in formSelects.capital"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span v-if="errors.capital" class="fran-form__error">{{
              errors.capital
            }}</span>
          </div>

          <!-- Origen -->
          <div class="fran-form__field">
            <label for="fran-origen" class="fran-form__label"
              >&iquest;C&oacute;mo nos conociste?</label
            >
            <select
              id="fran-origen"
              v-model="form.origen"
              class="fran-form__select"
              :class="{ 'fran-form__select--error': errors.origen }"
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
            <span v-if="errors.origen" class="fran-form__error">{{
              errors.origen
            }}</span>
          </div>

          <!-- Mensaje (optional) -->
          <div class="fran-form__field">
            <label for="fran-mensaje" class="fran-form__label">
              Mensaje <span class="fran-form__optional">(opcional)</span>
            </label>
            <textarea
              id="fran-mensaje"
              v-model="form.mensaje"
              class="fran-form__textarea"
              :class="{ 'fran-form__textarea--error': errors.mensaje }"
              rows="4"
              maxlength="500"
              @blur="validateField('mensaje')"
            />
            <div class="fran-form__field-footer">
              <span v-if="errors.mensaje" class="fran-form__error">{{
                errors.mensaje
              }}</span>
              <span class="fran-form__counter">{{ mensajeCount }}/500</span>
            </div>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            class="btn btn--primary fran-form__submit"
            :disabled="submitting"
          >
            {{ submitting ? "ENVIANDO..." : "ENVIAR APLICACI\u00D3N" }}
          </button>
        </form>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   FranForm -- Franchise Application Form
   BEM naming. Token variables only. Never pure black or white.
   Sandy Beige background.
   ========================================================================== */

/* ------------------------------------------------------------------
   Section Wrapper
   ------------------------------------------------------------------ */
.fran-form {
  background: var(--color-sandy-beige);
  padding: var(--space-hero) 0;
}

.fran-form__container {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title + Subtitle
   ------------------------------------------------------------------ */
.fran-form__title {
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

.fran-form__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Submit Error (above form)
   ------------------------------------------------------------------ */
.fran-form__submit-error {
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
.fran-form__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Field
   ------------------------------------------------------------------ */
.fran-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fran-form__label {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
}

.fran-form__optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-olive-stone);
  font-size: 13px;
}

/* ------------------------------------------------------------------
   Input + Select + Textarea (shared base)
   ------------------------------------------------------------------ */
.fran-form__input,
.fran-form__select,
.fran-form__textarea {
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

.fran-form__input:focus,
.fran-form__select:focus,
.fran-form__textarea:focus {
  outline: none;
  border-color: var(--color-terracotta);
  box-shadow: 0 0 0 2px rgba(192, 122, 86, 0.15);
}

/* Error state */
.fran-form__input--error,
.fran-form__select--error,
.fran-form__textarea--error {
  border-color: #c05656;
}

.fran-form__input--error:focus,
.fran-form__select--error:focus,
.fran-form__textarea--error:focus {
  border-color: #c05656;
  box-shadow: 0 0 0 2px rgba(192, 86, 86, 0.15);
}

/* ------------------------------------------------------------------
   Select (native)
   ------------------------------------------------------------------ */
.fran-form__select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%233d3732' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 16px center;
  padding-right: 40px;
  cursor: pointer;
}

/* Placeholder color for unselected */
.fran-form__select:invalid,
.fran-form__select option[value=""] {
  color: var(--color-olive-stone);
}

/* ------------------------------------------------------------------
   Textarea
   ------------------------------------------------------------------ */
.fran-form__textarea {
  resize: vertical;
  min-height: 100px;
}

/* ------------------------------------------------------------------
   Field Footer (error + counter)
   ------------------------------------------------------------------ */
.fran-form__field-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}

/* ------------------------------------------------------------------
   Error Message
   ------------------------------------------------------------------ */
.fran-form__error {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: #c05656;
}

/* ------------------------------------------------------------------
   Character Counter
   ------------------------------------------------------------------ */
.fran-form__counter {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
  margin-left: auto;
}

/* ------------------------------------------------------------------
   Submit Button
   ------------------------------------------------------------------ */
.fran-form__submit {
  width: 100%;
  margin-top: var(--space-base);
  text-align: center;
}

.fran-form__submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: var(--shadow-subtle);
}

/* ------------------------------------------------------------------
   Confirmation State
   ------------------------------------------------------------------ */
.fran-form__confirmation {
  text-align: center;
  padding: var(--space-large) 0;
}

.fran-form__check-icon {
  color: var(--color-terracotta);
  margin-bottom: var(--space-comfortable);
}

.fran-form__confirmation-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.fran-form__confirmation-text {
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

.fran-form__confirmation-cta-text {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  margin: 0 0 var(--space-base) 0;
}

.fran-form__whatsapp-link {
  display: inline-block;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .fran-form {
    padding: var(--space-large) 0;
  }

  .fran-form__title {
    font-size: 28px;
  }

  .fran-form__confirmation-title {
    font-size: 24px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .fran-form__title {
    font-size: 24px;
  }

  .fran-form__subtitle {
    font-size: 15px;
  }

  .fran-form__input,
  .fran-form__select,
  .fran-form__textarea {
    font-size: 16px; /* Prevent iOS zoom on focus */
    padding: 12px 14px;
  }

  .fran-form__select {
    padding-right: 36px;
    background-position: right 14px center;
  }

  .fran-form__confirmation-title {
    font-size: 22px;
  }

  .fran-form__confirmation-text {
    font-size: 15px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .fran-form__input,
  .fran-form__select,
  .fran-form__textarea {
    transition: none;
  }
}
</style>
