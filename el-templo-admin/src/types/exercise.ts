export interface Exercise {
  id: number;
  exercise: string; // display name
  category: string;
  level: string | null;
  route: string;
  effort: string; // contraction type: CON, EXC, ISO
  difficulty: number;
  dificultadLineal: number;
  videoUrl: string | null; // full assembled URL (from API)
}

export interface ExerciseListResponse {
  exercises: Exercise[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateExerciseInput {
  exercise: string;
  category: string;
  pattern: string;
  route: string;
  effort: string;
  level?: string;
  difficulty?: number;
  dificultadLineal?: number;
  position?: string;
  categorySecondary?: string;
}

export interface ExerciseFilters {
  page: number;
  limit: number;
  search: string;
  category: string;
  level: string;
  route: string;
  effort: string;
  hasVideo: boolean | null; // null = all, true = with video, false = without
}
