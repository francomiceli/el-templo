import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";

export type AgentType = "strategy" | "outreach" | "followup" | "negotiation";

export interface ApplicantData {
  nombre: string;
  email: string;
  telefono: string;
  ciudadPais: string;
  modelo: string;
  experiencia: string;
  capital: string;
  origen: string;
  mensaje: string | null;
}

// Label maps duplicated from service.ts for module independence
// (consistent with blog/gladius slugify duplication pattern)
const MODELO_LABEL: Record<string, string> = {
  activa: "Franquicia Activa (opera el gym)",
  pasiva: "Franquicia Pasiva (inversor)",
  ambas: "Ambas opciones",
};

const EXPERIENCIA_LABEL: Record<string, string> = {
  fitness: "Fitness / Deporte",
  negocios: "Negocios / Emprendimiento",
  ambas: "Ambas",
  sin_experiencia: "Sin experiencia previa",
};

const CAPITAL_LABEL: Record<string, string> = {
  menos_50k: "Menos de USD 50.000",
  entre_50k_100k: "Entre USD 50.000 y 100.000",
  mas_100k: "Mas de USD 100.000",
};

const ORIGEN_LABEL: Record<string, string> = {
  instagram: "Instagram",
  web: "Sitio web",
  recomendacion: "Recomendacion",
  google: "Google",
  otro: "Otro",
};

const BRAND_SYSTEM_PROMPT = `Sos un consultor experto de franquicias de El Templo, una escuela de movimiento (NO un gimnasio convencional) fundada por Ignacio Bordon en Mar del Plata, Argentina.

CONTEXTO DE LA MARCA:
- El Templo ofrece calistenia, entrenamiento funcional y peso corporal con un metodo propio (SPOM)
- Dos modelos de franquicia: Activa (el franquiciado opera el gym, inversion menor) y Pasiva (el franquiciado invierte, El Templo opera, inversion mayor)
- Rangos de inversion: Menos de USD 50.000, Entre USD 50.000 y 100.000, Mas de USD 100.000
- Sedes actuales: 7 en Mar del Plata + 1 en Barcelona. Expansion activa en Argentina y Espana
- Ecosistema: Gladius (equipamiento propio), Academia (formacion de entrenadores), App de entrenamiento, Aura Club (bienestar)
- Diferencial competitivo: metodo propio, ecosistema completo, acompanamiento real al franquiciado, marca premium posicionada
- Valores: disciplina, comunidad, excelencia, movimiento como filosofia de vida

REGLAS:
- Responde SIEMPRE en espanol
- Tono profesional pero cercano, como un asesor de confianza
- Nunca inventes datos financieros especificos (ROI, facturacion) — usa rangos generales y referi al equipo de franquicias para cifras exactas
- Adapta tu respuesta al perfil del aplicante (experiencia, capital, modelo preferido, ciudad)`;

const AGENT_EXTENSIONS: Record<AgentType, string> = {
  strategy: `TAREA: Analiza el perfil del aplicante y genera una estrategia de conversion detallada.

FORMATO DE RESPUESTA:
## Analisis del Perfil
[Resumen del perfil del inversor: fortalezas, oportunidades, senales de interes]

## Evaluacion de Riesgo
[Senales positivas y areas de atencion]

## Estrategia de Conversion
[Approach recomendado: pasos concretos para avanzar la negociacion]

## Puntos Clave de Conversacion
[3-5 talking points personalizados para la primera llamada/reunion]

## Modelo Recomendado
[Basado en el perfil, que modelo (Activa/Pasiva) se adapta mejor y por que]`,

  outreach: `TAREA: Redacta un mensaje de primer contacto personalizado para enviar por WhatsApp o email.

FORMATO: Mensaje listo para copiar y enviar. Maximo 200 palabras. Incluir:
- Saludo personalizado usando el nombre
- Referencia a su ciudad/pais y como El Templo podria funcionar ahi
- Referencia a su modelo de interes y experiencia
- Call to action claro (agendar llamada/reunion)
- Cierre profesional`,

  followup: `TAREA: Redacta un mensaje de seguimiento para aplicantes que no respondieron al primer contacto.

FORMATO: Mensaje listo para copiar y enviar. Maximo 150 palabras. Incluir:
- Tono calido pero no insistente
- Valor agregado nuevo (dato, novedad, caso de exito)
- Referencia sutil al primer contacto
- Call to action suave`,

  negotiation: `TAREA: Genera material de apoyo para la negociacion con este aplicante.

FORMATO:
## Contra-argumentos Comunes
[Respuestas preparadas para objeciones tipicas adaptadas al perfil]

## Puntos de Venta Personalizados
[Argumentos de venta alineados con el perfil del inversor]

## Proyeccion General
[Escenario general de la franquicia adaptado al modelo y capital — SIN cifras especificas de ROI]

## Proximos Pasos Sugeridos
[Acciones concretas para cerrar el acuerdo]`,
};

export class FranchiseAiAgentService {
  private client: Anthropic;
  private log: FastifyBaseLogger;

  constructor(log: FastifyBaseLogger) {
    this.log = log;
    // Anthropic SDK reads ANTHROPIC_API_KEY from env automatically
    this.client = new Anthropic();
  }

  async generate(
    agentType: AgentType,
    applicant: ApplicantData,
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(agentType);
    const userPrompt = this.buildUserPrompt(applicant);

    this.log.info(
      { agentType, applicantEmail: applicant.email },
      "Generating AI agent output",
    );

    const message = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extract text from response
    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in AI response");
    }

    this.log.info(
      { agentType, applicantEmail: applicant.email },
      "AI agent output generated",
    );
    return textBlock.text;
  }

  private buildSystemPrompt(agentType: AgentType): string {
    const extension = AGENT_EXTENSIONS[agentType];
    return `${BRAND_SYSTEM_PROMPT}\n\n${extension}`;
  }

  private buildUserPrompt(applicant: ApplicantData): string {
    return `Datos del aplicante:
- Nombre: ${applicant.nombre}
- Email: ${applicant.email}
- Telefono: ${applicant.telefono}
- Ciudad/Pais: ${applicant.ciudadPais}
- Modelo de interes: ${MODELO_LABEL[applicant.modelo] ?? applicant.modelo}
- Experiencia: ${EXPERIENCIA_LABEL[applicant.experiencia] ?? applicant.experiencia}
- Capital disponible: ${CAPITAL_LABEL[applicant.capital] ?? applicant.capital}
- Como nos conocio: ${ORIGEN_LABEL[applicant.origen] ?? applicant.origen}
- Mensaje: ${applicant.mensaje ?? "Sin mensaje adicional"}`;
  }
}
