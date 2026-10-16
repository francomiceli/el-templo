<!-- Editor de patrocinadores de Mi Templo (alta y edición) — Fase 199, D-19, D-26.
     Una marca da un beneficio a los socios de El Templo (no confundir con
     Partners). A la izquierda el formulario; a la derecha la vista previa en
     vivo de la card del carrusel y de la hoja de detalle, tal como las ve el
     socio en la app (D-22/D-23).

     Contraste (D-19): el chip muestra el ratio fondo/texto en vivo y `canSave`
     bloquea por debajo de 4.5:1. El server revalida TODO (L17): si responde
     400 su mensaje se muestra tal cual (límite de activas, contraste, etc.).

     Semántica del PUT: al editar se manda solo lo que cambió
     (`diffSponsorForm`) y si no cambió nada no se hace request. En el alta se
     omite `sortOrder` para que el API deje la marca al final (max + 1).

     Abierto desde un partner (`prefill`): viene precargado con nombre, país y
     partner vinculado; el contacto del partner se muestra solo lectura (vive en
     el partner, no se duplica en la marca). -->
<template>
  <q-dialog v-model="localOpen" persistent>
    <q-card :style="cardStyle">
      <q-card-section class="q-pb-none">
        <div class="text-h6">{{ isCreate ? 'Nuevo patrocinador' : 'Editar patrocinador' }}</div>
        <div class="text-caption text-grey-7">
          Marcas que dan beneficios a los socios de El Templo (no confundir con Partners)
        </div>
      </q-card-section>

      <q-card-section style="max-height: 70vh; overflow-y: auto">
        <div class="row q-col-gutter-lg">
          <!-- ── Formulario ───────────────────────────────────────────── -->
          <div class="col-12 col-md-7 q-gutter-y-md">
            <q-banner v-if="prefillBanner" dense rounded class="bg-grey-2 text-grey-9">
              <template #avatar>
                <q-icon name="link" color="primary" />
              </template>
              {{ prefillBanner }}
            </q-banner>

            <q-input
              v-model="form.name"
              label="Nombre"
              dense
              outlined
              autofocus
              :maxlength="SPONSOR_LIMITS.name"
              counter
            />
            <q-input
              v-model="form.category"
              label="Rubro"
              dense
              outlined
              :maxlength="SPONSOR_LIMITS.category"
              counter
              hint="Ej: Café de especialidad, Indumentaria deportiva"
            />
            <q-input
              v-model="form.benefit"
              label="Beneficio"
              dense
              outlined
              :maxlength="SPONSOR_LIMITS.benefit"
              counter
              hint="Hasta 12 caracteres: se muestra grande en una línea."
              placeholder="Ej: 20% OFF"
            />
            <q-input
              v-model="form.detail"
              label="Detalle"
              dense
              outlined
              :maxlength="SPONSOR_LIMITS.detail"
              counter
              placeholder="Ej: en toda la carta, de lunes a viernes"
            />
            <q-input
              v-model="form.conditions"
              label="Condiciones (opcional)"
              type="textarea"
              autogrow
              dense
              outlined
              :maxlength="SPONSOR_LIMITS.conditions"
              counter
            />

            <q-separator />
            <div class="text-subtitle2">Canje</div>
            <q-option-group
              v-model="form.redeemType"
              :options="REDEEM_TYPE_OPTIONS"
              type="radio"
              inline
            />
            <q-input
              v-if="form.redeemType === 'code'"
              :model-value="form.redeemCode"
              label="Código"
              dense
              outlined
              :maxlength="SPONSOR_LIMITS.redeemCode"
              counter
              hint="Solo lo ve un socio con plan activo"
              @update:model-value="onRedeemCodeInput"
            />

            <q-separator />
            <div class="text-subtitle2">Países</div>
            <q-option-group
              v-model="form.countries"
              :options="SPONSOR_COUNTRY_OPTIONS"
              type="checkbox"
              inline
            />
            <div class="row q-col-gutter-md">
              <div class="col-6">
                <q-input
                  v-model="form.startsOn"
                  label="Vigencia desde"
                  type="date"
                  dense
                  outlined
                  clearable
                  stack-label
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model="form.endsOn"
                  label="Vigencia hasta"
                  type="date"
                  dense
                  outlined
                  clearable
                  stack-label
                />
              </div>
            </div>
            <div>
              <q-toggle v-model="form.isActive" color="primary" label="Activo" />
              <div v-if="maxActivePerCountry" class="text-caption text-grey-7">
                Máximo {{ maxActivePerCountry }} activas por país
              </div>
            </div>

            <q-separator />
            <div class="text-subtitle2">Logo e ícono</div>
            <div class="row items-center q-gutter-sm">
              <img v-if="form.logoUrl" :src="form.logoUrl" alt="" class="logo-thumb" />
              <q-btn
                no-caps
                outline
                color="primary"
                icon="upload"
                label="Subir logo"
                :loading="uploadingLogo"
                :disable="saving"
                @click="fileInputRef?.click()"
              />
              <q-btn
                v-if="form.logoUrl"
                no-caps
                flat
                color="negative"
                label="Quitar logo"
                :disable="saving || uploadingLogo"
                @click="form.logoUrl = null"
              />
              <input
                ref="fileInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                style="display: none"
                @change="onLogoSelected"
              />
            </div>
            <q-input
              :model-value="form.icon"
              label="Ícono (opcional)"
              dense
              outlined
              :maxlength="40"
              hint="Nombre de Material Icon, ej. eco, bolt, coffee — se usa si no hay logo y como marca de agua"
              @update:model-value="onIconInput"
            >
              <template v-if="form.icon" #append>
                <q-icon :name="form.icon" />
              </template>
            </q-input>

            <q-separator />
            <div class="text-subtitle2">Colores</div>
            <div class="row q-col-gutter-md">
              <div class="col-6">
                <q-input v-model="form.bgColor" label="Fondo" dense outlined :maxlength="7">
                  <template #append>
                    <q-icon name="colorize" class="cursor-pointer">
                      <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                        <q-color
                          :model-value="colorOrFallback(form.bgColor)"
                          format-model="hex"
                          no-header-tabs
                          @update:model-value="onBgPicked"
                        />
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
              </div>
              <div class="col-6">
                <q-input v-model="form.textColor" label="Texto" dense outlined :maxlength="7">
                  <template #append>
                    <q-icon name="colorize" class="cursor-pointer">
                      <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                        <q-color
                          :model-value="colorOrFallback(form.textColor)"
                          format-model="hex"
                          no-header-tabs
                          @update:model-value="onTextPicked"
                        />
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
              </div>
            </div>
            <div class="row items-center q-gutter-sm">
              <span
                v-if="contrast !== null"
                class="contrast-chip"
                :class="contrastOk ? 'contrast-chip--ok' : 'contrast-chip--bad'"
              >
                <q-icon :name="contrastOk ? 'check_circle' : 'error'" size="16px" />
                Contraste {{ formatRatio(contrast) }}
                <template v-if="!contrastOk"> — No cumple {{ MIN_TEXT_CONTRAST }}:1</template>
              </span>
              <span v-else class="text-caption text-negative">
                Los colores tienen que ser #rrggbb
              </span>
              <q-btn
                no-caps
                flat
                dense
                color="primary"
                icon="swap_horiz"
                label="Invertir colores"
                @click="swapColors"
              />
            </div>

            <q-banner v-if="serverError" dense rounded class="bg-red-1 text-negative">
              {{ serverError }}
            </q-banner>
            <ul v-if="errors.length > 0" class="error-list text-negative">
              <li v-for="message in errors" :key="message">{{ message }}</li>
            </ul>
          </div>

          <!-- ── Vista previa ─────────────────────────────────────────── -->
          <div class="col-12 col-md-5 preview-col">
            <div class="text-subtitle2 q-mb-xs">Vista previa</div>
            <div class="text-caption text-grey-7 q-mb-sm">Card del carrusel</div>
            <SponsorCardPreview v-bind="cardProps" />
            <div class="row items-center justify-between q-mt-md q-mb-sm">
              <div class="text-caption text-grey-7">Hoja de detalle</div>
              <q-toggle v-model="previewLocked" dense color="primary" label="Ver sin plan" />
            </div>
            <SponsorSheetPreview
              v-bind="cardProps"
              :conditions="form.conditions"
              :locked="previewLocked"
            />
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" v-close-popup :disable="saving || uploadingLogo" />
        <q-btn
          color="primary"
          label="Guardar"
          unelevated
          :loading="saving"
          :disable="!canSave"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import axios from 'axios';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useSponsorsApi } from 'src/composables/useSponsorsApi';
