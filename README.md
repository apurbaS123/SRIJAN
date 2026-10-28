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
| `node scripts/smoke.mjs` | End-to-end check of every flow against a running server (resets demo data; set `BASE` if not on port 3000) |
| `npm run reset-data` | Wipe demo data (re-seeded on next request) |

Data is stored in `.data/db.json`. Delete it any time to start fresh.

## Try the full flow (10 minutes)

1. Open **/login** and sign in as **Priya Sharma** (client). Book a Quick Reel in Zoo Road, Guwahati.
2. In a second browser (or private window), sign in as **Ankita Baruah** (creator). The job alert appears within 2 seconds with a 5-minute countdown. Accept it.
3. Back as Priya: the booking shows Ankita and a 4-digit start code.
4. As Ankita: open the job, type the code, tap **Demo: I'm at the address**, finish the shoot, paste any video link and deliver.
5. As Priya: approve (or ask for the one free revision). Ankita's wallet gets 80%.
6. Sign in as **Srijan Ops**: watch live dispatch, assign or refund bookings nobody accepted, move campaigns through the pipeline, approve new creators and run payouts. Use the **time travel** buttons (+5 min, +1 day…) to test timers without waiting.

To see the "nobody accepted" path, book in **Silchar** (no creators there yet) and press **+5 min** on the ops dashboard.

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
src/lib/server/      Storage (JSON file) and the API wrapper
src/app/api/         REST API used by the screens (and later the mobile app)
src/app/             Screens: client, brand, creator (/creator) and ops (/ops)
tests/               Unit tests
scripts/smoke.mjs    End-to-end test
```

All time-based rules (offer expiry, widening, auto-approve) run lazily on each request, so there are no background jobs to host.

## From prototype to production

| Prototype | Replace with |
| --- | --- |
| Demo account picker | Phone OTP login (e.g. Firebase Auth or MSG91) |
| JSON file storage | PostgreSQL — the arrays in `types.ts` map 1:1 to tables; swap `loadDb/saveDb` in `src/lib/server/store.ts` |
| Simulated payment | Razorpay or Cashfree with split settlements / escrow, so client money is held until approval |
| Creator polling every 2 s | Push notifications (FCM) **plus SMS or auto-call fallback after 60 s**, so creators don't miss alerts |
| Zone centre points | Google Maps / Ola Maps geocoding and live location |
| Video link | Direct upload to cloud storage with watermarked previews |
| KYC checkboxes | DigiLocker (Aadhaar) and PAN verification APIs |
| Ledger totals | GST invoices, and TDS/TCS handling — confirm obligations with your CA |
| Single process lock | Database transactions (the "first to accept" check) |

Prices are suggested starting points, not market data — adjust them in `config.ts` after talking to creators and clients.
