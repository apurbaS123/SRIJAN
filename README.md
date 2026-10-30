# Srijan — creator marketplace prototype

A working prototype of the Srijan web app: clients book same-day video shoots, brands book managed influencer campaigns, creators take jobs and get paid, and the Srijan team runs dispatch, campaigns and payouts.

Built with **Next.js 15 (App Router) + TypeScript**. No external services needed — payments, KYC and notifications are simulated so the whole flow runs on one laptop.

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
| `npm run smoke` | Production build, then an end-to-end check of every flow (80 checks). Runs its own server on a free port with a throwaway data file and WhatsApp off, so it never touches your data or sends messages |
| `npm run reset-data` | Wipe all local data (starts again with an empty marketplace) |

Data is stored in `.data/db.json`. Delete it any time to start fresh.

## Sign-in and roles

Everyone signs in at **/login** with a 6-digit code sent to their WhatsApp. The account decides what they can open:

| Account | How it's created | Lands on |
| --- | --- | --- |
| Srijan team (ops) | Any number listed in `SRIJAN_OPS_PHONES`. Checked on every request, so removing a number takes away access at once. | `/ops` |
| Creator | Signing up at **/join** (verified on WhatsApp) | `/creator` |
| Client / brand | Signing in with a new number at **/login**, or booking a strategy call at **/brands** (verified on WhatsApp) | `/bookings` |

Without WhatsApp set up, `npm run dev` prints each sign-in code in the server log. In production, sign-in needs the WhatsApp settings below.

## Try the full flow

1. Put your own number in `SRIJAN_OPS_PHONES` in `.env.local` and sign in at **/login**: you land on the ops dashboard.
2. In a private window, sign up a creator at **/join** with a second number, then approve them as ops under **Creators**.
3. In another window, sign in at **/login** with a third number (a client account is created) and book a shoot. The creator gets the job alert within 2 seconds with a 5-minute countdown.
4. As the creator: accept, open the job, type the client's 4-digit start code, check in with GPS at the address, finish the shoot, paste a video link and deliver.
5. As the client: approve (or ask for the one free revision). The creator's wallet gets 80%.

## How dispatch works

`src/lib/domain/dispatch.ts`

1. If the client picked a creator, only that creator is alerted for **5 minutes**.
2. Then **every** available, verified creator within **10 km** is alerted at once, with **5 minutes** to accept. First to accept wins.
3. At **minute 3** the search widens to **25 km** (same window).
4. Creators who come online during the window are alerted too.
5. Nobody by minute 5 → booking moves to **ops**, who assign by hand or refund.

Creators are never alerted for a job that clashes with one they already have, or beyond their own travel distance.

## Business rules — change them in one file

`src/lib/domain/config.ts` holds every number: package prices, GST, the 80/20 split, dispatch timings and radii, 2-hour notice, shoot hours, check-in radius (200 m), delivery SLA (24 h), auto-approve (48 h), late penalty (10% per 6 h, max 50%), free revisions, campaign commission (30–35%), payout minimum and instant fee, cities and areas.

## Code map

```
src/lib/domain/      Business logic — plain TypeScript, no framework, fully tested
  types.ts           Data model (users, creators, bookings, offers, ledger, campaigns)
  config.ts          All business rules and launch cities
  dispatch.ts        Finding a creator (5-minute rule)
  bookings.ts        Shoot lifecycle and money split
  campaigns.ts       Managed campaigns and commission
  wallet.ts          Creator balances and withdrawals
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
| Whole marketplace in one Postgres row | Real tables (the arrays in `types.ts` map 1:1) once traffic grows, so requests stop waiting on one lock |
| Simulated payment | Razorpay or Cashfree with split settlements / escrow, so client money is held until approval |
| Creator polling every 2 s | Push notifications (FCM) **plus SMS or auto-call fallback after 60 s**, so creators don't miss alerts |
| Zone centre points | Google Maps / Ola Maps geocoding and live location |
| Video link | Direct upload to cloud storage with watermarked previews |
| KYC checkboxes | DigiLocker (Aadhaar) and PAN verification APIs |
| Ledger totals | GST invoices, and TDS/TCS handling — confirm obligations with your CA |
| Single process lock | Database transactions (the "first to accept" check) |

Prices are suggested starting points, not market data — adjust them in `config.ts` after talking to creators and clients.

## WhatsApp booking alerts

Every new shoot booking (package, time, address, client contact, brief, amount paid, start code) and brand campaign request (brand, contact, call time, goal, regions, budget) is sent to your WhatsApp via the [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started). Add to `.env.local`:

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

Set these on your host (Vercel → Settings → Environment Variables, or the server's environment), in addition to the WhatsApp alert settings above:

| Variable | What it is |
| --- | --- |
| `SESSION_SECRET` | **Required.** Random string, 32+ characters, used to sign login cookies. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out. |
| `WHATSAPP_OTP_TEMPLATE` | **Required for sign-in.** Name of an approved WhatsApp *Authentication* template (copy-code button). Sign-in codes are sent with it. |
| `SRIJAN_OPS_PHONES` | Comma-separated mobile numbers of the Srijan team. Only these numbers get ops (admin) access. |
| `POSTGRES_URL` or `DATABASE_URL` | Postgres connection. Set automatically when you connect Supabase to the Vercel project. The app creates its table (`srijan.state`) on first use. |
| `SRIJAN_DATA_FILE` | Only without Postgres: where the JSON file is stored (default `.data/db.json`). Must be on a persistent disk. |

Notes:

- The app starts with an empty database. Sign in once with a number from `SRIJAN_OPS_PHONES` to get the first ops account.
- Rate limits are kept in memory, per server process.
- With `POSTGRES_URL` set (e.g. Vercel + Supabase), data lives in Postgres and each request locks it while it runs, so it is safe on serverless hosts. Without it, the app uses the JSON file, which needs a single long-running server with a persistent disk and will fail on Vercel.
- Payments are still mocked: bookings are marked paid without charging. Connect Razorpay/Cashfree before taking real bookings.
