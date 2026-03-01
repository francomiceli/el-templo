<script setup lang="ts">
/**
 * GladContact -- Contact/inquiry form section.
 *
 * Sandy Beige background. Two-column layout: form (60%) + WhatsApp CTA (40%).
 * Form fields: nombre, email, productoInteres, mensaje (optional).
 * Submits to POST /api/gladius/inquire via $fetch.
 *
 * Anchor: #contacto-gladius (target of Consultar CTAs).
 * BEM prefix: glad-contact
 */

import { gladiusConfig } from "~/data/gladius";

// --- Reactive Form State ---
const form = reactive({
  nombre: "",
  email: "",
  productoInteres: "",
  mensaje: "",
});

type FormField = keyof typeof form;

const errors = reactive<Record<FormField, string>>({
  nombre: "",
  email: "",
  productoInteres: "",
  mensaje: "",
});
const submitting = ref(false);
const submitted = ref(false);
const submitError = ref("");
const whatsappResponseUrl = ref("");

// --- Validation ---
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requiredFields: { key: FormField; label: string }[] = [
  { key: "nombre", label: "Nombre" },
  { key: "email", label: "Email" },
  { key: "productoInteres", label: "Producto de inter\u00E9s" },
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

  if (field === "mensaje" && value && value.length > 1000) {
    errors[field] = "M\u00E1ximo 1000 caracteres";
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
    const result = await $fetch<{ message: string; whatsappUrl: string }>(
      `${baseUrl}/api/gladius/inquire`,
      {
        method: "POST",
        body: {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          productoInteres: form.productoInteres.trim(),
          mensaje: form.mensaje.trim() || undefined,
        },
      },
    );

    whatsappResponseUrl.value = result.whatsappUrl;
    submitted.value = true;
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
  <section id="contacto-gladius" class="glad-contact">
    <div class="glad-contact__container">
      <!-- Confirmation State -->
      <div v-if="submitted" class="glad-contact__confirmation">
        <div class="glad-contact__check-icon">
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

        <h2 class="glad-contact__confirmation-title">
          &iexcl;Consulta recibida!
        </h2>

        <p class="glad-contact__confirmation-text">
          Recibimos tu consulta. Nuestro equipo se va a comunicar con vos a la
          brevedad.
        </p>

        <p class="glad-contact__confirmation-cta-text">
          &iquest;Quer&eacute;s hablar ahora? Escribinos directamente.
        </p>

        <a
          :href="whatsappResponseUrl || gladiusConfig.whatsappUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--primary glad-contact__whatsapp-link"
        >
          ESCRIBINOS POR WHATSAPP
        </a>
      </div>

      <!-- Form + WhatsApp Layout -->
      <template v-else>
        <h2 class="glad-contact__title">
          {{ gladiusConfig.contact.title }}
        </h2>
        <p class="glad-contact__subtitle">
          {{ gladiusConfig.contact.subtitle }}
        </p>

        <div class="glad-contact__layout">
          <!-- FORM COLUMN -->
          <div class="glad-contact__form-col">
            <!-- Submit Error -->
            <div
              v-if="submitError"
              class="glad-contact__submit-error"
              role="alert"
            >
              {{ submitError }}
            </div>

            <form
              class="glad-contact__form"
              novalidate
              @submit.prevent="handleSubmit"
            >
              <!-- Nombre -->
              <div class="glad-contact__field">
                <label for="glad-nombre" class="glad-contact__label">
                  Nombre completo
                </label>
                <input
                  id="glad-nombre"
                  v-model="form.nombre"
                  type="text"
                  class="glad-contact__input"
                  :class="{ 'glad-contact__input--error': errors.nombre }"
                  autocomplete="name"
                  @blur="validateField('nombre')"
                >
                <span v-if="errors.nombre" class="glad-contact__error">
                  {{ errors.nombre }}
                </span>
              </div>

              <!-- Email -->
              <div class="glad-contact__field">
                <label for="glad-email" class="glad-contact__label">
                  Email
                </label>
                <input
                  id="glad-email"
                  v-model="form.email"
                  type="email"
                  class="glad-contact__input"
                  :class="{ 'glad-contact__input--error': errors.email }"
                  autocomplete="email"
                  @blur="validateField('email')"
                >
                <span v-if="errors.email" class="glad-contact__error">
                  {{ errors.email }}
                </span>
              </div>

              <!-- Producto de interes -->
              <div class="glad-contact__field">
                <label for="glad-producto" class="glad-contact__label">
                  Producto de inter&eacute;s
                </label>
                <input
                  id="glad-producto"
                  v-model="form.productoInteres"
                  type="text"
                  class="glad-contact__input"
                  :class="{
                    'glad-contact__input--error': errors.productoInteres,
                  }"
                  placeholder="Ej: Barra de dominadas, Paralelas..."
                  @blur="validateField('productoInteres')"
                >
                <span v-if="errors.productoInteres" class="glad-contact__error">
                  {{ errors.productoInteres }}
                </span>
              </div>

              <!-- Mensaje (optional) -->
              <div class="glad-contact__field">
                <label for="glad-mensaje" class="glad-contact__label">
                  Mensaje
                  <span class="glad-contact__optional">(opcional)</span>
                </label>
                <textarea
                  id="glad-mensaje"
                  v-model="form.mensaje"
                  class="glad-contact__textarea"
                  :class="{
                    'glad-contact__textarea--error': errors.mensaje,
                  }"
                  rows="4"
                  maxlength="1000"
                  @blur="validateField('mensaje')"
                />
                <div class="glad-contact__field-footer">
                  <span v-if="errors.mensaje" class="glad-contact__error">
                    {{ errors.mensaje }}
                  </span>
                  <span class="glad-contact__counter">
                    {{ mensajeCount }}/1000
                  </span>
                </div>
              </div>

              <!-- Submit -->
              <button
                type="submit"
                class="btn btn--primary glad-contact__submit"
                :disabled="submitting"
              >
                {{ submitting ? "ENVIANDO..." : "ENVIAR CONSULTA" }}
              </button>
            </form>
          </div>

          <!-- WHATSAPP COLUMN -->
          <div class="glad-contact__whatsapp-col">
            <div class="glad-contact__whatsapp-card">
              <div class="glad-contact__whatsapp-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="40"
                  height="40"
                  aria-hidden="true"
                >
                  <path
                    d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                  />
                </svg>
              </div>

              <h3 class="glad-contact__whatsapp-title">
                &iquest;Prefer&iacute;s escribirnos directo?
              </h3>

              <p class="glad-contact__whatsapp-text">
                Consult&aacute; por disponibilidad, precios y env&iacute;os por
                WhatsApp.
              </p>

              <a
                :href="gladiusConfig.whatsappUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn--primary glad-contact__whatsapp-cta"
              >
                {{ gladiusConfig.contact.whatsappCta }}
              </a>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   GladContact -- Inquiry Form + WhatsApp CTA
   BEM naming. Token variables only. Never pure black or white.
   Sandy Beige background.
   ========================================================================== */

