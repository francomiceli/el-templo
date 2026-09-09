<template>
  <q-dialog v-model="show" persistent @show="onShow" @hide="resetAll">
    <q-card style="width: 640px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Cerrar caja</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="submitting" @click="onSkip" />
      </q-card-section>

      <q-card-section v-if="loading" class="text-center q-pa-lg text-grey-6">
        <q-spinner size="32px" /> Cargando la caja…
      </q-card-section>

      <template v-else-if="expected">
        <q-card-section class="q-pt-sm">
          <div class="text-subtitle2 text-grey-7">{{ expected.cashRegisterName }}</div>

          <!-- Esperado, grande -->
          <div class="text-caption text-grey-7 q-mt-sm">Debería haber en el cajón</div>
          <div class="text-h4 text-weight-bold">
            {{ formatPrice(expected.expectedAmount, expected.currency) }}
          </div>
          <div class="text-caption text-grey-7">
            Fondo de cambio {{ formatPrice(expected.changeFund, expected.currency) }} · cobros en
            efectivo {{ formatPrice(expected.firmeAmount + expected.pendienteAmount, expected.currency) }}
            <span v-if="expected.pendienteAmount > 0">
              ({{ formatPrice(expected.pendienteAmount, expected.currency) }} sin validar todavía)
            </span>
          </div>

          <!-- Cobros desde el último cierre -->
          <div class="q-mt-md">
            <div class="text-subtitle2">
              Cobros en efectivo desde el último cierre
              <span class="text-grey-7 text-weight-regular">
                · {{ expected.paymentsSinceLastCount.length }} ·
                {{ formatPrice(expected.paymentsSinceLastCountTotal, expected.currency) }}
              </span>
            </div>
            <q-list v-if="expected.paymentsSinceLastCount.length > 0" dense separator class="q-mt-xs">
              <q-item v-for="p in expected.paymentsSinceLastCount" :key="p.id">
                <q-item-section>
                  <q-item-label>{{ p.memberName || '—' }}</q-item-label>
                  <q-item-label caption>
                    {{ p.concept ?? '' }}
                    <span v-if="p.validationStatus === 'pendiente'" class="text-warning">
                      · pendiente de validación</span
                    >
                  </q-item-label>
                </q-item-section>
                <q-item-section side class="text-weight-medium text-grey-9">
                  {{ formatPrice(p.amount, p.currency) }}
                </q-item-section>
              </q-item>
            </q-list>
            <div v-else class="text-caption text-grey-6 q-mt-xs">
              Sin cobros nuevos desde el último cierre.
            </div>
          </div>

          <!-- Anulados después del último cierre: explican un esperado que bajó sin retiro -->
          <div v-if="expected.voidedSinceLastCount.length > 0" class="q-mt-md">
            <div class="text-subtitle2 text-negative">
              Anulados después del último cierre
              <span class="text-grey-7 text-weight-regular">
                · {{ expected.voidedSinceLastCount.length }} ·
                {{ formatPrice(expected.voidedSinceLastCountTotal, expected.currency) }}
              </span>
            </div>
            <div class="text-caption text-grey-7">
              Se contaron en el cierre anterior y gestión los anuló: ya no se esperan en el cajón.
            </div>
            <q-list dense separator class="q-mt-xs">
              <q-item v-for="p in expected.voidedSinceLastCount" :key="`void-${p.id}`">
                <q-item-section>
                  <q-item-label class="text-strike text-grey-7">{{ p.memberName || '—' }}</q-item-label>
                  <q-item-label caption>
                    Anulado {{ formatDateTime(p.voidedAt) }}
                    <span v-if="p.voidReason"> · {{ p.voidReason }}</span>
                  </q-item-label>
                </q-item-section>
                <q-item-section side class="text-weight-medium text-negative">
                  −{{ formatPrice(p.amount, p.currency) }}
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <div v-if="expected.lastCount" class="text-caption text-grey-6 q-mt-sm">
            Último cierre: {{ formatDateTime(expected.lastCount.countedAt) }} por
            {{ expected.lastCount.counterName }} ·
            {{
              expected.lastCount.difference === 0
                ? 'sin diferencia'
                : `diferencia ${formatSigned(expected.lastCount.difference, expected.currency)}`
            }}
          </div>

          <!-- Conteo -->
          <q-input
            v-model.number="countedAmount"
            type="number"
            inputmode="numeric"
            label="Plata contada en el cajón *"
            outlined
            class="q-mt-md"
            :suffix="currencySymbol(expected.currency)"
            autofocus
          />
          <q-banner
            v-if="typeof countedAmount === 'number'"
            dense
            rounded
            class="q-mt-sm"
            :class="difference === 0 ? 'bg-green-1 text-green-9' : 'bg-orange-1 text-orange-10'"
          >
            <template v-if="difference === 0">Coincide con lo esperado.</template>
            <template v-else>
              {{ difference > 0 ? 'Sobra' : 'Falta' }}
              {{ formatPrice(Math.abs(difference), expected.currency) }}. Anotá el motivo y cerrá
              igual: gestión lo revisa.
            </template>
          </q-banner>
          <q-input
            v-model="notes"
            type="textarea"
            :label="difference !== 0 ? 'Motivo de la diferencia *' : 'Notas (opcional)'"
            outlined
            dense
            autogrow
            maxlength="2000"
            class="q-mt-sm"
          />
        </q-card-section>
      </template>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          v-if="mode === 'coach'"
          flat
          :label="skipLabel"
          :disable="submitting"
          @click="onSkip"
        />
        <q-btn v-else flat label="Cancelar" :disable="submitting" @click="onSkip" />
        <q-btn
          size="lg"
          color="primary"
          label="Registrar cierre"
          :loading="submitting"
          :disable="!canSubmit"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useFinanceLoadApi } from 'src/composables/useFinanceLoadApi';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type { CashCountExpected, CashCountListItem } from 'src/types/transaction';

