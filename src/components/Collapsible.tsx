import type { ReactNode } from "react";

/**
 * Prose that is folded away on screen but fully present in the HTML.
 *
 * The long explanations on /book, /creators and /join are what make those URLs worth indexing at
 * all: each page is otherwise a form or a filter under a heading, and `npm run smoke` holds every
 * public page to more than 150 words for exactly that reason. But the same paragraphs push the
 * thing somebody actually came to do below the fold.
 *
 * `<details>` is the only thing that answers both. Moving the text to a page of its own behind a
 * button would move its keywords and its internal links there too — a search engine credits
 * content to the URL that serves it, never to the one that points at it — and a "read more" that
 * mounted the text on click would keep it out of the HTML altogether. Here the whole of it is
 * server-rendered inside the element, so the first response carries every word while a person sees
 * one line until they ask.
 *
 * No JavaScript: `<details>` is the browser's own, so this works on the first paint and with
 * scripting off.
 */
export function Collapsible({
  label,
  children,
  open,
  className = "",
}: {
  /** The always-visible line. Pass a heading element where the fold replaces a section. */
  label: ReactNode;
  children: ReactNode;
  /** Start open. For a page with little else on it to get in the way of. */
  open?: boolean;
  className?: string;
}) {
  return (
    <details className={`prose-fold ${className}`.trim()} open={open}>
      <summary>{label}</summary>
      <div className="stack prose-fold-body">{children}</div>
    </details>
  );
}
