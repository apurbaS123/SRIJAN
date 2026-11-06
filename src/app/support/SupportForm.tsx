"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { call, useAction } from "@/lib/client/api";
import { ErrorNote } from "@/components/ui";
import { useSession } from "@/components/Session";
import { SUPPORT_PHONE, SUPPORT_TOPICS } from "@/lib/domain/config";

export function SupportForm() {
  const { session } = useSession();
  const user = session?.user;
  const [form, setForm] = useState({ name: "", email: "", phone: "", topic: SUPPORT_TOPICS[0] as string, bookingCode: "", subject: "", message: "" });
  const [ref, setRef] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Fill in what we know once the session loads, without overwriting anything typed.
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({ ...f, name: f.name || user.name || "", email: f.email || user.email || "", phone: f.phone || user.phone || "" }));
  }, [user]);

  async function submit() {
    const r = await run(() => call<{ ref: string }>("/api/support", form));
    if (r) setRef(r.ref);
  }

  if (ref)
    return (
      <div className="container page narrow">
        <div className="card stack">
          <h1>Ticket raised</h1>
          <p>
            Your ticket number is <b>{ref}</b>. The Srijan team will reply to <b>{form.email}</b>, usually within one working day.
          </p>
          <p className="muted small">Keep the ticket number if you call us on {SUPPORT_PHONE} about it.</p>
          <div className="row">
            <button
              className="btn btn-sm"
              onClick={() => {
                setRef(null);
                setForm((f) => ({ ...f, bookingCode: "", subject: "", message: "" }));
              }}
            >
              Raise another ticket
            </button>
            <Link className="btn btn-sm" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );

  const ready = form.name.trim() && form.email.trim() && form.subject.trim() && form.message.trim().length >= 10;

  return (
    <div className="container page narrow">
      <h1>Help &amp; support</h1>
      <p className="muted">
        Have a question or need help with anything? Raise a ticket and the Srijan team will reply by email. You can also check the <Link href="/faqs">FAQs</Link> or call us on{" "}
        <a href={`tel:+91${SUPPORT_PHONE}`}>{SUPPORT_PHONE}</a>.
      </p>

      <section className="card stack">
        <h2>Your details</h2>
        <div className="field">
          <label htmlFor="s-name">Your name</label>
          <input id="s-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="s-email">Email</label>
            <input id="s-email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="s-phone">Mobile number (optional)</label>
            <input id="s-phone" className="input" type="tel" autoComplete="tel" placeholder="+91" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Your question</h2>
        <span className="label">What is it about?</span>
        <div className="chips" role="group" aria-label="Topic">
          {SUPPORT_TOPICS.map((t) => (
            <button key={t} type="button" aria-pressed={form.topic === t} className={`chip${form.topic === t ? " on-violet" : ""}`} onClick={() => set("topic", t)}>
              {t}
            </button>
          ))}
        </div>
        {(form.topic === "Booking" || form.topic === "Payment or refund") && (
          <div className="field">
            <label htmlFor="s-code">Booking reference (optional)</label>
            <input id="s-code" className="input" placeholder="From My bookings" value={form.bookingCode} onChange={(e) => set("bookingCode", e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="s-subject">Subject</label>
          <input id="s-subject" className="input" maxLength={150} value={form.subject} onChange={(e) => set("subject", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="s-message">Message</label>
          <textarea id="s-message" className="textarea" rows={6} maxLength={5000} placeholder="Tell us what you need help with" value={form.message} onChange={(e) => set("message", e.target.value)} />
        </div>
      </section>

      <ErrorNote error={error} />
      <button className="btn btn-violet btn-lg btn-block" disabled={busy || !ready} onClick={submit}>
        {busy ? "Sending…" : "Raise ticket"}
      </button>
    </div>
  );
}
