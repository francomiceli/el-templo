export type SessionStatus = "pending_review" | "approved";

/** Actions that can be logged to session_edit_logs */
export type EditAction =
  | "exercise_swap"
  | "prescription_edit"
  | "format_change"
  | "format_params_update"
  | "exercise_add"
  | "exercise_remove"
  | "exercise_reorder"
  | "block_role_change"
  | "mobility_swap"
  | "reset_to_algorithm"
  | "status_change"
  | "custom_title_update"
  | "route_update"
  | "initium_sync";

/** Preview block for member-facing session view */
export interface PreviewBlock {
  name: string;
  format: string;
  exercises: PreviewExercise[];
}

/** Preview exercise for member-facing session view */
export interface PreviewExercise {
  name: string;
  prescription: string;
  rest: string;
  notes: string | null;
}
