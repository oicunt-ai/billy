export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="BILLY is thinking"
      className="flex justify-start"
    >
      <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-500 sm:max-w-[75%] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        BILLY is thinking&hellip;
      </div>
    </div>
  );
}
