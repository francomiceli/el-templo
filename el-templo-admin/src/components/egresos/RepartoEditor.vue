<template>
  <div>
    <!-- Reparto del gasto (DI-08). Las tres formas son ayudas del formulario:
         lo que se guarda son siempre los importes por destino ya calculados. -->
    <div class="text-subtitle2 q-mb-xs">Reparto *</div>

    <q-btn-toggle
      v-model="mode"
      :options="MODE_OPTIONS"
      unelevated
      no-caps
      dense
      toggle-color="primary"
      color="grey-3"
      text-color="grey-8"
      class="q-mb-sm"
    />

    <div v-if="!amountIsValid" class="text-caption text-grey-7 q-mb-sm">
      Cargá primero el importe del gasto para armar el reparto.
    </div>

    <!-- Directo: todo el importe a un destino -->
    <div v-if="mode === 'directo'">
      <q-select
        v-model="directoKey"
        :options="destinationOptions"
        label="Destino *"
        dense
        outlined
        emit-value
        map-options
        hint="Todo el importe va a este destino."
      />
    </div>

    <!-- Partes iguales entre las sedes del país (sin Casa Matriz) -->
    <div v-else-if="mode === 'iguales'">
      <div v-if="evenBranches.length === 0" class="text-negative text-caption">
        No hay sedes para repartir en partes iguales.
      </div>
      <template v-else>
        <div class="text-body2 q-mb-xs">Entre las sedes de {{ countryName }}</div>
        <q-markup-table flat bordered dense separator="horizontal">
          <thead>
            <tr>
              <th class="text-left">Sede</th>
              <th class="text-right">Parte</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(dest, i) in evenBranches" :key="dest.branchId ?? 'cm'">
              <td class="text-left">{{ dest.name }}</td>
              <td class="text-right">
                {{ evenParts[i] !== undefined ? formatPrice(evenParts[i], currency) : '—' }}
              </td>
            </tr>
          </tbody>
        </q-markup-table>
        <div v-if="evenRemainder > 0 && lastEvenBranch" class="text-caption text-grey-8 q-mt-xs">
          El resto de la división ({{ formatPrice(evenRemainder, currency) }}) va a
          {{ lastEvenBranch.name }}.
        </div>
        <div v-if="amountIsValid && evenPartsTooSmall" class="text-caption text-negative q-mt-xs">
          El importe no alcanza para darle al menos 1 a cada sede.
        </div>
      </template>
    </div>

    <!-- Por montos: filas destino + importe -->
    <div v-else>
      <div v-for="(row, i) in rows" :key="row.uid" class="row q-col-gutter-sm items-start q-mb-xs">
        <div class="col-12 col-sm-6">
          <q-select
            :model-value="row.key"
            :options="optionsForRow(i)"
            label="Destino *"
            dense
            outlined
            emit-value
            map-options
            @update:model-value="(v: string | null) => (row.key = v)"
          />
        </div>
        <div class="col-9 col-sm-4">
          <q-input
            :model-value="row.amount"
            type="number"
            inputmode="numeric"
            step="1"
            min="1"
            label="Importe *"
            dense
            outlined
            :rules="[moneyIntegerRule]"
            lazy-rules
            @update:model-value="(v: string | number | null) => (row.amount = toNumberOrNull(v))"
          />
        </div>
        <div class="col-3 col-sm-2 text-right">
          <q-btn
            flat
            round
            dense
            icon="delete"
            color="negative"
            :disable="rows.length <= 1"
            @click="removeRow(i)"
          >
            <q-tooltip>Quitar destino</q-tooltip>
          </q-btn>
        </div>
      </div>

      <div v-if="hasDuplicateDestinations" class="text-caption text-negative q-mb-xs">
        Un destino no puede repetirse en el reparto.
      </div>

      <div class="row items-center q-gutter-sm q-mt-xs">
        <q-btn
          flat
          dense
          no-caps
          icon="add"
          label="Agregar destino"
          color="primary"
          :disable="!canAddRow"
          @click="addRow"
        />
        <q-btn
          v-if="canCompleteLastRow"
          flat
          dense
          no-caps
          icon="playlist_add_check"
          label="Completar con lo que falta"
          color="primary"
          @click="completeLastRow"
        />
      </div>

      <!-- Pie: asignado vs importe, y lo que falta o sobra -->
      <div v-if="amountIsValid" class="q-mt-sm text-body2">
        Asignado {{ formatPrice(assigned, currency) }} de {{ formatPrice(amountValue, currency) }}
        <span v-if="difference > 0" class="text-warning text-weight-medium">
          · Falta {{ formatPrice(difference, currency) }}
        </span>
        <span v-else-if="difference < 0" class="text-negative text-weight-medium">
          · Sobra {{ formatPrice(-difference, currency) }}
        </span>
        <q-icon v-else name="check_circle" color="positive" size="sm" class="q-ml-xs" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatPrice } from 'src/utils/format-price';
