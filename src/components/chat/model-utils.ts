/**
 * Shared, client-safe model catalog helpers.
 *
 * No Node.js imports — safe for both server modules and browser components.
 */

export interface PublicModel {
  readonly id: string;
  readonly displayName: string;
  readonly description?: string | undefined;
  readonly capabilities: readonly string[];
  readonly status: string;
}

export type ModelPickerStatus =
  | "loading"
  | "ready"
  | "login-required"
  | "error"
  | "disabled";

/**
 * Whether the picker must render an explanatory note instead of the
 * `<select>`. Loading and ready states always render the selector itself
 * (possibly disabled/empty), so gating on anything other than an explicit
 * status check — e.g. a JSX-null comparison, which is never null — hides
 * the control entirely.
 */
export function isModelPickerNoteStatus(status: ModelPickerStatus): boolean {
  return status === "login-required" || status === "disabled" || status === "error";
}

const SELECTABLE_STATUSES: readonly string[] = ["available", "degraded"];

/**
 * Whether the public catalog marks a model as selectable.
 *
 * Mirrors the registry's version-status rule behind upstream
 * `selectableOnly=true` (the target-eligibility half is already enforced
 * upstream before the public projection, so it cannot be re-checked here).
 */
export function isModelSelectable(model: PublicModel): boolean {
  return SELECTABLE_STATUSES.includes(model.status);
}
