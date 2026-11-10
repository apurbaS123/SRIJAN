# Srijan — creator marketplace prototype

A working prototype of the Srijan web app: clients book same-day video shoots, brands book managed influencer campaigns, creators take jobs and get paid, and the Srijan team runs dispatch, campaigns and payouts.

Built with **Next.js 15 (App Router) + TypeScript**. Payments run through Razorpay. KYC and phone notifications aren't connected yet.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the business rules (dispatch, money, campaigns) |
| `npm run typecheck` | TypeScript check |
| `npm run build && npm start` | Production build |
| `npm run smoke` | Production build, then an end-to-end check of every flow (83 checks). Runs its own server on a free port with a throwaway data file and email off, so it never touches your data or sends messages. Set `SMOKE_DATABASE_URL` to a throwaway **local** Postgres to run it on the Postgres store instead (it wipes the `srijan` schema there) |
| `TEST_DATABASE_URL=… npm test` | Also runs the Postgres store tests against a throwaway **local** database (skipped otherwise) |
| `npm run reset-data` | Wipe all local data (starts again with an empty marketplace) |

Data is stored in `.data/db.json`. Delete it any time to start fresh.

## Sign-in and roles

Everyone signs in at **/login**. The first time, they prove their email with a 6-digit code (sent through [Brevo](https://www.brevo.com)) and choose a password; after that they can use their email and password. An email code always works too, and is how a forgotten password gets replaced. Older accounts, and brand accounts made from a call request, are asked to add a password at their next code sign-in. Only a salted scrypt hash is stored, and 10 wrong passwords lock password sign-in for 15 minutes. New accounts also give a mobile number, used only so clients, creators and the team can call each other. The account decides what they can open:

| Account | How it's created | Lands on |
| --- | --- | --- |
| Srijan team (ops) | Any address listed in `SRIJAN_OPS_EMAILS`. Checked on every request, so removing an address takes away access at once. | `/ops` |
| Creator | Signing up at **/join** (email verified with a code) | `/creator` |
| Client / brand | Signing in with a new email at **/login**, or booking a strategy call at **/brands** (email verified with a code) | `/bookings` |

Without Brevo set up, `npm run dev` prints each sign-in code in the server log. In production, sign-in needs the email settings below.

## Try the full flow

1. Put your own email in `SRIJAN_OPS_EMAILS` in `.env.local` and sign in at **/login**: you land on the ops dashboard.
2. In a private window, sign up a creator at **/join** with a second email, then approve them as ops under **Creators**.
3. In another window, sign in at **/login** with a third email (a client account is created) and book a job. Nothing is paid yet: only creators in that field get the alert, within 2 seconds, with a 5-minute countdown.
4. As the creator: **accept** the job. You are told the client has to pay, and you get nothing about them yet.
5. As the client: the booking page now shows **Pay ₹X** (and the request is emailed to you). Pay with [Razorpay's test details](https://razorpay.com/docs/payments/payments/test-card-details/). Both sides immediately get the other's phone number, and the creator gets the exact address.
6. As the creator: upload proof of work to the Drive folder and press **Mark As Finished**.
7. As the client: press **Mark As Approved** (or report a problem). The job appears under **Creators to pay** on the ops page, for 80% of the price.

## Payments

`src/lib/server/razorpay.ts` and `src/lib/server/payments.ts`

**Money is only asked for once a creator has taken the job.** The order of events is: book → a creator
accepts → the client pays → the two sides are introduced.

1. **/book** creates one job per service and starts the search at once. Nothing is charged, and no
   Razorpay order exists yet. Each service is paid for on its own, when its own creator accepts.
2. A creator accepting (or ops assigning one by hand) puts the job in **awaiting_payment**: their slot
   is held, and the client is asked to pay — on the booking page, as a notification, on their phone if
   push is on, and by email (so they can be away from the site).
3. Pressing **Pay** calls `/api/payments/order`, which creates the Razorpay order and opens Razorpay
   Checkout. Pressing it again re-uses the same order.
4. Razorpay's confirmation arrives two ways: from the browser (`/api/payments/verify`) and from
   Razorpay's servers (`/api/payments/webhook`), so a client who closes the page right after paying is
   still covered. Either one confirms the job, once: it becomes **assigned**, and only then do the two
   sides get each other's phone number and the creator the exact address.
5. If the money doesn't arrive within **30 minutes** (or by the job's start time, if that's sooner) the
   job is dropped and the creator released — nobody is charged and there is nothing to refund. A
   payment that lands after that goes under **Refunds to send**.
6. A client can cancel for free any time before they pay, including while a creator waits. Once paid,
   only ops can stop the job, and that goes under **Refunds to send**. Razorpay isn't used for refunds
   (see the last step).
7. **Creator payouts are manual:** approved jobs and settled campaigns appear under **Creators to pay** on the ops page with the creator's bank or UPI details. Send the money, then mark it paid. To automate this later with RazorpayX or Route, start at `src/lib/domain/payouts.ts`.
8. **Refunds are manual too, and don't go through Razorpay:** a refunded booking appears under **Refunds to send** on the ops page with the amount and the client's contact details. Send the money, then mark it as sent. The site can't check this, so marking it is a promise to the client. Only jobs that were actually paid for are ever listed — a job dropped before payment owes nothing. Completed jobs aren't listed.

Add to `.env.local` and to Vercel:

```
RAZORPAY_KEY_ID=rzp_test_...       # Razorpay dashboard → Account & Settings → API Keys
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...        # any long random string; enter the same one in the webhook below
SRIJAN_PROOF_DRIVE_URL=https://drive.google.com/...   # where creators upload proof of work
```

In the Razorpay dashboard, add a webhook pointing to `https://YOUR-DOMAIN/api/payments/webhook` with the events `payment.authorized`, `payment.captured` and `order.paid`. Test mode and live mode have separate keys and webhooks.

Until the keys are set, the site refuses new bookings rather than taking them unpaid.

## How dispatch works

`src/lib/domain/dispatch.ts`

1. **Every** available, verified creator who offers that service, has linked a bank or UPI and is within **10 km** is alerted at once, with **5 minutes** to accept. First to accept wins. Online jobs have no distance limit.
2. At **minute 3** the search widens to **25 km** (same window).
3. Creators who come online during the window are alerted too.
4. Nobody by minute 5 → booking moves to **ops**, who assign by hand or drop it. The alerts stay open, so a creator can still take it.
5. Whoever accepts — a creator or ops on their behalf — the job then waits for the client's payment before it is really theirs.

Creators are never alerted for a job that clashes with one they already have, or beyond their own travel distance.

## Business rules — change them in one file

`src/lib/domain/config.ts` holds every number: package prices, the 80/20 split, dispatch timings and radii, on-site notice (1 hour, none online) and how far ahead (90 days), job hours, auto-approve (48 h), how long the client has to pay once a creator accepts (30 min), campaign commission (30–35%), cities and areas.

## Code map

```
src/lib/domain/      Business logic — plain TypeScript, no framework, fully tested
  types.ts           Data model (users, creators, bookings, offers, ledger, campaigns)
  config.ts          All business rules and launch cities
  dispatch.ts        Finding a creator (5-minute rule)
  bookings.ts        Job lifecycle (book, pay after accepting, approve) and the money split
  campaigns.ts       Managed campaigns and commission
  payouts.ts         What Srijan owes creators (paid by hand for now)
  notifications.ts   Demo notifications; add real phone push here
  creators.ts        Sign-up, availability, verification
  views.ts           What each role is allowed to see
src/lib/server/      Storage (Postgres or JSON file) and the API wrapper
src/app/api/         REST API used by the screens (and later the mobile app)
src/app/             Screens: client, brand, creator (/creator) and ops (/ops)
tests/               Unit tests
scripts/smoke.mjs    End-to-end test
```

All time-based rules (offer expiry, widening, auto-approve) run lazily on each request, so there are no background jobs to host.

## From prototype to production

| Prototype | Replace with |
| --- | --- |
| Every request loads all records and takes one lock | Queries that read only what a request needs, so requests stop waiting on each other as traffic grows |
| Manual creator payouts | RazorpayX Payouts or Razorpay Route |
| Demo on-site notifications | Push notifications (see `notifications.ts`) |
| Creator polling every 2 s | Push notifications (FCM) **plus SMS or auto-call fallback after 60 s**, so creators don't miss alerts |
| Zone centre points | Google Maps / Ola Maps geocoding and live location |
| Shared Drive folder for proof of work | Direct upload to cloud storage |
| KYC checkboxes | DigiLocker (Aadhaar) and PAN verification APIs |
| Ledger totals | GST invoices, and TDS/TCS handling — confirm obligations with your CA |
| Single process lock | Database transactions (the "first to accept" check) |

Prices are suggested starting points, not market data — adjust them in `config.ts` after talking to creators and clients.

## Alerts to the Srijan team

Four things are emailed to every address in `SRIJAN_OPS_EMAILS`: a new booking (package, time, address, client contact, brief, and the amount the client will owe once a creator accepts), a job that has just been paid for and confirmed (with the creator and what they earn), a brand campaign request (brand, contact, call time, goal, regions, budget), and a job that starts in 20 minutes (who the creator is and their number, whether it has been paid for, or that nobody has taken it).

Clients get one email of their own: **a creator took your job, please pay**, with the amount, the
deadline and a link straight to the booking (`SRIJAN_SITE_URL` makes that link right). They need `BREVO_API_KEY` and `EMAIL_FROM`, the same settings sign-in codes use. With no config, alerts are skipped; failures are logged and never block a booking.

## Phone notifications

Every message the app creates goes through `notifyUser`, and each one is also pushed to the person's
phone with the [Web Push](https://developer.mozilla.org/docs/Web/API/Push_API) protocol, so a creator
gets a job alert with Srijan closed. People turn it on per device from the card on **/creator** or
**/ops**; `public/sw.js` shows the notification and opens the job when it is tapped.

Generate a key pair once and set all three (see Production setup):

```
node --input-type=module -e "import {generateVAPIDKeys} from 'web-push'; console.log(generateVAPIDKeys())"
```

On **iPhone this only works once Srijan is added to the home screen** (iOS 16.4+); the card says so
when it detects an iPhone that hasn't. Android, desktop Chrome, Edge and Firefox need no install.
With no keys set, push is skipped and the in-app pop-up still works.

## Production setup

Set these on your host (Vercel → Settings → Environment Variables, or the server's environment):

| Variable | What it is |
| --- | --- |
| `SESSION_SECRET` | **Required.** Random string, 32+ characters, used to sign login cookies. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out. |
| `BREVO_API_KEY` | **Required for sign-in.** A Brevo API key (Brevo → SMTP & API → API Keys). Sign-in codes are emailed with it. |
| `EMAIL_FROM` | **Required for sign-in.** The address codes come from. It must be a sender verified in Brevo (Senders, Domains & Dedicated IPs); verifying your domain keeps codes out of spam. |
| `EMAIL_FROM_NAME` | Optional sender name shown in the inbox (default `Srijan`). |
| `SRIJAN_OPS_EMAILS` | Comma-separated email addresses of the Srijan team. Only these get ops (admin) access, and alerts are emailed to them. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Phone notifications. The public key is sent to the browser, the private key is a secret, and the subject is a `mailto:` address push services can reach you at. Without them push is skipped. |
| `POSTGRES_URL`, `DATABASE_URL` or `STORAGE_POSTGRES_URL` | Postgres connection. Set automatically when you connect Supabase to the Vercel project. The app creates its tables in the `srijan` schema on first use (see below). |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | **Required to take bookings.** See Payments above. |
| `SRIJAN_SITE_URL` | Where the site lives, e.g. `https://srijan.example`, used for the link in the "please pay" email. On Vercel the production URL is picked up automatically; set this to override it. |
| `SRIJAN_PROOF_DRIVE_URL` | The Drive folder creators upload proof of work to. Only shown to a creator with a job in progress. |
| `SRIJAN_DATA_FILE` | Only without Postgres: where the JSON file is stored (default `.data/db.json`). Must be on a persistent disk. |

Notes:

- The app starts with an empty database. Sign in once with an address from `SRIJAN_OPS_EMAILS` to get the first ops account.
- Rate limits are kept in memory, per server process.
- With `POSTGRES_URL` set (e.g. Vercel + Supabase), data lives in Postgres and each request locks it while it runs, so it is safe on serverless hosts. Without it, the app uses the JSON file, which needs a single long-running server with a persistent disk and will fail on Vercel.
- **Postgres tables** (schema `srijan`, not exposed by Supabase's public API, row level security on): `users`, `creators`, `bookings`, `offers`, `ledger`, `campaigns`, `sign_in_codes`, `notifications` and `meta`. Each row keeps the full record in `data` (jsonb), which is what the app reads and writes; the other columns (name, email, status, totals, dates…) are generated from it by Postgres for browsing and SQL, and can't drift. In Supabase: Table Editor → schema `srijan`. Defined in `src/lib/server/pg.ts`.
- Data from the earlier single-row store (`srijan.state`) is copied into the tables automatically on first run. `srijan.state` is left untouched as a backup; drop it once you're happy (`drop table srijan.state;`).
- Creators' bank details are stored in the database so ops can pay them. Only the ops page shows them in full. Limit who has access to Supabase accordingly.