import {
  allocationDifference,
  allocationsSum,
  isValidMoneyInteger,
  moneyIntegerRule,
  splitEvenly,
  splitEvenlyRemainder,
  toNumberOrNull,
} from 'src/utils/expenses';
import type {
  ExpenseAllocationInput,
  ExpenseCountry,
  ExpenseDestinationOption,
} from 'src/types/expense';

export type RepartoMode = 'directo' | 'iguales' | 'montos';

/**
 * Editor de reparto del gasto (DI-08).
 *
 * `modelValue` se lee UNA vez al montar (para arrancar en "Directo" o "Por
 * montos" al editar un gasto): después el editor es la fuente y emite
 * `update:modelValue` con los importes por destino ya calculados. El
 * diálogo lo monta de nuevo cada vez que se abre.
 *
 * `extraDestinations` son sedes que ya están en el reparto guardado pero hoy
 * no se ofrecen (inactivas): se pueden elegir en "Directo" y "Por montos" para
 * no perderlas al editar, pero nunca entran en "Partes iguales".
 */
const props = withDefaults(
  defineProps<{
    modelValue: ExpenseAllocationInput[];
    /** importe del gasto, entero; null mientras no esté cargado */
    amount: number | null;
    currency: string;
    country: ExpenseCountry;
    /** sedes operativas del país (y Casa Matriz, `branchId: null`, solo en Argentina) */
    destinations: ExpenseDestinationOption[];
    extraDestinations?: ExpenseDestinationOption[];
    initialMode?: RepartoMode;
  }>(),
  { extraDestinations: () => [], initialMode: undefined }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: ExpenseAllocationInput[]): void;
  (e: 'update:valid', value: boolean): void;
}>();

const MODE_OPTIONS: Array<{ label: string; value: RepartoMode }> = [
  { label: 'Directo', value: 'directo' },
  { label: 'Partes iguales', value: 'iguales' },
  { label: 'Por montos', value: 'montos' },
];

const CASA_MATRIZ_KEY = 'casa_matriz';

/** Clave de select de un destino: id de sede como string o 'casa_matriz'. */
function keyOf(branchId: number | null): string {
  return branchId === null ? CASA_MATRIZ_KEY : String(branchId);
}

function branchIdOf(key: string): number | null {
  return key === CASA_MATRIZ_KEY ? null : Number(key);
}

interface MontoRow {
  uid: number;
  key: string | null;
  amount: number | null;
}

let nextUid = 1;
function newRow(key: string | null = null, amount: number | null = null): MontoRow {
  return { uid: nextUid++, key, amount };
}

// ---------------------------------------------------------------------------
// Estado inicial (desde el reparto guardado, si lo hay)
// ---------------------------------------------------------------------------

const initial = props.modelValue;
const mode = ref<RepartoMode>(props.initialMode ?? (initial.length > 1 ? 'montos' : 'directo'));
const directoKey = ref<string | null>(initial.length === 1 ? keyOf(initial[0].branchId) : null);
const rows = ref<MontoRow[]>(
  initial.length > 0 ? initial.map((a) => newRow(keyOf(a.branchId), a.amount)) : [newRow()]
);

// ---------------------------------------------------------------------------
// Destinos
// ---------------------------------------------------------------------------

const countryName = computed(() => (props.country === 'ES' ? 'España' : 'Argentina'));

/** Sedes operativas, en el orden recibido (el que define el resto en partes iguales). */
const evenBranches = computed(() => props.destinations.filter((d) => d.branchId !== null));
const lastEvenBranch = computed(() => evenBranches.value[evenBranches.value.length - 1] ?? null);

const destinationOptions = computed<Array<{ label: string; value: string }>>(() => {
  const seen = new Set<string>();
  const out: Array<{ label: string; value: string }> = [];
  for (const d of [...props.destinations, ...props.extraDestinations]) {
    const key = keyOf(d.branchId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: d.name, value: key });
  }
  return out;
});

// ---------------------------------------------------------------------------
// Cálculo del reparto por forma
// ---------------------------------------------------------------------------

const amountIsValid = computed(() => isValidMoneyInteger(props.amount));
/** Importe para mostrar: solo se usa cuando `amountIsValid`. */
const amountValue = computed(() => (isValidMoneyInteger(props.amount) ? props.amount : 0));

