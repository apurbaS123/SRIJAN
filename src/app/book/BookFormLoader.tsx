"use client";
import { BookForm } from "@/components/BookForm";
import { FormSkeleton } from "@/components/ui";
import { useMeta } from "@/components/useMeta";

/**
 * The booking form, which only works in a browser: it reads the clock to decide the earliest
 * bookable time and looks in sessionStorage for a half-finished order.
 *
 * It is on its own here so that waiting for it costs the page its form and nothing else — the
 * heading, the prices and the copy above are already in the HTML.
 */
export function BookFormLoader() {
  const meta = useMeta();
  return meta ? <BookForm meta={meta} /> : <FormSkeleton rows={4} label="Loading the booking form" />;
}
