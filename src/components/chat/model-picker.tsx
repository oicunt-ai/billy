import { useId } from "react";
import {
  isModelPickerNoteStatus,
  isModelSelectable,
  type ModelPickerStatus,
  type PublicModel,
} from "./model-utils";

export type { ModelPickerStatus };

interface ModelPickerProps {
  readonly status: ModelPickerStatus;
  readonly models: readonly PublicModel[];
  readonly selectedId: string | null;
  readonly errorMessage?: string | undefined;
  readonly onSelect: (id: string) => void;
  /** Compact header rendering; defaults to the labeled sidebar rendering. */
  readonly variant?: "sidebar" | "compact" | undefined;
}

function StatusNote({ status, errorMessage }: { readonly status: ModelPickerStatus; readonly errorMessage?: string | undefined }) {
  // Notes render in the light header; colors target light surfaces.
  if (status === "login-required") {
    return (
      <p className="px-2 text-sm text-muted">
        Sign in below to load models.
      </p>
    );
  }
  if (status === "disabled") {
    return (
      <p className="px-2 text-sm text-muted">
        Model catalog unavailable in this environment.
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="px-2 text-sm text-red-700">
        {errorMessage ?? "Could not load models."}
      </p>
    );
  }
  return null;
}

export function ModelPicker({
  status,
  models,
  selectedId,
  errorMessage,
  onSelect,
  variant,
}: ModelPickerProps) {
  // Two pickers can be mounted at once (mobile header + desktop composer),
  // so ids must be per-instance instead of shared constants.
  const selectId = useId();

  if (isModelPickerNoteStatus(status)) {
    return <StatusNote status={status} errorMessage={errorMessage} />;
  }

  const selectable = models.filter(isModelSelectable);
  if (variant === "compact") {
    const selected = selectable.find((model) => model.id === selectedId);
    return (
      <div className="relative inline-flex items-center">
        <label htmlFor={selectId} className="sr-only">
          Model
        </label>
        <select
          id={selectId}
          value={selectedId ?? ""}
          disabled={status === "loading" || selectable.length === 0}
          onChange={(event) => onSelect(event.target.value)}
          aria-label={selected !== undefined ? `Model: ${selected.displayName}` : "Model"}
          className="appearance-none max-w-56 cursor-pointer truncate rounded-full border border-hairline bg-raised pl-3.5 pr-8 py-1.5 text-xs sm:text-sm font-medium text-ink hover:bg-wash focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? (
            <option value="">Loading…</option>
          ) : selectable.length === 0 ? (
            <option value="">No models</option>
          ) : (
            selectable.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))
          )}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8l4 4 4-4" />
          </svg>
        </span>
      </div>
    );
  }
  return (
    <div className="px-2">
      <label
        htmlFor={selectId}
        className="text-xs font-semibold tracking-wider text-zinc-400 uppercase"
      >
        Model
      </label>
      <select
        id={selectId}
        value={selectedId ?? ""}
        disabled={status === "loading" || selectable.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
        <p className="mt-1 text-xs text-zinc-500">
          The catalog returned no selectable models.
        </p>
      ) : null}
    </div>
  );
}