const evenParts = computed<number[]>(() =>
  amountIsValid.value ? splitEvenly(amountValue.value, evenBranches.value.length) : []
);
const evenRemainder = computed(() =>
  amountIsValid.value ? splitEvenlyRemainder(amountValue.value, evenBranches.value.length) : 0
);
const evenPartsTooSmall = computed(() => evenParts.value.some((p) => !isValidMoneyInteger(p)));

function buildAllocations(m: RepartoMode): ExpenseAllocationInput[] {
  if (m === 'directo') {
    if (directoKey.value === null || !isValidMoneyInteger(props.amount)) return [];
    return [{ branchId: branchIdOf(directoKey.value), amount: props.amount }];
  }
  if (m === 'iguales') {
    if (!isValidMoneyInteger(props.amount)) return [];
    const parts = splitEvenly(props.amount, evenBranches.value.length);
    return evenBranches.value.map((d, i) => ({ branchId: d.branchId, amount: parts[i] }));
  }
  const out: ExpenseAllocationInput[] = [];
  for (const r of rows.value) {
    if (r.key !== null && r.amount !== null) {
      out.push({ branchId: branchIdOf(r.key), amount: r.amount });
    }
  }
  return out;
}

const allocations = computed(() => buildAllocations(mode.value));

// ---------------------------------------------------------------------------
// Por montos
// ---------------------------------------------------------------------------

const assigned = computed(() => allocationsSum(rows.value));
const difference = computed(() =>
  amountIsValid.value ? allocationDifference(amountValue.value, rows.value) : 0
);

const hasDuplicateDestinations = computed(() => {
  const keys = rows.value.map((r) => r.key).filter((k): k is string => k !== null);
  return new Set(keys).size !== keys.length;
});

/** Destinos que se pueden elegir en la fila `index`: los que no usa otra fila. */
function optionsForRow(index: number): Array<{ label: string; value: string }> {
  const usedElsewhere = new Set(rows.value.filter((_, i) => i !== index).map((r) => r.key));
  return destinationOptions.value.filter((o) => !usedElsewhere.has(o.value));
}

const MAX_ROWS = 50;
const canAddRow = computed(
  () => rows.value.length < Math.min(destinationOptions.value.length, MAX_ROWS)
);

function addRow() {
  rows.value.push(newRow());
}

function removeRow(index: number) {
  if (rows.value.length > 1) rows.value.splice(index, 1);
}

/** Lo que le falta a la última fila para que el reparto cierre (sin contarla a ella). */
const lastRowFill = computed(() => {
  if (!amountIsValid.value || rows.value.length === 0) return null;
  return allocationDifference(amountValue.value, rows.value.slice(0, -1));
});

const canCompleteLastRow = computed(() => {
  const fill = lastRowFill.value;
  const last = rows.value[rows.value.length - 1];
  return fill !== null && last !== undefined && isValidMoneyInteger(fill) && last.amount !== fill;
});

function completeLastRow() {
  const fill = lastRowFill.value;
  const last = rows.value[rows.value.length - 1];
  if (fill !== null && last !== undefined && isValidMoneyInteger(fill)) last.amount = fill;
}

// Al pasar a "Por montos" desde otra forma, las filas arrancan con lo que ya
// estaba armado (así se ajusta a mano en vez de empezar de cero).
watch(
  mode,
  (next, prev) => {
    const previous = buildAllocations(prev);
    if (next === 'montos') {
      const empty = rows.value.every((r) => r.key === null && r.amount === null);
      if (empty && previous.length > 0) {
        rows.value = previous.map((a) =>
          newRow(keyOf(a.branchId), isValidMoneyInteger(a.amount) ? a.amount : null)
        );
      }
    } else if (next === 'directo' && directoKey.value === null && previous.length > 0) {
      directoKey.value = keyOf(previous[0].branchId);
    }
  },
  { flush: 'sync' }
);

// ---------------------------------------------------------------------------
// Validez y salida
// ---------------------------------------------------------------------------

const valid = computed(() => {
  if (!amountIsValid.value) return false;
  const out = allocations.value;
  if (out.length === 0) return false;
  if (!out.every((a) => isValidMoneyInteger(a.amount))) return false;
  if (new Set(out.map((a) => keyOf(a.branchId))).size !== out.length) return false;
  if (mode.value === 'montos') {
    if (rows.value.some((r) => r.key === null || !isValidMoneyInteger(r.amount))) return false;
  }
  return allocationDifference(amountValue.value, out) === 0;
});

watch(allocations, (value) => emit('update:modelValue', value), { immediate: true });
watch(valid, (value) => emit('update:valid', value), { immediate: true });
</script>
