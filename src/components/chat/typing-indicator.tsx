export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="BILLY is thinking"
      className="flex justify-start"
    >
      <div className="rounded-2xl rounded-bl-md border border-hairline bg-raised px-4 py-2.5 text-sm text-muted">
        BILLY is thinking&hellip;
      </div>
    </div>
  );
}