// =========================================================================
// Cierre de caja / arqueo (feedback caja/cobros 2026-09-08, opción A).
// El sistema muestra lo que debería haber en el cajón (fondo + cobros en
// efectivo, validados o no), el profe cuenta, y si difiere anota el motivo y
// cierra igual. No toca el ledger: gestión ve la diferencia y decide.
//
// Ship 2026-09-08 (c04b6ea0 + fix gate 0192-0195): este archivo se toca para
// que el paths-filter del deploy construya el admin junto con la API.
// 2026-09-09: si gestión anuló un cobro que ya se contó en el cierre anterior,
// el esperado baja sin retiro; el diálogo lo lista tachado para que el profe
// (o gestión) entienda el descuadre en vez de buscar plata que no falta.
// Dos modos con el mismo diálogo:
//   - coach: por sede (la caja se resuelve en el server), desde el check-out de
//     Mi jornada. Puede saltearlo ("Cerrar jornada sin contar").
//   - gestion: por caja, desde Caja → Retiros.
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  mode: 'coach' | 'gestion';
  /** coach: sede de la jornada. */
  branchId?: number;
  /** gestion: caja a arquear. */
  cashRegisterId?: number;
  /** coach: jornada abierta, queda vinculada al arqueo. */
  staffShiftId?: number;
  skipLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'registered', cashCount: CashCountListItem): void;
  /** El usuario decidió no contar (o la caja no se pudo cargar). */
  (e: 'skipped'): void;
}>();

const log = createLogger('CerrarCajaDialog');
const $q = useQuasar();
const financeApi = useFinanceLoadApi();
const transactionsApi = useTransactionsApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});
const skipLabel = computed(() => props.skipLabel ?? 'Cerrar jornada sin contar');

const loading = ref(false);
const submitting = ref(false);
const expected = ref<CashCountExpected | null>(null);
const countedAmount = ref<number | null>(null);
const notes = ref('');

const difference = computed(() =>
  typeof countedAmount.value === 'number' && expected.value
    ? countedAmount.value - expected.value.expectedAmount
    : 0
);

const canSubmit = computed(() => {
  if (!expected.value) return false;
  if (typeof countedAmount.value !== 'number' || countedAmount.value < 0) return false;
  if (difference.value !== 0 && notes.value.trim().length === 0) return false;
  return true;
});

async function onShow() {
  loading.value = true;
  try {
    if (props.mode === 'coach') {
      if (props.branchId === undefined) throw new Error('Falta la sede');
      expected.value = await financeApi.getCajaExpected(props.branchId);
    } else {
      if (props.cashRegisterId === undefined) throw new Error('Falta la caja');
      expected.value = await transactionsApi.getCashCountExpected(props.cashRegisterId);
    }
  } catch (err: unknown) {
    // Sin caja de efectivo en la sede (404) o error: no trabamos el check-out.
    const message = extractError(err, 'No se pudo cargar la caja');
    log.warn('Cierre de caja no disponible', { error: message });
    $q.notify({ type: 'warning', message: `Cierre de caja no disponible: ${message}` });
    show.value = false;
    emit('skipped');
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!canSubmit.value || !expected.value) return;
  submitting.value = true;
  try {
    const payload = {
      countedAmount: countedAmount.value as number,
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
      ...(props.staffShiftId !== undefined ? { staffShiftId: props.staffShiftId } : {}),
    };
    const cashCount =
      props.mode === 'coach'
        ? await financeApi.registerCashCount({ branchId: props.branchId as number, ...payload })
        : await transactionsApi.registerCashCount({
            cajaId: props.cashRegisterId as number,
            ...payload,
          });
    $q.notify({
      type: 'positive',
      message:
        cashCount.difference === 0
          ? 'Caja cerrada, sin diferencia'
          : `Caja cerrada con diferencia ${formatSigned(cashCount.difference, cashCount.currency)}`,
    });
    show.value = false;
    emit('registered', cashCount);
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo registrar el cierre');
    log.error('Error registering cash count', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

function onSkip() {
  show.value = false;
  emit('skipped');
}

function resetAll() {
  expected.value = null;
  countedAmount.value = null;
  notes.value = '';
}

function formatSigned(amount: number, currency: string): string {
  return `${amount > 0 ? '+' : '-'}${formatPrice(Math.abs(amount), currency)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
}

function currencySymbol(currency: string): string {
  if (currency === 'EUR') return '€';
  if (currency === 'ARS') return '$';
  return currency;
}

onUnmounted(() => {
  financeApi.cleanup();
  transactionsApi.cleanup();
});
</script>