/* ------------------------------------------------------------------
   Section
   ------------------------------------------------------------------ */
.glad-contact {
  background: var(--color-sandy-beige);
  padding: var(--space-hero) 0;
}

.glad-contact__container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title + Subtitle
   ------------------------------------------------------------------ */
.glad-contact__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
  text-align: center;
}

.glad-contact__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Two-Column Layout
   ------------------------------------------------------------------ */
.glad-contact__layout {
  display: flex;
  gap: var(--space-spacious);
  align-items: flex-start;
}

.glad-contact__form-col {
  flex: 3;
  min-width: 0;
}

.glad-contact__whatsapp-col {
  flex: 2;
  min-width: 0;
}

/* ------------------------------------------------------------------
   Submit Error
   ------------------------------------------------------------------ */
.glad-contact__submit-error {
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
.glad-contact__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Field
   ------------------------------------------------------------------ */
.glad-contact__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.glad-contact__label {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
}

.glad-contact__optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-olive-stone);
  font-size: 13px;
}

/* ------------------------------------------------------------------
   Input + Textarea
   ------------------------------------------------------------------ */
.glad-contact__input,
.glad-contact__textarea {
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

.glad-contact__input:focus,
.glad-contact__textarea:focus {
  outline: none;
  border-color: var(--color-terracotta);
  box-shadow: 0 0 0 2px rgba(192, 122, 86, 0.15);
}

.glad-contact__input--error,
.glad-contact__textarea--error {
  border-color: #c05656;
}

.glad-contact__input--error:focus,
.glad-contact__textarea--error:focus {
  border-color: #c05656;
  box-shadow: 0 0 0 2px rgba(192, 86, 86, 0.15);
}

.glad-contact__input::placeholder {
  color: var(--color-olive-stone);
  opacity: 0.7;
}

/* ------------------------------------------------------------------
   Textarea
   ------------------------------------------------------------------ */
.glad-contact__textarea {
  resize: vertical;
  min-height: 100px;
}

/* ------------------------------------------------------------------
   Field Footer
   ------------------------------------------------------------------ */
.glad-contact__field-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}