import type {
  AdminSponsor,
  CreateSponsorInput,
  SponsorFormInput,
} from 'src/composables/useSponsorsApi';
import { MIN_TEXT_CONTRAST, contrastRatio, formatRatio, isHexColor } from 'src/utils/contrast';
import {
  REDEEM_TYPE_OPTIONS,
  SPONSOR_COUNTRY_OPTIONS,
  SPONSOR_LIMITS,
  diffSponsorForm,
  emptySponsorForm,
  normalizeSponsorForm,
  sponsorToForm,
  validateSponsorForm,
} from 'src/utils/sponsors';
import SponsorCardPreview from 'src/components/sponsors/SponsorCardPreview.vue';
import SponsorSheetPreview from 'src/components/sponsors/SponsorSheetPreview.vue';

/** Datos del partner desde el que se abre el editor (alta de una marca vinculada). */
export interface SponsorPrefill {
  name: string;
  country: 'AR' | 'ES';
  partnerId: number;
  partnerName: string;
  contactName: string | null;
  contactPhone: string | null;
}

const log = createLogger('SponsorEditorDialog');
const $q = useQuasar();
const { create, update, uploadLogo, uploadingLogo } = useSponsorsApi();

const props = defineProps<{
  modelValue: boolean;
  /** null = alta. */
  sponsor: AdminSponsor | null;
  prefill?: SponsorPrefill | null;
  /** Límite de activas por país (solo para el hint del toggle). */
  maxActivePerCountry?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [sponsor: AdminSponsor];
}>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const isCreate = computed(() => props.sponsor === null);

