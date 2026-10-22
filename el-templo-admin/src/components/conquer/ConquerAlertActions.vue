<!--
  Acciones sobre las alertas del alumno (fase 201, §5, §5.1, §2.2, S12-6). Una fila por alerta con
  su color y su `label`, y la acción que corresponde (`alertActionKind`):
  - molestia / caída: aceptar el recorte de una etapa (`cutProposal.label`) o, si ya no quedan
    etapas, elegir qué escalón bajar (ConquerCutDialog);
  - tope de escalera: texto "extendé la escalera desde Catálogo";
  - paso de nivel: confirmar el nivel nuevo con los días (ConquerLevelUpDialog);
  - inactivo, control vencido, día 0 pendiente: solo el texto de lo que propone §5.
  Las alertas guardadas (con id) se pueden marcar vistas o resueltas. Con `cutStage > 0` se puede
  deshacer la última etapa. Las acciones del recorte y del nivel devuelven la ficha completa
  (`updated`); vista/resuelta devuelven la alerta, así que avisan con `changed` y la página relee.
-->
<template>
  <q-card v-if="ficha.alerts.length > 0 || ficha.member.cutStage > 0" flat bordered>
    <q-card-section class="q-pb-none">
      <div class="text-subtitle1 text-weight-medium">Alertas</div>
    </q-card-section>

    <q-list separator>
      <q-item
        v-for="(a, idx) in ficha.alerts"
        :key="a.id ?? `${a.kind}-${idx}`"
        class="items-start"
        data-test="conquer-ficha-alert"
      >
        <q-item-section>
          <div class="row items-center q-gutter-x-sm">
            <q-chip
              dense
              square
              :color="SEVERITY_CHIP_COLOR[a.severity]"
              text-color="white"
              :label="a.label"
              class="q-ma-none"
            />
          </div>

          <div class="q-mt-sm row items-center q-gutter-sm">
            <template v-if="actionOf(a) === 'aceptar_etapa'">
              <q-btn
                unelevated
                no-caps
                color="secondary"
                :label="`Aceptar: ${ficha.cutProposal.label}`"
                :loading="busy === busyKey('etapa', a)"
                :disable="busy !== null"
                style="min-height: 44px"
                data-test="conquer-alert-accept-cut"
                @click="acceptStage(a)"
              />
            </template>

            <template v-else-if="actionOf(a) === 'bajar_escalon'">
              <q-btn
                unelevated
                no-caps
                color="secondary"
                label="Bajar un escalón"
                :disable="busy !== null"
                style="min-height: 44px"
                data-test="conquer-alert-lower-step"
                @click="openCutDialog(a)"
              />
              <span class="text-caption text-grey-8">{{ ficha.cutProposal.label }}</span>
            </template>

            <template v-else-if="actionOf(a) === 'confirmar_nivel'">
              <q-btn
                unelevated
                no-caps
                color="secondary"
                :label="`Confirmar ${nextLevelText}`"
                :disable="busy !== null"
                style="min-height: 44px"
                data-test="conquer-alert-level-up"
                @click="levelUpOpen = true"
              />
            </template>

            <span v-else-if="hintOf(a)" class="text-body2 text-accent">{{ hintOf(a) }}</span>

            <q-space />

            <template v-if="a.id !== null">
              <q-btn
                v-if="a.status === 'abierta'"
                flat
                no-caps
                color="accent"
                label="Vista"
                :loading="busy === busyKey('vista', a)"
                :disable="busy !== null"
                style="min-height: 44px"
                @click="setStatus(a, 'vista')"
              />
              <q-btn
                flat
                no-caps
                color="secondary"
                :label="actionOf(a) === 'extender_escalera' ? 'Marcar resuelta' : 'Resuelta'"
                :loading="busy === busyKey('resuelta', a)"
                :disable="busy !== null"
                style="min-height: 44px"
                data-test="conquer-alert-resolve"
                @click="setStatus(a, 'resuelta')"
              />
            </template>
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <q-card-section v-if="ficha.member.cutStage > 0" class="row items-center q-gutter-sm">
      <div class="text-body2 col">Recorte vigente: etapa {{ ficha.member.cutStage }}.</div>
      <q-btn
        outline
        no-caps
        color="accent"
        label="Deshacer la última etapa de recorte"
        :loading="busy === 'deshacer'"
        :disable="busy !== null"
        style="min-height: 44px"
        data-test="conquer-alert-undo-cut"
        @click="confirmUndo"
      />
    </q-card-section>

    <ConquerCutDialog
      v-model="cutDialogOpen"
      :ficha="ficha"
      :alert="cutDialogAlert"
      @done="onDone"
    />
    <ConquerLevelUpDialog v-model="levelUpOpen" :ficha="ficha" @done="onDone" />
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import ConquerCutDialog from 'src/components/conquer/ConquerCutDialog.vue';
import ConquerLevelUpDialog from 'src/components/conquer/ConquerLevelUpDialog.vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import { LEVEL_LABELS, type BoardAlert, type FichaResponse } from 'src/types/conquer';
import {
  ALERT_HINTS,
  SEVERITY_CHIP_COLOR,
  alertActionKind,
  type AlertActionKind,
} from 'src/utils/conquer-format';