/* ------------------------------------------------------------------
   Error Message
   ------------------------------------------------------------------ */
.glad-contact__error {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: #c05656;
}

/* ------------------------------------------------------------------
   Character Counter
   ------------------------------------------------------------------ */
.glad-contact__counter {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
  margin-left: auto;
}

/* ------------------------------------------------------------------
   Submit Button
   ------------------------------------------------------------------ */
.glad-contact__submit {
  width: 100%;
  margin-top: var(--space-base);
  text-align: center;
}

.glad-contact__submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: var(--shadow-subtle);
}

/* ------------------------------------------------------------------
   WhatsApp Card
   ------------------------------------------------------------------ */
.glad-contact__whatsapp-card {
  background: var(--color-marble-cream);
  border: 1px solid var(--color-warm-stone);
  border-radius: 8px;
  padding: var(--space-spacious);
  text-align: center;
  position: sticky;
  top: 96px;
}

.glad-contact__whatsapp-icon {
  color: #25d366;
  margin-bottom: var(--space-comfortable);
}

.glad-contact__whatsapp-title {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.glad-contact__whatsapp-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-comfortable) 0;
}

.glad-contact__whatsapp-cta {
  width: 100%;
  text-align: center;
  display: block;
}

/* ------------------------------------------------------------------
   Confirmation State
   ------------------------------------------------------------------ */
.glad-contact__confirmation {
  text-align: center;
  padding: var(--space-large) 0;
}

.glad-contact__check-icon {
  color: var(--color-terracotta);
  margin-bottom: var(--space-comfortable);
}

.glad-contact__confirmation-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.glad-contact__confirmation-text {
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

.glad-contact__confirmation-cta-text {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  margin: 0 0 var(--space-base) 0;
}

.glad-contact__whatsapp-link {
  display: inline-block;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .glad-contact {
    padding: var(--space-large) 0;
  }

  .glad-contact__layout {
    flex-direction: column;
  }

  .glad-contact__form-col,
  .glad-contact__whatsapp-col {
    flex: none;
    width: 100%;
  }

  .glad-contact__whatsapp-card {
    position: static;
  }

  .glad-contact__title {
    font-size: 26px;
  }

  .glad-contact__confirmation-title {
    font-size: 24px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .glad-contact__title {
    font-size: 22px;
  }

  .glad-contact__subtitle {
    font-size: 15px;
  }

  .glad-contact__input,
  .glad-contact__textarea {
    font-size: 16px; /* Prevent iOS zoom on focus */
    padding: 12px 14px;
  }

  .glad-contact__confirmation-title {
    font-size: 22px;
  }

  .glad-contact__confirmation-text {
    font-size: 15px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .glad-contact__input,
  .glad-contact__textarea {
    transition: none;
  }
}
</style>
