<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-sm">
      <div class="text-h5">Editor de árbol</div>
      <q-space />
      <q-btn
        flat
        dense
        round
        icon="refresh"
        :loading="loading"
        aria-label="Recargar"
        @click="loadTree"
      >
        <q-tooltip>Recargar árbol</q-tooltip>
      </q-btn>
    </div>

    <div class="text-caption text-grey-7 q-mb-md">
      Refiná el árbol auto-construido por el SPOM. Reordená ejercicios dentro de una partición con
      las flechas, agregá o quitá precedencias entre ramas, y reasigná ejercicios a otra ruta. Cada
      orden/arista muestra si es
      <q-badge color="grey-6" label="Auto" class="q-mx-xs" /> (por defecto del SPOM) o
      <q-badge color="primary" label="Manual" class="q-mx-xs" /> (override del profe). Lo manual
      prevalece y sobrevive a una reconstrucción del grafo.
    </div>

    <!-- Loading state -->
    <div v-if="loading && categories.length === 0" class="q-mt-lg">
      <q-skeleton type="rect" height="48px" class="q-mb-sm" />
      <q-skeleton type="rect" height="48px" class="q-mb-sm" />
      <q-skeleton type="rect" height="48px" />
    </div>

    <!-- Empty state -->
    <q-banner
      v-else-if="!loading && categories.length === 0"
      class="bg-grey-2 text-grey-8 q-mb-md"
      rounded
    >
      <template #avatar>
        <q-icon name="account_tree" color="info" />
      </template>
      No hay nodos en el árbol todavía. Asegurate de haber construido el grafo de progresiones.
    </q-banner>

    <!-- Tree -->
    <template v-else>
      <q-card v-for="category in categories" :key="category.key" flat bordered class="q-mb-md">
        <q-expansion-item
          :label="category.label"
          icon="category"
          header-class="text-subtitle1 text-weight-medium"
          default-opened
        >
          <q-card-section class="q-pt-none">
            <!-- Route -->
            <q-expansion-item
              v-for="rt in category.routes"
              :key="rt.id"
              :label="rt.name"
              :caption="`Ruta ${rt.route}`"
              icon="folder"
              header-class="text-body1"
              class="q-mb-xs"
            >
              <q-card-section class="q-py-sm">
                <!-- Partition (effort) -->
                <div
                  v-for="partition in rt.partitions"
                  :key="`${rt.id}-${partition.effort}`"
                  class="q-mb-md"
                >
                  <div class="row items-center q-mb-xs">
                    <div class="text-overline text-grey-8">{{ partition.effort }}</div>
                    <q-badge
                      :color="partition.overridden ? 'primary' : 'grey-6'"
                      :label="partition.overridden ? 'Manual' : 'Auto'"
                      class="q-ml-sm"
                    />
                    <q-space />
                    <q-btn
                      flat
                      dense
                      no-caps
                      size="sm"
                      icon="low_priority"
                      label="Reasignar ruta"
                      color="secondary"
                      :disable="partition.nodes.length === 0"
                      @click="openRegroup(rt, partition)"
                    />
                    <q-btn
                      flat
                      dense
                      no-caps
                      size="sm"
                      icon="alt_route"
                      label="Precedencia"
                      color="secondary"
                      class="q-ml-xs"
                      @click="openPrecedence(partition)"
                    />
                  </div>

                  <q-list bordered separator class="rounded-borders">
                    <q-item v-for="(node, index) in partition.nodes" :key="node.exerciseId" dense>
                      <q-item-section avatar>
                        <q-chip dense square color="grey-3" text-color="grey-9">
                          {{ index + 1 }}
                        </q-chip>
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>{{ node.name }}</q-item-label>
                        <q-item-label caption>
                          <q-badge
                            :color="node.orderSource === 'manual' ? 'primary' : 'grey-6'"
                            :label="node.orderSource === 'manual' ? 'Manual' : 'Auto'"
                            class="q-mr-xs"
                          />
                          <span v-if="node.dificultadLineal !== null">
                            dl {{ node.dificultadLineal }}
                          </span>
                        </q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <div class="row no-wrap q-gutter-xs">
                          <q-btn
                            flat
                            dense
                            round
                            size="sm"
                            icon="keyboard_arrow_up"
                            :disable="index === 0 || isBusy(rt.id, partition.effort)"
                            aria-label="Subir"
                            @click="moveNode(rt, partition, index, -1)"
                          />
                          <q-btn
                            flat
                            dense
                            round
                            size="sm"
                            icon="keyboard_arrow_down"
                            :disable="
                              index === partition.nodes.length - 1 ||
                              isBusy(rt.id, partition.effort)
                            "
                            aria-label="Bajar"
                            @click="moveNode(rt, partition, index, 1)"
                          />
                        </div>
                      </q-item-section>
                    </q-item>
                    <q-item v-if="partition.nodes.length === 0">
                      <q-item-section class="text-grey-6 text-caption">
                        Partición sin ejercicios.
                      </q-item-section>
                    </q-item>
                  </q-list>
                </div>
              </q-card-section>
            </q-expansion-item>
          </q-card-section>
        </q-expansion-item>
      </q-card>

      <!-- Cross-partition precedence edges -->
      <q-card flat bordered class="q-mt-md">
        <q-expansion-item
          label="Precedencias entre ramas"
          icon="alt_route"
          header-class="text-subtitle1 text-weight-medium"
        >
          <q-card-section>
            <div v-if="precedenceEdges.length === 0" class="text-caption text-grey-6">
              No hay precedencias cruzadas registradas.
            </div>
            <q-list v-else bordered separator class="rounded-borders">
              <q-item
                v-for="edge in precedenceEdges"
                :key="`${edge.fromExerciseId}-${edge.toExerciseId}`"
              >
                <q-item-section>
                  <q-item-label>
                    {{ nodeName(edge.fromExerciseId) }} → {{ nodeName(edge.toExerciseId) }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge
                    :color="edge.source === 'manual' ? 'primary' : 'grey-6'"
                    :label="edge.source === 'manual' ? 'Manual' : 'Auto'"
                  />
                </q-item-section>
                <q-item-section side>
                  <q-btn
                    v-if="edge.source === 'manual'"
                    flat
                    dense
                    round
                    size="sm"
                    icon="link_off"
                    color="negative"
                    aria-label="Quitar precedencia"
                    @click="removeEdge(edge.fromExerciseId, edge.toExerciseId)"
                  >
                    <q-tooltip>Quitar precedencia manual</q-tooltip>
                  </q-btn>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-expansion-item>
      </q-card>
    </template>

    <!-- Precedence dialog -->
    <q-dialog v-model="precedenceDialog.open">
      <q-card style="min-width: 360px">
        <q-card-section class="text-subtitle1">Agregar precedencia</q-card-section>
        <q-card-section class="q-pt-none">
          <div class="text-caption text-grey-7 q-mb-sm">
            Crea una arista manual (origen → destino) entre dos ejercicios.
          </div>
          <q-select
            v-model="precedenceDialog.fromId"
            :options="precedenceDialog.options"
            label="Origen"
            dense
            outlined
            emit-value
            map-options
            class="q-mb-sm"
          />
          <q-select
            v-model="precedenceDialog.toId"
            :options="allNodeOptions"
            label="Destino"
            dense
            outlined
            emit-value
            map-options
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey-7" @click="precedenceDialog.open = false" />
          <q-btn
            unelevated
            label="Agregar"
            color="primary"
            :loading="mutating"
            :disable="!canSubmitPrecedence"
            @click="confirmPrecedence"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Regroup (reassign route) dialog -->
    <q-dialog v-model="regroupDialog.open">
      <q-card style="min-width: 360px">
        <q-card-section class="text-subtitle1">Reasignar ruta</q-card-section>
        <q-card-section class="q-pt-none">
          <div class="text-caption text-grey-7 q-mb-sm">
            Mové uno o más ejercicios de esta partición a otra ruta.
          </div>
          <q-select
            v-model="regroupDialog.exerciseIds"
            :options="regroupDialog.nodeOptions"
            label="Ejercicios a mover"
            dense
            outlined
            multiple
            emit-value
            map-options
            use-chips
            class="q-mb-sm"
          />
          <q-select
            v-model="regroupDialog.targetRoute"
            :options="routeOptions"
            label="Ruta destino"
            dense
            outlined
            emit-value
            map-options
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey-7" @click="regroupDialog.open = false" />
          <q-btn
            unelevated
            label="Reasignar"
            color="primary"
            :loading="mutating"
            :disable="!canSubmitRegroup"
            @click="confirmRegroup"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useTreeEditorApi } from 'src/composables/useTreeEditorApi';
