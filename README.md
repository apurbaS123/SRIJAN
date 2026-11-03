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
| `npm run smoke` | Production build, then an end-to-end check of every flow (83 checks). Runs its own server on a free port with a throwaway data file and email and WhatsApp off, so it never touches your data or sends messages. Set `SMOKE_DATABASE_URL` to a throwaway **local** Postgres to run it on the Postgres store instead (it wipes the `srijan` schema there) |
| `TEST_DATABASE_URL=… npm test` | Also runs the Postgres store tests against a throwaway **local** database (skipped otherwise) |
| `npm run reset-data` | Wipe all local data (starts again with an empty marketplace) |

Data is stored in `.data/db.json`. Delete it any time to start fresh.

## Sign-in and roles

Everyone signs in at **/login** with a 6-digit code sent to their email (through [Brevo](https://www.brevo.com)). New accounts also give a mobile number, used only so clients, creators and the team can call each other. The account decides what they can open:

| Account | How it's created | Lands on |
| --- | --- | --- |
| Srijan team (ops) | Any address listed in `SRIJAN_OPS_EMAILS`. Checked on every request, so removing an address takes away access at once. | `/ops` |
| Creator | Signing up at **/join** (email verified with a code) | `/creator` |
| Client / brand | Signing in with a new email at **/login**, or booking a strategy call at **/brands** (email verified with a code) | `/bookings` |

Without Brevo set up, `npm run dev` prints each sign-in code in the server log. In production, sign-in needs the email settings below.

## Try the full flow

1. Put your own email in `SRIJAN_OPS_EMAILS` in `.env.local` and sign in at **/login**: you land on the ops dashboard.
2. In a private window, sign up a creator at **/join** with a second email, then approve them as ops under **Creators**.
3. In another window, sign in at **/login** with a third email (a client account is created), book a job and pay with [Razorpay's test details](https://razorpay.com/docs/payments/payments/test-card-details/). Only creators in that field get the alert, within 2 seconds, with a 5-minute countdown.
4. As the creator: accept, upload proof of work to the Drive folder and press **Mark As Finished**.
5. As the client: press **Mark As Approved** (or report a problem). The job appears under **Creators to pay** on the ops page, for 80% of the price.

## Payments

`src/lib/server/razorpay.ts` and `src/lib/server/payments.ts`

1. **/book** creates an unpaid booking and a Razorpay order, then opens Razorpay Checkout. Nobody is alerted yet.
2. Razorpay's confirmation arrives two ways: from the browser (`/api/payments/verify`) and from Razorpay's servers (`/api/payments/webhook`), so a client who closes the page right after paying is still covered. Either one starts the search for a creator, once.
3. Unpaid bookings are dropped after 30 minutes. A payment that lands after that goes under **Refunds to send**.
4. Client cancellations and ops refunds go under **Refunds to send** too. Nothing is sent to Razorpay automatically (see step 6).
5. **Creator payouts are manual:** approved jobs and settled campaigns appear under **Creators to pay** on the ops page with the creator's bank or UPI details. Send the money, then mark it paid. To automate this later with RazorpayX or Route, start at `src/lib/domain/payouts.ts`.
6. **Refunds are manual too:** a cancelled or refunded booking appears under **Refunds to send** on the ops page with its Razorpay payment ID. Refund it in the Razorpay dashboard, then mark it as sent. The site checks with Razorpay and refuses if less than the full amount has gone back. Completed jobs aren't listed: refund those in the dashboard directly.

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

1. If the client picked a creator, only that creator is alerted for **5 minutes**.
2. Then **every** available, verified creator who offers that service, has linked a bank or UPI and is within **10 km** is alerted at once, with **5 minutes** to accept. First to accept wins. Online jobs have no distance limit.
3. At **minute 3** the search widens to **25 km** (same window).
4. Creators who come online during the window are alerted too.
5. Nobody by minute 5 → booking moves to **ops**, who assign by hand or refund.

Creators are never alerted for a job that clashes with one they already have, or beyond their own travel distance.

## Business rules — change them in one file

`src/lib/domain/config.ts` holds every number: package prices, the 80/20 split, dispatch timings and radii, 2-hour notice, job hours, auto-approve (48 h), the unpaid-booking window (30 min), campaign commission (30–35%), cities and areas.

## Code map

```
src/lib/domain/      Business logic — plain TypeScript, no framework, fully tested
  types.ts           Data model (users, creators, bookings, offers, ledger, campaigns)
  config.ts          All business rules and launch cities
  dispatch.ts        Finding a creator (5-minute rule)
  bookings.ts        Shoot lifecycle and money split
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

## WhatsApp booking alerts

Every paid booking (package, time, address, client contact, brief, amount paid) and brand campaign request (brand, contact, call time, goal, regions, budget) is sent to your WhatsApp via the [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started). Add to `.env.local`:

```
WHATSAPP_TOKEN=...              # permanent System User access token
WHATSAPP_PHONE_NUMBER_ID=...    # the sending business number's ID (WhatsApp > API Setup)
WHATSAPP_NOTIFY_TO=919876543210 # your number with country code; comma-separate several
# Optional, recommended: an approved Utility template with one body variable {{1}}
WHATSAPP_TEMPLATE=new_booking
WHATSAPP_TEMPLATE_LANG=en
```

Without `WHATSAPP_TEMPLATE`, alerts go as plain text, which WhatsApp only delivers if your number has messaged the business number in the last 24 hours. With no config, alerts are skipped. Failures are logged and never block a booking.

## Production setup

Set these on your host (Vercel → Settings → Environment Variables, or the server's environment), in addition to the optional WhatsApp alert settings above:

| Variable | What it is |
| --- | --- |
| `SESSION_SECRET` | **Required.** Random string, 32+ characters, used to sign login cookies. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out. |
| `BREVO_API_KEY` | **Required for sign-in.** A Brevo API key (Brevo → SMTP & API → API Keys). Sign-in codes are emailed with it. |
| `EMAIL_FROM` | **Required for sign-in.** The address codes come from. It must be a sender verified in Brevo (Senders, Domains & Dedicated IPs); verifying your domain keeps codes out of spam. |
| `EMAIL_FROM_NAME` | Optional sender name shown in the inbox (default `Srijan`). |
| `SRIJAN_OPS_EMAILS` | Comma-separated email addresses of the Srijan team. Only these get ops (admin) access. |
| `POSTGRES_URL` or `DATABASE_URL` | Postgres connection. Set automatically when you connect Supabase to the Vercel project. The app creates its tables in the `srijan` schema on first use (see below). |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | **Required to take bookings.** See Payments above. |
| `SRIJAN_PROOF_DRIVE_URL` | The Drive folder creators upload proof of work to. Only shown to a creator with a job in progress. |
| `SRIJAN_DATA_FILE` | Only without Postgres: where the JSON file is stored (default `.data/db.json`). Must be on a persistent disk. |

Notes:

- The app starts with an empty database. Sign in once with an address from `SRIJAN_OPS_EMAILS` to get the first ops account.
- Rate limits are kept in memory, per server process.
- With `POSTGRES_URL` set (e.g. Vercel + Supabase), data lives in Postgres and each request locks it while it runs, so it is safe on serverless hosts. Without it, the app uses the JSON file, which needs a single long-running server with a persistent disk and will fail on Vercel.
- **Postgres tables** (schema `srijan`, not exposed by Supabase's public API, row level security on): `users`, `creators`, `bookings`, `offers`, `ledger`, `campaigns`, `sign_in_codes`, `notifications` and `meta`. Each row keeps the full record in `data` (jsonb), which is what the app reads and writes; the other columns (name, email, status, totals, dates…) are generated from it by Postgres for browsing and SQL, and can't drift. In Supabase: Table Editor → schema `srijan`. Defined in `src/lib/server/pg.ts`.
- Data from the earlier single-row store (`srijan.state`) is copied into the tables automatically on first run. `srijan.state` is left untouched as a backup; drop it once you're happy (`drop table srijan.state;`).
- Creators' bank details are stored in the database so ops can pay them. Only the ops page shows them in full. Limit who has access to Supabase accordingly.