// En pantallas angostas el diálogo ocupa todo el ancho y las previews quedan debajo.
const cardStyle = computed(() =>
  $q.screen.lt.md ? 'width: 100%; min-width: 0' : 'width: 100%; min-width: 760px; max-width: 980px'
);

// ── Form state ──────────────────────────────────────────────────────────

const form = reactive<SponsorFormInput>(emptySponsorForm());
const saving = ref(false);
const serverError = ref<string | null>(null);
const previewLocked = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
/**
 * Identifica "este formulario": sube en cada apertura (`resetForm`) y al cerrar. Una subida
 * de logo que termina cuando ya es otro formulario (otra marca, o cerrado) se descarta en vez
 * de pisar el logo de la marca equivocada (REVIEW-admin WR-02).
 */
let formSession = 0;

function resetForm(): void {
  formSession++;
  if (props.sponsor) {
    Object.assign(form, sponsorToForm(props.sponsor));
  } else {
    Object.assign(form, emptySponsorForm());
    if (props.prefill) {
      form.name = props.prefill.name;
      form.countries = [props.prefill.country];
      form.partnerId = props.prefill.partnerId;
    }
  }
  serverError.value = null;
  previewLocked.value = false;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
    else formSession++;
  },
  { immediate: true }
);

const prefillBanner = computed<string | null>(() => {
  const prefill = props.prefill;
  if (!prefill || props.sponsor) return null;
  const contact = [prefill.contactName, prefill.contactPhone].filter(Boolean).join(' ');
  return `Vinculado al partner ${prefill.partnerName}${contact ? ` · contacto ${contact}` : ''}`;
});

function onRedeemCodeInput(value: string | number | null): void {
  form.redeemCode = value === null || value === '' ? null : String(value).toUpperCase();
}

function onIconInput(value: string | number | null): void {
  form.icon = value === null || value === '' ? null : String(value).trim().toLowerCase();
}

// ── Colores y contraste ─────────────────────────────────────────────────

