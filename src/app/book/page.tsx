"use client";
import { BookForm } from "@/components/BookForm";
import { Loading } from "@/components/ui";
import { useMeta } from "@/components/useMeta";

/** Book a service: every eligible creator is alerted. Job offers to one creator are sent from their profile. */
export default function BookPage() {
  const meta = useMeta();
  return meta ? <BookForm meta={meta} /> : <Loading />;
}
