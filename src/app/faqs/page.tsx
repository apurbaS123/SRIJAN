import type { Metadata } from "next";
import { AUTO_APPROVE_MS, CREATOR_SHARE, DISPATCH, HOUR, MAX_SERVICES_PER_ORDER, PAYMENT_WINDOW_MS, PAYOUT_MAX_HOURS, PAYOUT_MIN_HOURS, SUPPORT_PHONE } from "@/lib/domain/config";

export const metadata: Metadata = { title: "FAQs — Srijan" };

const AUTO_APPROVE_HOURS = AUTO_APPROVE_MS / HOUR;
const NOTICE_HOURS = DISPATCH.onSiteNoticeMs / HOUR;

const FAQS = [
  {
    q: "How do I book a service?",
    a: `Choose one or more services from the menu, pick a time and place the booking — there is nothing to pay at that point. One order can hold up to ${MAX_SERVICES_PER_ORDER} services, each of which finds its own creator and is paid for on its own. Jobs at your location need at least ${NOTICE_HOURS} hour’s notice and can be booked up to ${DISPATCH.maxDaysAhead} days ahead. Online jobs need no notice.`,
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
    q: "When do I pay?",
    a: `Only once a creator has accepted your job. We tell you on the site, on your phone and by email, and you then have ${PAYMENT_WINDOW_MS / 60_000} minutes to pay while the creator holds your slot. Paying confirms the job and gives you each other’s phone numbers. If the payment doesn’t arrive in time the job is dropped, the creator is released and you are charged nothing.`,
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
    a: `Yes, for free, any time before you have paid — including while a creator waits for your payment. Once you have paid, call the Srijan team on ${SUPPORT_PHONE}.`,
  },
  {
    q: "How do refunds work?",
    a: "The Srijan team sends refunds by hand and may contact you for your bank or UPI details, so they don’t appear instantly. You’ll get a notification when yours has been sent.",
  },
  {
    q: "How much do creators earn?",
    a: `Creators keep ${Math.round(CREATOR_SHARE * 100)}% of the price of every service. Once the client approves the job, that money shows in the creator's wallet and Srijan sends it to their bank or UPI within ${PAYOUT_MIN_HOURS}–${PAYOUT_MAX_HOURS} hours.`,
  },
  {
    q: "How does a creator get verified?",
    a: "In under a minute, by yourself: sign in to DigiLocker from your Srijan account and agree to share your Aadhaar details. You're verified on the spot and can start accepting jobs. If you'd rather not use DigiLocker, the Srijan team will verify your documents by hand.",
  },
  {
    q: "Does a creator need a bank account or UPI ID to start?",
    a: `No. Verify yourself and you can go online and accept jobs straight away. Add your bank account or UPI ID whenever you like — Srijan needs it only to send your earnings, which wait in your wallet until it's there.`,
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
