# LA Tickets

Online ticket booking for LA events. Built with Next.js 16 (App Router), TypeScript, MongoDB + Prisma 6, and Stripe Checkout.

## Setup

1. Create a free **MongoDB Atlas** cluster. Prisma needs a replica set, which Atlas has by default.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `TICKET_SECRET` and `CRON_SECRET`.
3. Install, create indexes, and retire any old test listings:

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Checkout requires a live `STRIPE_SECRET_KEY` and live `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Missing or test keys disable payments; there is no simulated/free confirmation path.

### Stripe (live payments)

Configure your live keys in `.env`. Optionally configure a live webhook for `/api/stripe/webhook` and its `STRIPE_WEBHOOK_SECRET`. Orders also reconcile directly with Stripe after checkout. Only paid live sessions issue tickets.

## How booking works

1. **Hold**: `createHold` (`src/lib/booking.ts`) atomically decrements `TicketType.available`
   with `updateMany({ where: { available: { gte: qty } } })`. If two buyers race for the last ticket, only one succeeds.
   If any ticket type in the order is short, the ones already taken are returned.
2. **Pay**: A PENDING order is created with a 30-minute hold, and the buyer is sent to Stripe Checkout.
3. **Confirm**: `checkout.session.completed` hits `/api/stripe/webhook` → `confirmOrder` marks the order PAID and
   issues tickets with QR codes. It's idempotent, and ticket codes are deterministic, so webhook retries can't duplicate tickets.
   If a hold expired before payment arrived and the tickets have since sold out, the payment is refunded automatically.
4. **Release**: Cancelled checkouts, `checkout.session.expired` events, and `/api/cron/expire-holds` put held tickets
   back on sale. Stale holds are also cleared before every new checkout.

Guests view their tickets at `/orders/[id]?t=<accessToken>`. The token is the secret in that link.

## Notes

- Schema changes: `npm run db:push` (Prisma Migrate doesn't support MongoDB).
- `vercel.json` runs the expiry cron every 5 minutes. Vercel's Hobby plan only allows daily crons, so use Pro or an
  external scheduler there. Checkout already clears stale holds, so this is a backstop.
- `npm run db:seed` retires known test listings without deleting historical orders or creating demo inventory.

## Roadmap

- Email tickets (Resend) after payment
- Accounts (Auth.js) and a "My tickets" page
- Admin: create and edit events and ticket types, view sales
- Door check-in scanner (mark `Ticket.checkedInAt`)

## Ticketmaster events and prices

Set `TICKETMASTER_API_KEY` in `.env` using your Ticketmaster developer key, then run:

```bash
npx prisma generate
npm run tm:sync
```

The import covers upcoming US performances through 2099 for the 18 featured artists,
teams, and shows in `prisma/ticketmaster.ts`. An optional `TICKETMASTER_KEYWORD` limits
it to one search. This is not Ticketmaster's entire worldwide catalog. Date windows
are split to retrieve results beyond the API's 1,000-result paging limit. Overlapping
searches are deduplicated, and existing unrelated events are preserved.

Australian events: `npm run tm:australia` imports every Ticketmaster Australia event
(music, sports, arts) for the next 365 days. For other countries, pass
`--country=XX --all --days=N` to `prisma/ticketmaster.ts`. New events have no tickets
until you run `prisma/enable-unlimited-tickets.ts` (or add ticket types in `/admin/events`).

Events store venue, date, description, image URL, purchase link, and the published
standard price range (or the first available range), currency, and check time.
Missing prices display “Check price on Ticketmaster”. Prices are snapshots, not
live seat inventory; purchases continue on Ticketmaster. Run the sync again to
refresh imported listings and prices. No purchasable local ticket inventory is created.

### Import public pages without an API key

```bash
npm run tm:scan
npm run tm:import-public
```

The scan reads the public HTML of all 18 configured listing pages and follows their
pagination. It saves a reviewable snapshot with source URLs in
`prisma/data/ticketmaster-public.json`. The import updates matching events in the
configured database and preserves unrelated events and local ticket inventory.

Only explicitly published prices in the public page's structured offers are saved.
Missing prices remain unavailable; reviews and guessed prices are never used.
The snapshot records incomplete scans instead of claiming full coverage. Refresh
requires rerunning these commands; the snapshot is not a live availability feed.

## On-site checkout

Available local ticket inventory now opens Stripe Embedded Checkout at
`/orders/[id]/checkout`. Customers enter card details in Stripe's embedded form
and return to their private order page on this site. The server then asks Stripe
(with the secret key) whether the session was paid, and confirms the order and issues
tickets; a browser redirect alone never marks an order paid. Unpaid orders are also
checked with Stripe when a customer opens their bookings, and before any expired hold
is released, so a buyer who pays and closes the tab still gets their tickets
(`src/lib/payments.ts`).

Configure matching `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
`STRIPE_WEBHOOK_SECRET` is optional: with a webhook at `/api/stripe/webhook`
(events `checkout.session.completed` and `checkout.session.expired`) orders are
confirmed instantly even if the buyer never comes back. Use Stripe test keys for
payment testing. No live payment was submitted during this implementation.

The public scan supplied event details, but no usable ticket prices or inventory.
Those events display “Booking unavailable” until confirmed ticket types, prices,
and quantities are added through `/admin/events`. A copied listing or a locally
generated QR code does not create a ticket accepted by the original organizer.
External purchase buttons have been removed from event discovery and event pages.


Customer bookings: `/account/login` supports registration and sign-in; `/account` lists customer orders. New bookings require a server-validated customer session and use that account's email. Ticket types and hotel room prices are stored as USD base cents. Ticket types can also set `priceAudCents` to lock an Australian price; Olivia Dean Sydney is fixed at AUD 150. Australian events (country AU/AUS/Australia, or a legacy Australia/* timezone) display and charge AUD using Frankfurter daily reference rates, cached for one hour. US events use USD. Signed 30-minute quotes lock the displayed rate and ticket prices through checkout; unavailable/stale rates block AUD checkout. Orders store their currency and exchange rate, so historical USD amounts remain USD. Admin price fields accept USD base prices. Imported events still need actual inventory before sales open. Stripe Checkout sets `payment_intent_data.receipt_email` and a booking reference/event description to email successful live-payment receipts. Test payments do not automatically email receipts. The webhook is optional; see above.

Order session uniqueness uses a MongoDB partial unique index, allowing multiple orders before Stripe assigns their session IDs. Run npm run db:indexes for existing databases; npm run db:push also applies it. Do not add @unique back to Order.stripeSessionId, which would restrict null/missing session IDs to a single order.


Olivia Dean Sydney listings (9 and 10 October 2026): run `node --import tsx --env-file=.env prisma/add-olivia-dean.ts`. This idempotent script creates each listing with a fixed AUD 150 ticket price and zero stock; add confirmed inventory in admin before sales open. Dates, 7:30 PM starts, and venue details were checked against https://afterpayarena.com.au/event/olivia-dean. Regenerate Prisma after pulling the currency schema changes (`npx prisma generate`); MongoDB historical documents use USD/1 defaults without repricing existing orders.