import type {
  EditableTree,
  TreeCategory,
  TreeRoute,
  TreePartition,
  PrecedenceEdge,
  Effort,
} from 'src/types/tree-editor';

const $q = useQuasar();
const treeApi = useTreeEditorApi();
const { loading } = treeApi;

// =========================================================================
// State
// =========================================================================

const categories = ref<TreeCategory[]>([]);
const precedenceEdges = ref<PrecedenceEdge[]>([]);
const mutating = ref(false);
/** Key `${routeId}-${effort}` currently being reordered (disables its buttons). */
const busyPartition = ref<string | null>(null);

interface SelectOption {
  label: string;
  value: number;
}

interface RouteOption {
  label: string;
  value: string;
}

const precedenceDialog = reactive<{
  open: boolean;
  fromId: number | null;
  toId: number | null;
  options: SelectOption[];
}>({
  open: false,
  fromId: null,
  toId: null,
  options: [],
});

const regroupDialog = reactive<{
  open: boolean;
  exerciseIds: number[];
  targetRoute: string | null;
  nodeOptions: SelectOption[];
  sourceRouteId: number | null;
}>({
  open: false,
  exerciseIds: [],
  targetRoute: null,
  nodeOptions: [],
  sourceRouteId: null,
});

// =========================================================================
// Derived lookups
// =========================================================================

