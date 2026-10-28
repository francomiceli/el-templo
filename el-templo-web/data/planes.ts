/**
 * Modalidades de entrenamiento para la pagina `/planes` (fase 195, D-12).
 *
 * SIN PRECIOS: ningun monto ni moneda en este archivo (los precios se
 * consultan por WhatsApp y el verificador del build los bloquea).
 *
 * Contenido editable: se publica con el boton "solo web" (D-11).
 *
 * Los nombres salen del catalogo `subscription_plans` activo y las
 * descripciones de las descripciones del catalogo (y del seed de produccion).
 * REVISAR por el equipo: el catalogo cambia y esta copia no se sincroniza sola.
 */

export interface PlanWeb {
  nombre: string;
  descripcion: string;
}

export interface PlanGrupo {
  id: string;
  titulo: string;
  intro: string;
  planes: PlanWeb[];
}

export const planGrupos: PlanGrupo[] = [
  {
    id: "mensuales",
    titulo: "Planes de entrenamiento",
    intro:
      "Entrená con el método en tu sede. Elegí turnos fijos o libres según tu plan.",
    planes: [
      {
        nombre: "Flex",
        descripcion:
          "Turnos fijos en una sede. Incluye 2 sesiones de regalo en tu primer mes.",
      },
      {
        nombre: "Flex+",
        descripcion: "Turnos fijos o libres en una sede. Incluye acceso a ROM.",
      },
      {
        nombre: "Foundation",
        descripcion: "Turnos fijos en una sede. Incluye 2 sesiones de regalo.",
      },
      {
        nombre: "Foundation+",
        descripcion:
          "Turnos fijos o libres con acceso a todas las sedes. Incluye ROM.",
      },
      {
        nombre: "Performance",
        descripcion:
          "Nuestro plan más completo. Turnos fijos o libres en todas las sedes, con acceso a ROM y eventos exclusivos.",
      },
    ],
  },
  {
    id: "sueltas",
    titulo: "Para empezar o venir de a ratos",
    intro: "Para conocer El Templo o entrenar sin un plan mensual.",
    planes: [
      {
        nombre: "Sesión de prueba",
        descripcion:
          "Tu primera clase es gratis: una sesión de prueba para conocer El Templo.",
      },
      {
        nombre: "Clase única",
        descripcion: "Una clase individual.",
      },
      {
        nombre: "Packs familiares",
        descripcion: "Packs para 2, 3 o 4 miembros de una misma familia.",
      },
    ],
  },
  {
    id: "especiales",
    titulo: "Actividades especiales",
    intro: "Actividades con cupo propio, con pase aparte de tu plan.",
    planes: [
      {
        nombre: "Pase de Actividades con Aura",
        descripcion:
          "Verticales, Acrobacias y Open Gym. Tiene versión para socios y para externos, con distintas cantidades de accesos.",
      },
      {
        nombre: "Pases de Yoga",
        descripcion:
          "Yoga para calisténicos y Yoga regenerativo: clase de prueba, clase suelta, pack de 4 clases o 2 veces por semana.",
      },
    ],
  },
];
