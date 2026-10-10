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