/** All nodes flattened, for name lookup + global option lists. */
const allNodes = computed(() => {
  const out: { exerciseId: number; name: string }[] = [];
  for (const cat of categories.value) {
    for (const rt of cat.routes) {
      for (const part of rt.partitions) {
        for (const node of part.nodes) {
          out.push({ exerciseId: node.exerciseId, name: node.name });
        }
      }
    }
  }
  return out;
});

const allNodeOptions = computed<SelectOption[]>(() =>
  allNodes.value.map((n) => ({ label: n.name, value: n.exerciseId }))
);

/** Distinct routes (by code) currently in the tree, for the reassign-route target. */
const routeOptions = computed<RouteOption[]>(() => {
  const byCode = new Map<string, string>();
  for (const cat of categories.value) {
    for (const rt of cat.routes) {
      if (!byCode.has(rt.route)) byCode.set(rt.route, `${rt.name} (${rt.route})`);
    }
  }
  return Array.from(byCode.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

function nodeName(exerciseId: number): string {
  const found = allNodes.value.find((n) => n.exerciseId === exerciseId);
  return found ? found.name : `#${exerciseId}`;
}

function isBusy(routeId: number, effort: string): boolean {
  return busyPartition.value === `${routeId}-${effort}`;
}

const canSubmitPrecedence = computed(
  () =>
    precedenceDialog.fromId !== null &&
    precedenceDialog.toId !== null &&
    precedenceDialog.fromId !== precedenceDialog.toId
);

const canSubmitRegroup = computed(
  () => regroupDialog.exerciseIds.length > 0 && regroupDialog.targetRoute !== null
);

// =========================================================================
// Data loading
// =========================================================================

async function loadTree() {
  try {
    const data: EditableTree = await treeApi.fetchTree();
    categories.value = data.categories;
    precedenceEdges.value = data.precedenceEdges;
  } catch {
    // Error already handled by the composable.
  }
}

// =========================================================================
// Reorder (up/down) — refetch on success for robustness/consistency.
// =========================================================================

async function moveNode(rt: TreeRoute, partition: TreePartition, index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= partition.nodes.length) return;

  // Build the new order locally (does not mutate the source until refetch).
  const orderedExerciseIds = partition.nodes.map((n) => n.exerciseId);
  const moved = orderedExerciseIds[index];
  const swapped = orderedExerciseIds[target];
  if (moved === undefined || swapped === undefined) return;
  orderedExerciseIds[index] = swapped;
  orderedExerciseIds[target] = moved;

  const key = `${rt.id}-${partition.effort}`;
  busyPartition.value = key;
  try {
    await treeApi.reorderPartition({
      route: rt.route,
      effort: partition.effort as Effort,
      orderedExerciseIds,
    });
    $q.notify({ type: 'positive', message: 'Orden actualizado' });
    await loadTree();
  } catch {
    // Error handled by composable.
  } finally {
    busyPartition.value = null;
  }
}

// =========================================================================
// Precedence dialog
// =========================================================================

function openPrecedence(partition: TreePartition) {
  precedenceDialog.options = partition.nodes.map((n) => ({
    label: n.name,
    value: n.exerciseId,
  }));
  precedenceDialog.fromId = null;
  precedenceDialog.toId = null;
  precedenceDialog.open = true;
}

async function confirmPrecedence() {
  if (
    !canSubmitPrecedence.value ||
    precedenceDialog.fromId === null ||
    precedenceDialog.toId === null
  ) {
    return;
  }
  mutating.value = true;
  try {
    await treeApi.setPrecedence({
      fromExerciseId: precedenceDialog.fromId,
      toExerciseId: precedenceDialog.toId,
      op: 'add',
    });
    $q.notify({ type: 'positive', message: 'Precedencia agregada' });
    precedenceDialog.open = false;
    await loadTree();
  } catch {
    // Error handled by composable.
  } finally {
    mutating.value = false;
  }
}

async function removeEdge(fromExerciseId: number, toExerciseId: number) {
  mutating.value = true;
  try {
    await treeApi.setPrecedence({ fromExerciseId, toExerciseId, op: 'remove' });
    $q.notify({ type: 'info', message: 'Precedencia quitada' });
    await loadTree();
  } catch {
    // Error handled by composable.
  } finally {
    mutating.value = false;
  }
}

// =========================================================================
// Regroup (reassign route) dialog
// =========================================================================

function openRegroup(rt: TreeRoute, partition: TreePartition) {
  regroupDialog.nodeOptions = partition.nodes.map((n) => ({
    label: n.name,
    value: n.exerciseId,
  }));
  regroupDialog.exerciseIds = [];
  regroupDialog.targetRoute = null;
  regroupDialog.sourceRouteId = rt.id;
  regroupDialog.open = true;
}

async function confirmRegroup() {
  if (!canSubmitRegroup.value || regroupDialog.targetRoute === null) return;
  mutating.value = true;
  try {
    await treeApi.regroup({
      exerciseIds: regroupDialog.exerciseIds,
      targetRoute: regroupDialog.targetRoute,
    });
    $q.notify({ type: 'positive', message: 'Ejercicios reasignados' });
    regroupDialog.open = false;
    await loadTree();
  } catch {
    // Error handled by composable.
  } finally {
    mutating.value = false;
  }
}

// =========================================================================
// Lifecycle — component owns cleanup (composable exposes cleanup(), no
// onUnmounted inside it per CLAUDE.md).
// =========================================================================

onMounted(() => {
  loadTree();
});

onUnmounted(() => {
  treeApi.cleanup();
});
</script>
