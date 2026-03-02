<template>
  <q-card flat bordered class="q-mb-md">
    <q-card-section>
      <div class="text-subtitle1 text-weight-bold">Agentes AI</div>
      <div class="text-caption text-grey-7">
        Herramientas de inteligencia artificial para dise&ntilde;o de estrategia de
        conversi&oacute;n
      </div>
    </q-card-section>

    <q-tabs v-model="activeTab" dense align="left" active-color="primary" indicator-color="primary">
      <q-tab name="strategy" label="Estrategia" />
      <q-tab name="outreach" label="Contacto" />
      <q-tab name="followup" label="Seguimiento" />
      <q-tab name="negotiation" label="Negociaci&oacute;n" />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="activeTab" animated>
      <q-tab-panel v-for="agent in AGENT_TYPES" :key="agent" :name="agent" class="q-pa-md">
        <!-- Tutorial / description -->
        <div class="text-body2 text-grey-7 q-mb-sm" style="max-width: 600px">
          {{ AGENT_TUTORIALS[agent] }}
        </div>
        <div class="text-caption text-grey-5 q-mb-md" style="max-width: 600px">
          Nota: Los agentes generan borradores para revisi&oacute;n humana. Revisa y adapta el
          contenido antes de usarlo.
        </div>

        <!-- No content yet: show Generate button -->
        <div v-if="!getContent(agent) && generating !== agent">
          <q-btn
            color="primary"
            icon="auto_awesome"
            label="Generar"
            :disable="!!generating"
            @click="handleGenerate(agent)"
          />
        </div>

        <!-- Loading state -->
        <div v-else-if="generating === agent" class="q-pa-lg text-center">
          <q-spinner-dots size="40px" color="primary" />
          <div class="text-caption text-grey-6 q-mt-sm">
            Generando con AI... esto puede tomar unos segundos
          </div>
        </div>

        <!-- Content exists: show output + regenerate -->
        <div v-else>
          <div
            class="ai-output q-pa-md"
            style="
              background: #f8f8f8;
              border-radius: 8px;
              white-space: pre-wrap;
              font-size: 14px;
              line-height: 1.6;
            "
          >
            {{ getContent(agent) }}
          </div>
          <div class="q-mt-md row items-center q-gutter-sm">
            <q-btn
              flat
              color="primary"
              icon="refresh"
              label="Regenerar"
              :disable="!!generating"
              @click="handleRegenerate(agent)"
            />
            <q-btn
              flat
              icon="content_copy"
              label="Copiar"
              :disable="!!generating"
              @click="copyContent(getContent(agent))"
            />
          </div>
        </div>
      </q-tab-panel>
    </q-tab-panels>
  </q-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar, Notify } from 'quasar';
import { useFranchiseAdminApi } from 'src/composables/useFranchiseAdminApi';
import { createLogger } from 'src/utils/logger';

const log = createLogger('FranchiseAiPanel');

interface Props {
  applicationId: number;
  aiStrategy: string | null;
  aiOutreach: string | null;
  aiFollowup: string | null;
  aiNegotiation: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'generated', agentType: string, content: string): void;
}>();

const $q = useQuasar();
const franchiseApi = useFranchiseAdminApi();

const AGENT_TYPES = ['strategy', 'outreach', 'followup', 'negotiation'] as const;

const AGENT_TUTORIALS: Record<string, string> = {
  strategy:
    'Analiza el perfil del inversor y genera una estrategia de conversi\u00f3n personalizada. Incluye evaluaci\u00f3n de riesgo, puntos clave de conversaci\u00f3n y modelo recomendado. Ideal para prepararse antes de la primera llamada.',
  outreach:
    'Redacta un mensaje de primer contacto personalizado para WhatsApp o email. El mensaje est\u00e1 listo para copiar y enviar, adaptado al perfil y ciudad del aplicante.',
  followup:
    'Genera un mensaje de seguimiento para aplicantes que no respondieron al primer contacto. Incluye valor agregado y un call to action suave para retomar la conversaci\u00f3n.',
  negotiation:
    'Prepara material de apoyo para la negociaci\u00f3n: contra-argumentos para objeciones comunes, puntos de venta personalizados y pr\u00f3ximos pasos sugeridos para cerrar el acuerdo.',
};

const activeTab = ref('strategy');
const generating = ref<string | null>(null);

/**
 * Returns the AI content for a given agent type from props.
 */
function getContent(agentType: string): string | null {
  const contentMap: Record<string, string | null> = {
    strategy: props.aiStrategy,
    outreach: props.aiOutreach,
    followup: props.aiFollowup,
    negotiation: props.aiNegotiation,
  };
  return contentMap[agentType] ?? null;
}

async function handleGenerate(agentType: string) {
  generating.value = agentType;
  try {
    const result = await franchiseApi.generateAiContent(props.applicationId, agentType);
    emit('generated', agentType, result.content);
  } catch (err: unknown) {
    // Error notification handled by composable (Notify)
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('AI generation failed', { agentType, error: message });
  } finally {
    generating.value = null;
  }
}

function handleRegenerate(agentType: string) {
  const labelMap: Record<string, string> = {
    strategy: 'la estrategia',
    outreach: 'el mensaje de contacto',
    followup: 'el mensaje de seguimiento',
    negotiation: 'el material de negociaci\u00f3n',
  };
  const label = labelMap[agentType] ?? 'el contenido';

  $q.dialog({
    title: 'Regenerar contenido',
    message: `Esto reemplazar\u00e1 ${label} actual. Guarda cualquier informaci\u00f3n importante antes de regenerar.`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Regenerar', color: 'primary' },
    persistent: true,
  }).onOk(() => {
    handleGenerate(agentType);
  });
}

function copyContent(content: string | null) {
  if (!content) return;
  navigator.clipboard.writeText(content);
  Notify.create({ type: 'positive', message: 'Contenido copiado', timeout: 1500 });
}
</script>
