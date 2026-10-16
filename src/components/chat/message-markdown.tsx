"use client";

import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { codeTextOf, languageOf } from "./message-markdown-utils";

function CopyButton({
  text,
  label,
  tone = "dark",
}: {
  readonly text: string;
  readonly label: string;
  /**
   * "dark" sits on the code-block header (label visible). "light" sits on the
   * message canvas, where the dark-surface colours would be near-invisible:
   * icon-only, muted ink, wash hover.
   */
  readonly tone?: "dark" | "light";
}) {
  const [copied, setCopied] = useState(false);
  const light = tone === "light";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (permissions, insecure context):
      // fall back to the legacy execCommand path.
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      title={light ? (copied ? "Copied" : `Copy ${label}`) : undefined}
      className={
        light
          ? "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
          : "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver"
      }
    >
      <svg
        className={light ? "h-4 w-4 shrink-0" : "h-3 w-3 shrink-0"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {light && copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </>
        )}
      </svg>
      <span aria-live="polite" className={light ? "sr-only" : undefined}>
        {copied ? "Copied" : light ? "" : "Copy"}
      </span>
    </button>
  );
}

function CodeBlock({
  language,
  children,
}: {
  readonly language: string;
  readonly children: ReactNode;
}) {
  const text = codeTextOf(children).replace(/\n$/, "");
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-zinc-800/80 bg-ink-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-2">
        <span className="font-mono text-xs font-medium tracking-wide text-zinc-400">
          {language === "" ? "code" : language}
        </span>
        <CopyButton text={text} label="code block" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-[1.7] text-zinc-100 sm:text-[0.84rem]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/**
 * Assistant message body. react-markdown escapes HTML by default, so raw
 * markup in model output renders as text rather than executing.
 */
export function MessageMarkdown({ text }: { readonly text: string }) {
  return (
    <div className="markdown-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            // Fenced block: find the nested <code> to recover language + text.
            const childArray = Array.isArray(children) ? children : [children];
            for (const child of childArray) {
              if (
                child !== null &&
                typeof child === "object" &&
                "type" in child &&
                (child as { type: unknown }).type === "code"
              ) {
                const code = child as {
                  readonly props: { readonly className?: unknown; readonly children?: ReactNode };
                };
                return (
                  <CodeBlock language={languageOf(code.props.className)}>
                    {code.props.children}
                  </CodeBlock>
                );
              }
            }
            return <pre>{children}</pre>;
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

export function MessageCopyButton({ text }: { readonly text: string }) {
  return (
    <span className="inline-flex">
      <CopyButton text={text} label="message" tone="light" />
    </span>
  );
}
