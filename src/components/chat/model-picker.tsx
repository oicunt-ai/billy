import { isModelSelectable, type PublicModel } from "./model-utils";

export type ModelPickerStatus =
  | "loading"
  | "ready"
  | "login-required"
  | "error"
  | "disabled";

interface ModelPickerProps {
  readonly status: ModelPickerStatus;
  readonly models: readonly PublicModel[];
  readonly selectedId: string | null;
  readonly errorMessage?: string | undefined;
  readonly onSelect: (id: string) => void;
}

export function ModelPicker({
  status,
  models,
  selectedId,
  errorMessage,
  onSelect,
}: ModelPickerProps) {
  if (status === "login-required") {
    return (
      <p className="px-2 text-sm text-zinc-500 dark:text-zinc-400">
        Sign in below to load models.
      </p>
    );
  }
  if (status === "disabled") {
    return (
      <p className="px-2 text-sm text-zinc-500 dark:text-zinc-400">
        Model catalog unavailable in this environment.
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="px-2 text-sm text-red-700 dark:text-red-300">
        {errorMessage ?? "Could not load models."}
      </p>
    );
  }

  const selectable = models.filter(isModelSelectable);
  return (
    <div className="px-2">
      <label
        htmlFor="billy-model"
        className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
      >
        Model
      </label>
      <select
        id="billy-model"
        value={selectedId ?? ""}
        disabled={status === "loading" || selectable.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {status === "loading" ? (
          <option value="">Loading models…</option>
        ) : selectable.length === 0 ? (
          <option value="">No models available</option>
        ) : (
          selectable.map((model) => (
            <option key={model.id} value={model.id}>
              {model.displayName}
            </option>
          ))
        )}
      </select>
      {status === "ready" && selectable.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          The catalog returned no selectable models.
        </p>
      ) : null}
    </div>
  );
}