const props = defineProps<{
  ficha: FichaResponse;
}>();

const emit = defineEmits<{
  /** Una acción devolvió la ficha completa. */
  updated: [ficha: FichaResponse];
  /** Cambió una alerta (vista/resuelta): la página relee la ficha. */
  changed: [];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

// Qué botón está trabajando: bloquea el resto para no mandar dos acciones en paralelo.
const busy = ref<string | null>(null);
const cutDialogOpen = ref(false);
const cutDialogAlert = ref<BoardAlert | null>(null);
const levelUpOpen = ref(false);

const nextLevelText = computed(() =>
  props.ficha.levelUp.to ? LEVEL_LABELS[props.ficha.levelUp.to] : 'nivel nuevo'
);

function actionOf(alert: BoardAlert): AlertActionKind {
  return alertActionKind(alert.kind, props.ficha.cutProposal.kind, props.ficha.levelUp.to !== null);
}

function hintOf(alert: BoardAlert): string | null {
  return ALERT_HINTS[alert.kind] ?? null;
}

function busyKey(action: string, alert: BoardAlert): string {
  return `${action}:${alert.id ?? alert.kind}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function onDone(ficha: FichaResponse): void {
  emit('updated', ficha);
}

function openCutDialog(alert: BoardAlert): void {
  cutDialogAlert.value = alert;
  cutDialogOpen.value = true;
}

async function acceptStage(alert: BoardAlert): Promise<void> {
  busy.value = busyKey('etapa', alert);
  try {
    const ficha = await conquerApi.applyCut(props.ficha.member.userId, {
      action: 'aplicar_etapa',
      ...(alert.id !== null ? { alertId: alert.id } : {}),
    });
    $q.notify({ type: 'positive', message: 'Recorte aplicado' });
    emit('updated', ficha);
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: errorMessage(err, 'No pudimos aplicar el recorte') });
  } finally {
    busy.value = null;
  }
}

async function undoStage(): Promise<void> {
  busy.value = 'deshacer';
  try {
    const ficha = await conquerApi.applyCut(props.ficha.member.userId, {
      action: 'deshacer_etapa',
    });
    $q.notify({ type: 'positive', message: 'Etapa de recorte deshecha' });
    emit('updated', ficha);
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: errorMessage(err, 'No pudimos deshacer el recorte') });
  } finally {
    busy.value = null;
  }
}

function confirmUndo(): void {
  $q.dialog({
    title: 'Deshacer la última etapa',
    message: `El alumno vuelve de la etapa ${props.ficha.member.cutStage} a la anterior.`,
    cancel: { label: 'Cancelar', flat: true, noCaps: true },
    ok: { label: 'Deshacer', color: 'secondary', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(() => {
    void undoStage();
  });
}

async function setStatus(alert: BoardAlert, status: 'vista' | 'resuelta'): Promise<void> {
  if (alert.id === null) return;
  busy.value = busyKey(status, alert);
  try {
    await conquerApi.patchAlert(alert.id, status);
    $q.notify({
      type: 'positive',
      message: status === 'vista' ? 'Alerta marcada como vista' : 'Alerta resuelta',
    });
    emit('changed');
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: errorMessage(err, 'No pudimos actualizar la alerta') });
  } finally {
    busy.value = null;
  }
}
</script>