function colorOrFallback(value: string): string {
  return isHexColor(value) ? value : '#000000';
}

function onBgPicked(value: string | null): void {
  if (value) form.bgColor = value;
}

function onTextPicked(value: string | null): void {
  if (value) form.textColor = value;
}

function swapColors(): void {
  const bg = form.bgColor;
  form.bgColor = form.textColor;
  form.textColor = bg;
}

/** Ratio fondo/texto en vivo; null si algún color todavía no es un hex válido. */
const contrast = computed<number | null>(() =>
  isHexColor(form.bgColor) && isHexColor(form.textColor)
    ? contrastRatio(form.bgColor, form.textColor)
    : null
);
const contrastOk = computed(() => contrast.value !== null && contrast.value >= MIN_TEXT_CONTRAST);

// ── Vista previa ────────────────────────────────────────────────────────

const cardProps = computed(() => ({
  name: form.name,
  category: form.category,
  logoUrl: form.logoUrl,
  icon: form.icon,
  bgColor: form.bgColor,
  textColor: form.textColor,
  benefit: form.benefit,
  detail: form.detail,
  redeemType: form.redeemType,
  redeemCode: form.redeemCode,
}));

// ── Logo ────────────────────────────────────────────────────────────────

async function onLogoSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const session = formSession;
  try {
    const url = await uploadLogo(file);
    if (session !== formSession) {
      // El diálogo se cerró o se reabrió para otra marca mientras subía: no pisar su logo.
      log.warn('Logo upload finished after the editor changed, result discarded');
      return;
    }
    form.logoUrl = url;
  } catch (err: unknown) {
    if (session !== formSession) return;
    // Sin R2 configurado el API responde 503: el resto del editor sigue funcionando.
    const message =
      axios.isAxiosError(err) && err.response?.status === 503
        ? 'El almacenamiento de imágenes no está configurado'
        : extractError(err, 'No se pudo subir el logo');
    log.error('Error uploading sponsor logo', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

// ── Validación ──────────────────────────────────────────────────────────

const errors = computed(() => validateSponsorForm(form));

// Solo cambios respecto de la marca original (edición); en el alta no aplica.
const changes = computed(() => (props.sponsor ? diffSponsorForm(props.sponsor, form) : {}));

const canSave = computed(
  () =>
    errors.value.length === 0 &&
    !saving.value &&
    !uploadingLogo.value &&
    (isCreate.value || Object.keys(changes.value).length > 0)
);

// ── Guardar ─────────────────────────────────────────────────────────────

/** Alta sin `sortOrder`: el API deja la marca al final (max + 1). */
function buildCreatePayload(): CreateSponsorInput {
  const payload: CreateSponsorInput = normalizeSponsorForm(form);
  delete payload.sortOrder;
  return payload;
}

async function handleSave(): Promise<void> {
  serverError.value = null;
  saving.value = true;
  try {
    let saved: AdminSponsor;
    if (props.sponsor) {
      if (Object.keys(changes.value).length === 0) {
        // Nada cambió: el server respondería 400 por body vacío.
        localOpen.value = false;
        return;
      }
      saved = await update(props.sponsor.id, changes.value);
    } else {
      saved = await create(buildCreatePayload());
    }
    $q.notify({
      type: 'positive',
      message: props.sponsor ? 'Patrocinador actualizado' : 'Patrocinador creado',
    });
    emit('saved', saved);
    localOpen.value = false;
  } catch (err: unknown) {
    // El mensaje del server manda (límite de activas, contraste, fechas, partner).
    const message = extractError(err, 'No se pudo guardar el patrocinador');
    log.error('Error saving sponsor', { error: message, sponsorId: props.sponsor?.id ?? null });
    serverError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.logo-thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border: 1px solid #e5dbcd;
  border-radius: 12px;
}

.contrast-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.contrast-chip--ok {
  background: #3b7249;
}

.contrast-chip--bad {
  background: #b3261e;
}

.error-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}

@media (min-width: 1024px) {
  /* La vista previa acompaña al formulario mientras se scrollea. */
  .preview-col {
    position: sticky;
    top: 0;
    align-self: flex-start;
  }
}
</style>
