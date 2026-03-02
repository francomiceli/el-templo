export const STATUS_COLORS: Record<string, string> = {
  new: 'blue',
  contacted: 'orange',
  negotiating: 'purple',
  closed: 'green',
};

export const STATUS_LABELS: Record<string, string> = {
  new: 'Nueva',
  contacted: 'Contactada',
  negotiating: 'Negociando',
  closed: 'Cerrada',
};

export const MODELO_LABELS: Record<string, string> = {
  activa: 'Activa',
  pasiva: 'Pasiva',
  ambas: 'Ambas',
};

export const CAPITAL_LABELS: Record<string, string> = {
  menos_50k: '< USD 50k',
  entre_50k_100k: 'USD 50-100k',
  mas_100k: '> USD 100k',
};

export const EXPERIENCIA_LABELS: Record<string, string> = {
  fitness: 'Fitness / Deporte',
  negocios: 'Negocios / Emprendimiento',
  ambas: 'Ambas',
  sin_experiencia: 'Sin experiencia previa',
};

export const ORIGEN_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  web: 'Sitio web',
  recomendacion: 'Recomendacion',
  google: 'Google',
  otro: 'Otro',
};
