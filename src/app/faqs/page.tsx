import type { Metadata } from "next";
import { AUTO_APPROVE_MS, CREATOR_SHARE, DISPATCH, HOUR, MAX_SERVICES_PER_ORDER, SUPPORT_PHONE } from "@/lib/domain/config";

export const metadata: Metadata = { title: "FAQs — Srijan" };

const AUTO_APPROVE_HOURS = AUTO_APPROVE_MS / HOUR;
const NOTICE_HOURS = DISPATCH.onSiteNoticeMs / HOUR;

const FAQS = [
  {
    q: "How do I book a service?",
    a: `Choose one or more services from the menu, pick a time and pay online. One order can hold up to ${MAX_SERVICES_PER_ORDER} services. Jobs at your location need at least ${NOTICE_HOURS} hour’s notice and can be booked up to ${DISPATCH.maxDaysAhead} days ahead. Online jobs need no notice.`,
  },
  {
    q: "How do I get a creator?",
    a: `You don’t need to choose one. To work with a particular creator, press Send job offer on their profile: they get the job first, for ${DISPATCH.directOfferMs / 60_000} minutes. Otherwise every available creator within ${DISPATCH.initialRadiusKm} km is alerted, and the first to accept takes the job. If nobody has accepted after ${DISPATCH.widenAfterMs / 60_000} minutes, the search widens to ${DISPATCH.widenedRadiusKm} km.`,
  },
  {
    q: "Which cities do you cover?",
    a: "The city list on the booking and creators pages shows where on-site jobs are available right now. Online jobs like video editing don’t depend on your location.",
  },
  {
    q: "When is the creator paid?",
    a: `After you approve the finished job. If you don’t approve it or report a problem within ${AUTO_APPROVE_HOURS} hours of the creator marking it finished, it is approved automatically.`,
  },
  {
    q: "What if I’m not happy with the work?",
    a: "Report a problem from your booking once the job is marked as finished. The creator’s payment stops until the Srijan team has looked into it.",
  },
  {
    q: "Can I cancel a booking?",
    a: `Yes, for free, until a creator has accepted the job. After that, call the Srijan team on ${SUPPORT_PHONE}.`,
  },
  {
    q: "How do refunds work?",
    a: "The Srijan team sends refunds by hand and may contact you for your bank or UPI details, so they don’t appear instantly. You’ll get a notification when yours has been sent.",
  },
  {
    q: "How much do creators earn?",
    a: `Creators keep ${Math.round(CREATOR_SHARE * 100)}% of the price of every service. Srijan sends the money to their bank or UPI after the job is approved.`,
  },
  {
    q: "How do brands run a campaign?",
    a: "Book a strategy call from the For brands page. Our team shortlists creators, runs every deal and reports the results.",
  },
  {
    q: "How do I contact Srijan?",
    a: `Call us on ${SUPPORT_PHONE}, or raise a ticket on the Help & support page (/support) and we’ll reply by email.`,
  },
];

export default function FaqsPage() {
  return (
    <div className="container narrow page">
      <h1>FAQs</h1>
      {FAQS.map((f) => (
        <section key={f.q}>
          <h2>{f.q}</h2>
          <p>{f.a}</p>
        </section>
      ))}
    </div>
  );
}
